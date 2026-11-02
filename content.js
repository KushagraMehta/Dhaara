// Reads the Mix or playlist the user is looking at straight from the page.
// Personal Mixes (list=RD...) are not exposed by any YouTube API, so the DOM is the only source.

const TIME_RE = /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function text(el) {
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

// Joins text nodes with spaces, so "Noor" + "and Khan" does not become "Noorand Khan".
function leafText(el) {
  if (!el) return '';
  const parts = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode.nodeValue.trim();
    if (t) parts.push(t);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function seconds(str) {
  const m = (str || '').match(TIME_RE);
  if (!m) return null;
  return m[0].split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

function videoIdFrom(href) {
  if (!href) return null;
  try {
    return new URL(href, location.origin).searchParams.get('v');
  } catch {
    return null;
  }
}

function dedupe(tracks) {
  const seen = new Set();
  return tracks.filter(t => {
    if (!t.title) return false;
    const key = t.videoId || `${t.title}|${t.channel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// www.youtube.com/watch?...&list=... : the queue panel beside the video.
function fromWatchPanel() {
  const panel = document.querySelector('ytd-playlist-panel-renderer#playlist') ||
    document.querySelector('ytd-playlist-panel-renderer');
  const rows = panel ? [...panel.querySelectorAll('ytd-playlist-panel-video-renderer')] : [];
  if (!rows.length) return null;
  const tracks = rows.map(el => {
    const t = el.querySelector('#video-title');
    return {
      videoId: videoIdFrom(el.querySelector('a#wc-endpoint, a[href*="/watch"]')?.getAttribute('href')),
      title: (t?.getAttribute('title') || text(t)).trim(),
      channel: text(el.querySelector('#byline')),
      durationSec: seconds(text(el.querySelector('ytd-thumbnail-overlay-time-status-renderer, badge-shape'))),
    };
  });
  const title = text(panel.querySelector('#header-description h3')) || text(panel.querySelector('.title'));
  return { title, tracks };
}

// www.youtube.com/playlist?list=... : YouTube moved these rows to yt-lockup-view-model in 2025;
// the old ytd-playlist-video-renderer is kept as a fallback.
function fromPlaylistPage(listId) {
  const old = [...document.querySelectorAll('ytd-playlist-video-list-renderer ytd-playlist-video-renderer')].map(el => {
    const t = el.querySelector('#video-title');
    return {
      videoId: videoIdFrom(t?.getAttribute('href')),
      title: (t?.getAttribute('title') || text(t)).trim(),
      channel: text(el.querySelector('ytd-channel-name #text, #channel-name a')),
      durationSec: seconds(text(el.querySelector('ytd-thumbnail-overlay-time-status-renderer, badge-shape'))),
    };
  });
  const lockups = [...document.querySelectorAll('yt-lockup-view-model')]
    .filter(l => l.querySelector(`a[href*="/watch"][href*="list=${listId}"]`))
    .map(l => {
      const h3 = l.querySelector('h3');
      const link = l.querySelector('a[href*="/watch"]');
      const idClass = [...(l.firstElementChild?.classList || [])].find(c => c.startsWith('content-id-'));
      const row = l.querySelector('[class*="MetadataRow"], .yt-content-metadata-view-model__metadata-row');
      return {
        videoId: idClass ? idClass.slice('content-id-'.length) : videoIdFrom(link?.getAttribute('href')),
        title: (h3?.getAttribute('title') || text(h3)).trim(),
        channel: leafText(row).replace(/\s*•.*$/, ''),
        durationSec: seconds(text(l.querySelector('badge-shape'))),
      };
    });
  const tracks = old.length ? old : lockups;
  if (!tracks.length) return null;
  const title = text(document.querySelector('yt-page-header-view-model h1, ytd-playlist-header-renderer h1')) ||
    document.title.replace(/\s*-\s*YouTube$/, '');
  return { title, tracks };
}

// Letters and digits only, lower case: the same song written slightly differently in two places compares equal.
const squash = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The song in the player bar of YouTube Music.
function musicBar() {
  const bar = document.querySelector('ytmusic-player-bar');
  const title = text(bar?.querySelector('.title'));
  const byline = bar?.querySelector('.byline');
  const channel = (byline?.getAttribute('title') || text(byline)).split('•')[0].trim();
  const durationSec = seconds(text(bar?.querySelector('.time-info')).split('/')[1]);
  return { title, channel, durationSec };
}

// music.youtube.com/watch : the "Up next" queue. Titles and artists here are already clean.
// Queue rows carry no video id of their own, but the song playing now has one (the URL's v). It is put on
// that row, so the row and the card are the same song (same key) and "Play from here" can find its place
// in the queue (review finding 3). The row is found by the page's own "selected" mark, else by comparing
// title and artist with the player bar.
function fromMusicQueue() {
  const rows = [...document.querySelectorAll('ytmusic-player-queue-item')]
    .filter(el => !el.closest('#counterpart-renderer, #automix-contents'));
  if (!rows.length) return null;
  const tracks = rows.map(el => {
    const t = el.querySelector('.song-title');
    const b = el.querySelector('.byline');
    const d = el.querySelector('.duration');
    return {
      videoId: null,
      title: (t?.getAttribute('title') || text(t)).trim(),
      channel: (b?.getAttribute('title') || text(b)).replace(/\s*•.*$/, '').trim(),
      durationSec: seconds(d?.getAttribute('title') || text(d)),
    };
  });
  const playingId = new URL(location.href).searchParams.get('v');
  if (playingId && !tracks.some(t => t.videoId === playingId)) {
    let at = rows.findIndex(el => el.hasAttribute('selected') || /^(playing|paused|loading)$/.test(el.getAttribute('play-button-state') || ''));
    if (at < 0) {
      const bar = musicBar();
      if (bar.title) at = tracks.findIndex(t => squash(t.title) === squash(bar.title) && squash(t.channel) === squash(bar.channel));
    }
    if (at >= 0) tracks[at].videoId = playingId;
  }
  const header = text(document.querySelector('ytmusic-queue-header-renderer'));
  const title = (header.match(/Playing from\s+(.*?)(?:\s+Save)?$/i)?.[1] || '').trim() || 'YouTube Music queue';
  return { title, tracks };
}

// music.youtube.com/playlist?list=... and album pages (/browse/MPREb...). Album rows have no
// artist column, so the artist comes from the page header.
function fromMusicPlaylist() {
  const rows = [...document.querySelectorAll('ytmusic-playlist-shelf-renderer ytmusic-responsive-list-item-renderer, ytmusic-shelf-renderer ytmusic-responsive-list-item-renderer')];
  if (!rows.length) return null;
  const headerArtist = text(document.querySelector('ytmusic-responsive-header-renderer .strapline-text, ytmusic-responsive-header-renderer .strapline a'));
  const tracks = rows.map(el => {
    const t = el.querySelector('.title-column .title, yt-formatted-string.title');
    const a = el.querySelector('.secondary-flex-columns yt-formatted-string');
    const link = el.querySelector('a[href*="watch?v="]');
    return {
      videoId: videoIdFrom(link?.getAttribute('href')),
      title: (t?.getAttribute('title') || text(t)).trim(),
      channel: (a?.getAttribute('title') || text(a)).replace(/\s*•.*$/, '').trim() || headerArtist,
      durationSec: seconds(text(el.querySelector('.fixed-column, .fixed-columns'))),
    };
  });
  const title = text(document.querySelector('ytmusic-responsive-header-renderer h1, ytmusic-detail-header-renderer .title, h1'));
  return { title: title || 'YouTube Music playlist', tracks };
}

// The song playing on a watch page. Inside a Mix the panel row is cleaner than the page title,
// and its duration is right even while an ad plays.
function currentVideo(tracks) {
  const url = new URL(location.href);
  const shortId = url.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
  if (shortId) return currentShort(shortId);
  if (url.pathname !== '/watch') return null;
  const videoId = url.searchParams.get('v');
  const credit = musicCredit();
  const fromList = videoId && tracks.find(t => t.videoId === videoId);
  if (credit) return { videoId, ...credit, durationSec: fromList?.durationSec ?? microdata(videoId)?.durationSec ?? null };
  if (fromList) return fromList;
  if (location.hostname === 'music.youtube.com') {
    const { title, channel, durationSec } = musicBar();
    return title ? { videoId, title, channel, durationSec } : null;
  }
  const meta = microdata(videoId);
  const title = text(document.querySelector('ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata h1')) || meta?.title;
  const channel = text(document.querySelector('ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a')) || meta?.channel || '';
  const adShowing = document.querySelector('#movie_player.ad-showing');
  const video = document.querySelector('#movie_player video');
  const durationSec = meta?.durationSec || (adShowing ? null
    : video && Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration)
      : seconds(text(document.querySelector('.ytp-time-duration'))));
  return title ? { videoId, title, channel, durationSec } : null;
}

// YouTube's own "Music" credit in the description (song, artist), when the video has exactly one.
// It is cleaner than any video title, so the match is better. Written as "Artist - Song" with the
// artist as channel, the same shape as an official upload.
// The song cards sit in a horizontal card list (people featured in the video use a different
// section). YouTube renders the description twice, so cards are deduped by song + artist.
// Class names were checked on a live page on 3 Nov 2026; the old BEM names are a fallback.
function musicCredit() {
  const songs = new Map();
  for (const card of document.querySelectorAll('ytd-watch-metadata ytd-horizontal-card-list-renderer yt-video-attribute-view-model')) {
    const song = text(card.querySelector('.ytVideoAttributeViewModelTitle, [class*="__title"]'));
    const artist = text(card.querySelector('.ytVideoAttributeViewModelSubtitle, [class*="__subtitle"]:not([class*="secondary"])'));
    if (song && artist) songs.set(`${song}|${artist}`, { song, artist });
  }
  if (songs.size !== 1) return null;
  const [{ song, artist }] = songs.values();
  return { title: `${artist} - ${song}`, channel: artist };
}

// Before YouTube renders the title, the page's microdata already has it. It is only trusted when
// it is for this video, because it can be left over from the previous one after in-app navigation.
function microdata(videoId) {
  const get = sel => document.querySelector(sel)?.getAttribute('content') || '';
  if (get('meta[itemprop="identifier"]') !== videoId) return null;
  const iso = get('meta[itemprop="duration"]').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return {
    title: get('meta[itemprop="name"]'),
    channel: document.querySelector('[itemprop="author"] [itemprop="name"]')?.getAttribute('content') || '',
    durationSec: iso ? (+iso[1] || 0) * 3600 + (+iso[2] || 0) * 60 + (+iso[3] || 0) : null,
  };
}

// youtube.com/shorts/<id>: the active short, and the song it uses when the page shows one.
function currentShort(videoId) {
  const reel = document.querySelector('ytd-reel-video-renderer[is-active]') || document;
  const sound = text(reel.querySelector('ytd-reel-sound-metadata-renderer, [class*="SoundMetadata"], [class*="sound-metadata"]'));
  const channel = text(reel.querySelector('ytd-channel-name a, #channel-name a, [class*="ChannelName"] a')).replace(/^@/, '');
  const title = text(reel.querySelector('h2, yt-shorts-video-title-view-model')) || document.title.replace(/\s*-\s*YouTube$/, '');
  // The sound line reads "Song · Artist" for licensed music; "Original sound - x" is not a song.
  if (sound && !/original sound/i.test(sound)) {
    const [song, artist] = sound.split(/\s+[·•-]\s+/);
    if (song && artist) return { videoId, title: `${artist} - ${song}`, channel: artist, durationSec: null };
  }
  return title ? { videoId, title, channel, durationSec: null } : null;
}

// More Mix songs without playing them, from YouTube's own /youtubei/v1/next. Asked for with the
// last song we have, it answers with the window around it: about 24 songs that come after it.
// visitorData pins the list to this visitor; without it every call returns a different Mix.
function innertubeConfig() {
  const cfg = [...document.scripts].map(s => s.textContent).find(t => t.includes('"INNERTUBE_CLIENT_VERSION"')) || '';
  return {
    clientVersion: cfg.match(/"INNERTUBE_CLIENT_VERSION":"([\d.]+)"/)?.[1] || '2.20261030.02.00',
    visitorData: cfg.match(/"VISITOR_DATA":"([^"]+)"/)?.[1],
  };
}

const runsText = v => v?.simpleText || (v?.runs || []).map(r => r.text).join('') || '';

async function moreMixSongs(have) {
  const listId = new URL(location.href).searchParams.get('list');
  if (!listId?.startsWith('RD')) return { error: 'Only YouTube Mixes can load more songs' };
  const seed = have[have.length - 1] || new URL(location.href).searchParams.get('v');
  const { clientVersion, visitorData } = innertubeConfig();
  const res = await fetch('/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion, visitorData } }, videoId: seed, playlistId: listId }),
  });
  if (!res.ok) return { error: `YouTube said ${res.status}` };
  const data = await res.json();
  const items = (data.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents || [])
    .map(c => c.playlistPanelVideoRenderer)
    .filter(Boolean);
  const known = new Set(have);
  const tracks = items
    .filter(r => r.videoId && !known.has(r.videoId))
    .map(r => ({
      videoId: r.videoId,
      title: runsText(r.title),
      channel: runsText(r.shortBylineText || r.longBylineText),
      durationSec: seconds(runsText(r.lengthText)),
    }));
  return { tracks: dedupe(tracks) };
}

// Long playlist pages load 100 rows at a time as you scroll.
async function scrollToLoadAll(count) {
  let last = -1;
  let same = 0;
  for (let i = 0; i < 80 && same < 3; i++) {
    const n = count();
    same = n === last ? same + 1 : 0;
    last = n;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(900);
  }
  window.scrollTo(0, 0);
}

async function extractPage({ loadAll = false } = {}) {
  const url = new URL(location.href);
  const listId = url.searchParams.get('list');
  const music = location.hostname === 'music.youtube.com';
  // YouTube Music album pages live under /browse/.
  const isPlaylistPage = url.pathname === '/playlist' || (music && url.pathname.startsWith('/browse/'));

  if (loadAll && isPlaylistPage) {
    const sel = music ? 'ytmusic-responsive-list-item-renderer' : 'yt-lockup-view-model, ytd-playlist-video-renderer';
    await scrollToLoadAll(() => document.querySelectorAll(sel).length);
  }

  let found = null;
  if (music) found = isPlaylistPage ? fromMusicPlaylist() : fromMusicQueue();
  else if (isPlaylistPage && listId) found = fromPlaylistPage(listId);
  else if (listId) found = fromWatchPanel();

  const tracks = dedupe(found?.tracks || []);
  const current = currentVideo(tracks);
  if (!found && !current) return { error: 'No song, Mix or playlist found on this page. Open a video, a Mix or a playlist.' };

  return {
    source: found && {
      title: found.title,
      url: location.href,
      listId,
      kind: listId?.startsWith('RD') ? 'mix' : 'playlist',
      site: music ? 'ytmusic' : 'youtube',
      canLoadMore: isPlaylistPage,
    },
    tracks,
    current,
  };
}

// ---------- one player at a time (decision 19) ----------
// Dhaara can pause the video before Spotify starts, and tells the background when the video starts, so
// it can pause Spotify. Only the main video counts: YouTube's hover previews are other <video> elements.

function mainVideo() {
  return document.querySelector('#movie_player video.html5-main-video, #movie_player video, ytmusic-player video')
    || (location.hostname === 'music.youtube.com' ? document.querySelector('video') : null);
}

let ownPauseAt = 0;   // when Dhaara paused the video itself: that is not the user starting it
let lastSent = 0;
let watched = null;

function pauseMainVideo() {
  const video = mainVideo();
  const wasPlaying = Boolean(video && !video.paused && !video.ended);
  if (wasPlaying) {
    ownPauseAt = Date.now();
    video.pause();
  }
  return { wasPlaying };
}

function onVideoPlay() {
  const now = Date.now();
  if (now - ownPauseAt < 2000 || now - lastSent < 3000) return;
  lastSent = now;
  chrome.runtime.sendMessage({ type: 'yt2sp:youtubePlaying' }).catch(() => {});
}

// YouTube reuses one <video> across in-app navigation, but may replace it: look again after DOM changes
// (debounced) and after each navigation.
function watchVideo() {
  const video = mainVideo();
  if (video === watched) return;
  watched?.removeEventListener('play', onVideoPlay);
  watched = video;
  video?.addEventListener('play', onVideoPlay);
}

if (!window.__yt2spLoaded) {
  window.__yt2spLoaded = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'yt2sp:pauseVideo') {
      sendResponse(pauseMainVideo());
      return;
    }
    const work = msg?.type === 'yt2sp:extract' ? extractPage(msg)
      : msg?.type === 'yt2sp:more' ? moreMixSongs(msg.have || [])
        : null;
    if (!work) return;
    work.then(sendResponse, err => sendResponse({ error: String(err?.message || err) }));
    return true;
  });
  let looking;
  const lookSoon = () => {
    clearTimeout(looking);
    looking = setTimeout(watchVideo, 400);
  };
  new MutationObserver(lookSoon).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', lookSoon);
  watchVideo();
}

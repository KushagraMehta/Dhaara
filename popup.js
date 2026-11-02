import {
  $, h, fmt, icon, artLink, openLink, signal, spinner, changePanel, songs, Songs, BADGES, FIT_WORDS, LEVELS,
  displayTitle, albumLine, subText, isDoubtful, expand, collapse, stagger, withTransition, reducedMotion,
  popupMenu, chooseDevice, resumeDeviceJob, linkLine, spotifyClick,
} from './ui.js';
import {
  QUEUE_KEY, JOB_KEY, CHECKS_KEY, MORE_KEY, LOGIN_KEY, LINKS_KEY,
  trackKey, readMatches, watchMatches, savePick, isTicked, bg, readLinks, linkFor, newSongs,
} from './store.js';

const TOKEN_KEY = 'yt2sp:token';   // spotify.js: a change means a login finished (also when it finished in another tab)
const POLL_MS = 3000;            // how often Spotify's playback is read while the popup is open (never in the background)

const st = {
  tab: null,
  page: null,          // { source, tracks, current } read from the YouTube tab
  matches: {},         // key -> { status, match, alts }
  checks: {},          // key -> ticked, only for ticks the user changed
  status: null,        // { mode, user, hasClientId, webProblem }
  open: null,          // key of the row whose Change panel is open
  todoAt: null,        // key the "Review" button last took the user to
  nowOpen: false,
  nowMatchId: undefined, // the card's last match, so a change cross-fades
  playback: null,      // what Spotify is playing: { isPlaying, item, device, ... } from the background, or null
  playbackKey: '',     // what the card and the slim row last showed, so a poll that changed nothing redraws nothing
  seenPlaying: new Set(), // songs Spotify played while this popup was open: a paused one is then still worth a Resume row
  targetTouched: false, // the user chose a playlist in the Save sheet themselves, so loading the list does not change it
  saving: false,
  settingUp: false,
  sheetOpen: false,
  sheetTrigger: null,  // the control that opened the save sheet, so focus can go back to it
  liked: new Set(),
  likedAsked: new Set(),
  justMatched: new Set(), // rows whose search just finished: their bars grow in once
  sheetUris: [],
  sheetMix: false,     // the open Save sheet is for the whole Mix, so it may use the Mix's link
  sheetFresh: 0,       // songs that are new to the linked playlist, as far as known
  sheetSeq: 0,
  playlistsLoaded: false,
  link: null,          // this Mix's saved link (same Spotify account and mode), or null
  loginMessage: '',
  setupMessage: '',    // a needsSetup error: the no-setup login cannot work, offer the official setup
  entered: false,
  job: null,
};

const ytThumb = id => `https://i.ytimg.com/vi/${id}/default.jpg`;
const isYouTube = url => /^https:\/\/(www|music)\.youtube\.com\//.test(url || '');
const list = () => st.page?.tracks || [];
const view = key => st.matches[key] || { status: 'pending' };
const allItems = () => {
  const cur = st.page?.current;
  return cur && !list().some(t => t.key === cur.key) ? [cur, ...list()] : list();
};
const strip = t => ({ key: t.key, videoId: t.videoId, title: t.title, channel: t.channel, durationSec: t.durationSec, site: t.site });
const signedIn = () => Boolean(st.status?.user);
const isWeb = () => st.status?.mode === 'web';
const barShown = () => signedIn() && list().length > 0;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(msg) {
  try {
    return await chrome.tabs.sendMessage(st.tab.id, msg);
  } catch {
    // Tab was open before the extension was installed: inject the reader and retry.
    await chrome.scripting.executeScript({ target: { tabId: st.tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(st.tab.id, msg);
  }
}

// ---------- page and matches ----------

async function loadPage() {
  const res = await sendToTab({ type: 'yt2sp:extract' });
  if (res?.error) throw new Error(res.error);
  const site = new URL(st.tab.url).hostname === 'music.youtube.com' ? 'ytmusic' : 'youtube';
  const withKey = t => ({ ...t, site, key: trackKey(t) });
  let tracks = (res.tracks || []).map(withKey);
  const listId = res.source?.listId;
  if (listId) {
    const extra = (await chrome.storage.session.get(MORE_KEY))[MORE_KEY]?.[listId] || [];
    const known = new Set(tracks.map(t => t.key));
    tracks = [...tracks, ...extra.filter(t => !known.has(t.key))];
  }
  st.page = { source: res.source, tracks, current: res.current ? withKey(res.current) : null };
}

async function refreshMatches(keys = allItems().map(t => t.key)) {
  Object.assign(st.matches, await readMatches(keys));
}

function requestMatching(items = allItems()) {
  if (!signedIn() || !items.length) return;
  bg('match', { items: items.map(strip) }).catch(onError);
}

function selected() {
  return [...new Set(list().filter(t => isTicked(view(t.key), st.checks[t.key])).map(t => view(t.key).match.uri))];
}

async function saveChecks() {
  const saved = (await chrome.storage.session.get(CHECKS_KEY))[CHECKS_KEY] || {};
  await chrome.storage.session.set({ [CHECKS_KEY]: { ...saved, ...st.checks } });
}

// A tick keeps its checkbox (so the tick draws in) and only re-fades the row; a new match rebuilds it.
async function setCheck(key, on, rebuild = false) {
  st.checks[key] = on;
  await saveChecks();
  if (rebuild) updateKey(key);
  else rowEl(key)?.firstElementChild?.classList.toggle('off', Boolean(view(key).match) && !on);
  renderMeta();
  renderBar();
}

async function pick(t, track) {
  st.open = null;
  st.nowOpen = false;
  await savePick(t.key, track);
  await setCheck(t.key, true, true);
}

// ---------- errors ----------

// needsSetup: the no-setup login cannot work here, so the card offers the official setup (decision 4).
async function onError(err) {
  if (err?.needsSetup) {
    st.setupMessage = err.message;
    renderLogin();
    return;
  }
  if (err?.needsLogin) return relogin(err.message);
  say(err?.message || String(err));
}

// ---------- header ----------

let headBase = '';
let headShown = null;

function renderHead() {
  const cur = st.page?.current;
  const src = st.page?.source;
  headBase = cur ? 'Now Playing' : src?.kind === 'mix' ? 'Mix' : list().length ? 'Playlist' : '';
  updateHead();
}

// "Now Playing", then the Mix title once the Mix header has scrolled under the toolbar.
// With nothing else to say (first run, not a YouTube page), the header names the extension.
function updateHead() {
  const mixUnder = !$('mix').hidden && $('mixHead').getBoundingClientRect().bottom <= $('head').getBoundingClientRect().bottom;
  const text = mixUnder ? $('mixTitle').textContent : headBase;
  const brand = !text;
  const key = brand ? '\u0000brand' : text;
  if (key === headShown) return;
  headShown = key;
  const title = $('headTitle');
  title.replaceChildren(...(brand
    ? [h('img', { src: 'icons/icon32.png', alt: '', width: 18, height: 18 }), h('span', {}, 'Dhaara')]
    : [h('span', { id: 'headText' }, text)]));
  if (!reducedMotion()) title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

// Bars are clear at rest and take the material only while content scrolls under them.
function onScroll() {
  const sc = document.body;
  $('head').classList.toggle('scrolled', sc.scrollTop > 0);
  $('dock').classList.toggle('over', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1);
  updateHead();
}

function renderAccount() {
  const box = $('account');
  const user = st.status?.user;
  box.replaceChildren();
  if (!user) return;
  const how = isWeb() ? ', through your Spotify tab' : '';
  box.append(h('button', {
    class: 'account-btn', title: `Spotify: ${user.name}${how}. Settings…`, 'aria-label': `Spotify account: ${user.name}${how}. Settings`,
    onclick: () => openFull('#settings'),
  }, user.image ? h('img', { class: 'avatar', src: user.image, alt: '' }) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, (user.name || '?')[0].toUpperCase())));
}

// ---------- sign-in card ----------

function renderLogin() {
  const box = $('login');
  const problem = st.setupMessage;
  const show = !signedIn() || Boolean(problem);
  box.hidden = !show;
  if (!show) return;
  const title = h('h2', { id: 'loginTitle' }, 'Find This Music on Spotify');
  const msg = text => h('div', { class: 'msg' }, icon('warn', 14), h('span', {}, text));
  const setupBtn = (cls = 'primary wide') => h('button', { class: cls, onclick: setupOfficial }, 'Set Up Spotify…');

  if (problem) {
    box.replaceChildren(title, msg(problem),
      h('p', {}, 'The official setup takes about a minute and keeps working. Your Spotify account needs Premium.'),
      h('div', { class: 'choice' }, setupBtn()));
    return;
  }
  // The no-setup login failed and signed out (decision 4): say why, and offer the official setup first.
  const webProblem = st.status?.webProblem;
  if (webProblem && !st.status?.hasClientId) {
    box.replaceChildren(title, msg(webProblem),
      h('div', { class: 'choice' }, setupBtn(),
        h('p', { class: 'note' }, 'About a minute, and it keeps working. Needs Spotify Premium.')),
      h('div', { class: 'choice' }, h('button', { id: 'webBtn', class: 'wide', onclick: connectWeb }, 'Try My Spotify Tab Again')));
    return;
  }
  if (isWeb()) {
    box.replaceChildren(title,
      msg(st.loginMessage || st.status?.webProblem || 'Open Spotify in a browser tab and sign in, then try again.'),
      h('div', { class: 'choice' }, h('button', { id: 'connectBtn', class: 'primary wide', onclick: connectWeb }, 'Try Again')),
      h('div', { class: 'choice' }, setupBtn('wide'),
        h('p', { class: 'note' }, 'The official setup takes about a minute and keeps working.')));
    return;
  }
  if (st.status?.hasClientId) {
    box.replaceChildren(title,
      st.loginMessage ? msg(st.loginMessage) : h('p', {}, 'Sign in to Spotify to find these songs there.'),
      h('div', { class: 'choice' }, h('button', { id: 'connectBtn', class: 'primary wide', onclick: connect }, 'Connect Spotify…')));
    return;
  }
  box.replaceChildren(title,
    h('p', {}, 'Choose how to connect. You only do this once.'),
    h('div', { class: 'choice' }, setupBtn(),
      h('p', { class: 'note' }, 'Recommended. About a minute: the extension fills in Spotify’s app form (or uses the app you already have); you tick the terms box and click Save. Needs Spotify Premium.')),
    h('div', { class: 'choice' }, h('button', { id: 'webBtn', class: 'wide', onclick: connectWeb }, 'Use My Spotify Tab'),
      h('p', { class: 'note' }, 'No setup. Unofficial: it uses Spotify’s web player in your browser and can stop working at any time.')));
}

// ---------- what Spotify is playing (decision 19) ----------
// While the popup is open it asks the background every 3 s; nothing polls Spotify when it is closed.

const sameSong = (item, m) => Boolean(item && m && (item.uri === m.uri || item.linkedUri === m.uri));

// The card and the slim row only change when what they show changes.
const playbackKey = pb => (pb?.item ? `${pb.item.uri}|${pb.isPlaying}|${pb.device?.name}` : '');

async function pollPlayback() {
  if (!signedIn() || document.hidden) return;
  try {
    const pb = await bg('playback');
    st.playback = pb?.item ? pb : null;
  } catch {
    st.playback = null;
  }
  if (st.playback?.isPlaying) st.seenPlaying.add(st.playback.item.uri);
  const key = playbackKey(st.playback);
  if (key === st.playbackKey) return;
  st.playbackKey = key;
  // A Change panel that is open holds what the user typed: the card is left alone until it closes.
  if (!st.nowOpen) renderNow();
  renderSpotifyRow();
}

// Pause or Resume Spotify. The popup shows the new state at once and reads the real one a moment later.
async function transport(kind) {
  const was = st.playback;
  try {
    await bg(kind);
  } catch (err) {
    await onError(err);
    return;
  }
  if (was?.item) {
    st.playback = { ...was, isPlaying: kind === 'resume' };
    st.playbackKey = playbackKey(st.playback);
    if (st.playback.isPlaying) st.seenPlaying.add(was.item.uri);
    if (!st.nowOpen) renderNow();
    renderSpotifyRow();
    $('now').querySelector('[data-act="transport"]')?.focus({ preventScroll: true });
  }
  setTimeout(pollPlayback, 900);
}

// A slim row above the list when Spotify is on a different song than the card's: its name, and Pause or
// Resume. A paused song only shows if it was playing while this popup was open.
function renderSpotifyRow() {
  const box = $('spotifyNow');
  const pb = st.playback;
  const cur = st.page?.current;
  const m = cur && signedIn() ? view(cur.key).match : null;
  const show = signedIn() && Boolean(pb?.item) && !sameSong(pb.item, m) && (pb.isPlaying || st.seenPlaying.has(pb.item.uri));
  box.hidden = !show;
  if (!show) {
    box.replaceChildren();
    return;
  }
  const playing = pb.isPlaying;
  const who = [pb.item.name, (pb.item.artists || []).join(', ')].filter(Boolean).join(', ');
  box.replaceChildren(
    h('span', { class: `eq${playing ? '' : ' still'}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('span', { class: 'sn-text', title: `${who} on ${pb.device?.name || 'Spotify'}` }, `Spotify: ${who}`),
    h('button', {
      class: 'small', 'aria-label': `${playing ? 'Pause' : 'Resume'} ${pb.item.name} on Spotify`,
      onclick: () => transport(playing ? 'pause' : 'resume'),
    }, icon(playing ? 'pause' : 'play', 12), playing ? 'Pause' : 'Resume'));
}

// ---------- Now Playing card ----------

function playFromHere(m) {
  // Decision 7: in a Mix, this song and then the ticked songs after it. On a single video, just the song.
  const cur = st.page.current;
  const at = list().findIndex(t => t.key === cur.key);
  // A song that cannot be found in the list plays on its own: never the whole list from the top.
  const after = (at >= 0 ? list().slice(at + 1) : [])
    .filter(t => isTicked(view(t.key), st.checks[t.key]))
    .map(t => view(t.key).match.uri);
  run('play', [...new Set([m.uri, ...after])]);
}

// The heart shows the real Liked Songs state when the worker can tell; otherwise what was liked here.
function askLiked(uri) {
  if (st.likedAsked.has(uri)) return;
  st.likedAsked.add(uri);
  bg('liked', { uris: [uri] }).then(res => {
    const on = res?.liked?.[uri];
    if (on == null || on === st.liked.has(uri)) return;
    if (on) st.liked.add(uri);
    else st.liked.delete(uri);
    renderNow();
  }).catch(() => {});
}

function renderNow({ popHeart = false } = {}) {
  const box = $('now');
  const cur = st.page?.current;
  box.hidden = !cur;
  if (!cur) return;
  const v = view(cur.key);
  const user = st.status?.user;
  const m = user ? v.match : null;
  const doubtful = isDoubtful(v.status);
  const sp = st.playback;
  const onSong = sameSong(sp?.item, m);
  const toggleChange = () => {
    st.nowOpen = !st.nowOpen;
    renderNow();
    const panel = $('now').querySelector('.np-panel');
    if (panel) {
      expand(panel);
      panel.querySelector('input')?.focus();
    } else {
      $('now').querySelector('[data-act="change"]')?.focus();
    }
  };
  const card = h('div', { class: 'np' });

  if (m) {
    const liked = st.liked.has(m.uri);
    askLiked(m.uri);
    const album = albumLine(m);
    card.append(
      h('div', { class: 'np-top' },
        h('div', { class: 'np-art' }, m.image ? h('img', { class: 'glow', src: m.image, alt: '', 'aria-hidden': 'true' }) : null, artLink(m)),
        h('div', { class: 'np-text' },
          h('a', { class: 'np-title', href: m.url, target: '_blank', rel: 'noopener', onclick: spotifyClick, title: `Open “${displayTitle(m.name)}” in Spotify` }, displayTitle(m.name)),
          h('div', { class: 'np-sub', title: m.artists.join(', ') }, m.artists.join(', ')),
          album ? h('div', { class: 'np-album', title: album }, album) : null,
          h('div', { class: `np-status${doubtful ? ' warn' : ''}` },
            signal(v), FIT_WORDS[v.status], m.durationSec ? h('span', { class: 'dot', 'aria-hidden': 'true' }, '·') : null, fmt(m.durationSec),
            openLink(m)),
          // Spotify is on this very song: where, and whether it is playing (decision 19).
          onSong ? h('div', { class: 'np-now', 'aria-live': 'polite' },
            h('span', { class: `eq${sp.isPlaying ? '' : ' still'}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
            h('span', { class: 'np-now-text', title: sp.device.name }, `${sp.isPlaying ? 'Playing' : 'Paused'} on ${sp.device.name}`)) : null)),
      h('div', { class: 'np-actions' },
        onSong
          ? h('button', {
            class: barShown() ? 'tinted' : 'primary', 'data-act': 'transport',
            'aria-label': `${sp.isPlaying ? 'Pause' : 'Resume'} ${displayTitle(m.name)}`,
            title: sp.isPlaying ? 'Pause Spotify' : 'Resume Spotify',
            onclick: () => transport(sp.isPlaying ? 'pause' : 'resume'),
          }, icon(sp.isPlaying ? 'pause' : 'play', 14), sp.isPlaying ? 'Pause' : 'Resume')
          : h('button', {
            class: barShown() ? 'tinted' : 'primary', 'aria-label': `Play ${displayTitle(m.name)}`,
            title: list().length ? 'Play this song, then the ticked songs after it' : 'Play this song',
            onclick: () => playFromHere(m),
          }, icon('play', 14), 'Play'),
        h('button', { 'aria-label': `Queue ${displayTitle(m.name)}`, title: 'Add to the end of your Spotify queue', onclick: () => run('queue', [m.uri]) }, icon('queue', 14), 'Queue'),
        h('span', { class: 'spacer' }),
        // Liked Songs can only be added to here, so the heart is not a toggle.
        h('button', {
          class: `icon-btn${liked ? ' on' : ''}${popHeart ? ' pop' : ''}`, 'data-act': 'like',
          title: liked ? 'In Liked Songs' : 'Add to Liked Songs',
          'aria-label': liked ? `${displayTitle(m.name)} is in Liked Songs` : `Add ${displayTitle(m.name)} to Liked Songs`,
          onclick: () => like(m.uri),
        }, icon(liked ? 'heartFill' : 'heart', 18)),
        h('button', { class: 'icon-btn', 'data-act': 'playlist', title: 'Save to Playlist…', 'aria-label': `Save ${displayTitle(m.name)} to a playlist`, onclick: () => openSheet([m.uri], m.name) }, icon('plus', 18)),
        doubtful
          ? h('button', { class: 'small', 'data-act': 'change', 'aria-expanded': String(st.nowOpen), onclick: toggleChange }, icon('swap', 14), 'Change…')
          : h('button', {
            class: `icon-btn${st.nowOpen ? ' on' : ''}`, 'data-act': 'change', title: 'Choose a Different Song…',
            'aria-label': `Choose a different song for ${displayTitle(m.name)}`, 'aria-expanded': String(st.nowOpen), onclick: toggleChange,
          }, icon('swap', 18))),
      ...(doubtful ? [h('div', { class: 'np-yt', title: cur.title }, `On YouTube: ${cur.title}`)] : []));
  } else {
    const canSearch = user && !['matching', 'pending'].includes(v.status);
    const status = user ? FIT_WORDS[v.status] : cur.channel || '';
    const bad = user && (v.status === 'none' || v.status === 'error');
    card.append(h('div', { class: 'np-top' },
      h('div', { class: 'np-art' }, cur.videoId
        ? h('img', { class: 'thumb', src: `https://i.ytimg.com/vi/${cur.videoId}/mqdefault.jpg`, alt: '' })
        : h('div', { class: 'thumb ph' }, icon('note', 24))),
      h('div', { class: 'np-text' },
        h('div', { class: 'np-title', title: cur.title }, cur.title),
        h('div', { class: `np-status${bad ? ' err' : ''}` }, user ? signal(v) : null, v.status === 'error' && v.error ? v.error : status),
        canSearch ? h('div', { class: 'np-actions' },
          v.status === 'error'
            ? h('button', { class: 'small', onclick: () => requestMatching([cur]) }, icon('reload', 14), 'Try Again')
            : null,
          h('button', { class: 'small', 'data-act': 'change', 'aria-expanded': String(st.nowOpen), onclick: toggleChange }, icon('search', 14), 'Search Spotify…')) : null)));
  }
  if (st.nowOpen && user) card.append(h('div', { class: 'np-panel' }, changePanel(cur, v, a => pick(cur, a))));

  // A new match for the card cross-fades its artwork and title (View Transition), once.
  const id = m?.id || null;
  const changed = st.nowMatchId !== undefined && st.nowMatchId !== id;
  st.nowMatchId = id;
  const apply = () => box.replaceChildren(card);
  if (changed && !st.nowOpen) withTransition(apply);
  else apply();
  renderSpotifyRow();   // the slim row hides itself when Spotify is on this card's song
}

// ---------- rows ----------

function row(t, index) {
  const v = view(t.key);
  const user = signedIn();
  const m = user ? v.match : null;
  const on = isTicked(v, st.checks[t.key]);
  const doubtful = isDoubtful(v.status);
  const playing = st.page?.current?.key === t.key;
  const isOpen = st.open === t.key;
  const canOpen = user && !['matching', 'pending'].includes(v.status);
  const name = m ? displayTitle(m.name) : t.title;
  const cb = h('input', {
    type: 'checkbox', checked: on, disabled: !m, 'aria-label': `Include ${name}`,
    onclick: e => e.stopPropagation(),
    onchange: e => setCheck(t.key, e.target.checked),
  });
  const bad = v.status === 'none' || v.status === 'error';
  const lines = m
    ? [
      h('span', { class: 'title' }, name),
      h('span', { class: 'sub' }, subText(m)),
      doubtful ? h('span', { class: 'yt-line' }, h('span', { class: 'tag' }, BADGES[v.status]), `On YouTube: ${t.title}`) : null,
    ]
    : [
      h('span', { class: 'title' }, t.title),
      h('span', { class: `sub${bad ? ' err' : ''}` }, user ? (v.status === 'error' && v.error ? v.error : FIT_WORDS[v.status]) : t.channel || ''),
    ];
  // A real button, so the keyboard reaches the Change panel; a click anywhere else on the row does the same.
  const meta = canOpen
    ? h('button', { class: 'meta rowbtn', 'aria-expanded': String(isOpen), 'aria-current': playing ? 'true' : null },
      ...lines, h('span', { class: 'sr' }, isOpen ? '. Hide search' : '. Change match'))
    : h('div', { class: 'meta', 'aria-current': playing ? 'true' : null }, ...lines);
  const thumb = m
    ? artLink(m, { tabbable: false })
    : t.videoId ? h('img', { class: 'thumb', src: ytThumb(t.videoId), alt: '', decoding: 'async' }) : h('div', { class: 'art ph' }, icon('note', 16));
  const animate = st.justMatched.has(t.key);
  const trail = h('span', { class: 'trail' },
    h('span', { class: 'dur' }, fmt(m?.durationSec || t.durationSec)),
    user && !bad ? signal(v, { animate }) : null);
  let end = h('span');
  if (canOpen && v.status === 'error') {
    end = h('button', { class: 'small', onclick: e => { e.stopPropagation(); requestMatching([t]); }, 'aria-label': `Search again for ${t.title}` }, 'Try Again');
  } else if (canOpen && !m) {
    end = h('button', { class: 'small', tabindex: '-1', 'aria-hidden': 'true' }, 'Search…');
  } else if (canOpen) {
    end = h('button', { class: 'icon-btn disc', tabindex: '-1', 'aria-hidden': 'true', title: isOpen ? 'Hide' : 'Choose a Different Song…' }, icon('chevronDown', 16));
  }
  // Only a song that is matched and unticked fades; one that still needs the user stays at full strength.
  const el = h('div', {
    class: `prow${isOpen ? ' open' : ''}${m && !on ? ' off' : ''}${playing ? ' playing' : ''}${canOpen ? ' can-open' : ''}`,
    title: `On YouTube: ${t.title}${t.channel ? `, by ${t.channel}` : ''}`,
    onclick: e => { if (canOpen && !e.target.closest('a, input')) toggleRow(t.key); },
  },
  h('span', { class: 'cbx' }, cb),
  h('span', { class: 'num' }, playing ? icon('speaker', 14) : String(index + 1)),
  thumb, meta, trail, end);
  const wrap = h('div', { 'data-key': t.key }, el);
  if (isOpen) {
    wrap.append(h('div', { class: 'prow-change' },
      h('div', { class: 'panel-head' },
        h('span', { class: 'yt-line', title: t.title }, `On YouTube: ${t.title}${t.channel ? ` · ${t.channel}` : ''}`),
        m ? openLink(m) : null),
      changePanel(t, v, a => pick(t, a))));
  }
  return wrap;
}

const rowEl = key => $('rows').querySelector(`[data-key="${CSS.escape(key)}"]`);

// Opens or closes a row's Change panel. Opening another row closes the first at once, and the page
// scrolls by what it removed, so the row just clicked stays under the pointer.
async function toggleRow(key) {
  const prev = st.open;
  if (prev === key) {
    st.open = null;
    await collapse(rowEl(key)?.querySelector('.prow-change'));
    updateKey(key);
    rowEl(key)?.querySelector('.rowbtn')?.focus();
    return;
  }
  st.open = key;
  if (prev) {
    const before = rowEl(key)?.getBoundingClientRect().top;
    updateKey(prev);
    const after = rowEl(key)?.getBoundingClientRect().top;
    if (before != null && after != null) document.body.scrollTop += after - before;
  }
  updateKey(key);
  const panel = rowEl(key)?.querySelector('.prow-change');
  expand(panel);
  rowEl(key)?.querySelector('.rowbtn')?.focus();
  panel?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function updateKey(key) {
  const old = rowEl(key);
  const index = list().findIndex(x => x.key === key);
  if (old && index >= 0) old.replaceWith(row(list()[index], index));
  if (st.page?.current?.key === key) renderNow();
}

// Statuses where the user still has something to do.
const needsLook = s => s === 'check' || s === 'low' || s === 'none' || s === 'error';

// Takes the user to the next song that needs a look, after the open one, and opens it.
function nextTodo() {
  const tracks = list();
  if (!signedIn() || !tracks.length) return;
  const from = tracks.findIndex(t => t.key === (st.open || st.todoAt));
  for (let i = 1; i <= tracks.length; i++) {
    const t = tracks[(from + i + tracks.length) % tracks.length];
    if (!needsLook(view(t.key).status)) continue;
    st.todoAt = t.key;
    if (st.open !== t.key) toggleRow(t.key);
    rowEl(t.key)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
}

function renderMeta() {
  const tracks = list();
  let found = 0, todo = 0, searching = 0;
  for (const t of tracks) {
    const s = view(t.key).status;
    if (LEVELS[s] > 0) found++;
    if (s === 'pending' || s === 'matching') searching++;
    if (needsLook(s)) todo++;
  }
  const dot = () => h('span', { class: 'dot', 'aria-hidden': 'true' }, '·');
  const parts = signedIn()
    ? [
      songs(tracks.length),
      `${found} on Spotify`,
      todo ? h('button', { class: 'plain', onclick: nextTodo, title: 'Go to the next song that needs a look' }, `Review ${todo}`) : null,
      searching ? h('span', { class: 'searching' }, spinner(), `${searching} searching`) : null,
    ].filter(Boolean)
    : [songs(tracks.length)];
  $('mixMeta').replaceChildren(...parts.flatMap((p, i) => (i ? [dot(), p] : [p])));

  const matched = tracks.filter(t => view(t.key).match);
  const onCount = matched.filter(t => isTicked(view(t.key), st.checks[t.key])).length;
  const all = $('tickAll');
  all.closest('.cbx').style.visibility = signedIn() ? '' : 'hidden'; // keeps the column, so titles stay aligned
  all.disabled = !matched.length;
  all.checked = matched.length > 0 && onCount === matched.length;
  all.indeterminate = onCount > 0 && onCount < matched.length;
  renderLink();
}

// "Linked to <playlist>, 3 new songs since you last saved" under the Mix title (decision 3).
async function refreshLink() {
  const listId = st.page?.source?.listId;
  st.link = listId && signedIn() ? linkFor(await readLinks(), listId, st.status.user, st.status.mode) : null;
  renderLink();
}

function renderLink() {
  const box = $('mixLink');
  box.hidden = !st.link || !signedIn() || !list().length;
  if (!box.hidden) box.replaceChildren(...linkLine(st.link, newSongs(st.link, selected()).length));
}

function renderMix() {
  const tracks = list();
  $('mix').hidden = !tracks.length;
  document.body.classList.toggle('tall', tracks.length > 0);
  if (!tracks.length) return;
  const src = st.page.source;
  $('mixTitle').textContent = src.title || 'This List';
  $('mixTitle').title = src.title || '';
  $('rows').replaceChildren(...tracks.map(row));
  $('moreBtn').hidden = !(isYouTubeMix() || src.canLoadMore);
  $('moreBtn').replaceChildren(moreLabel());
  renderMeta();
}

function renderBar() {
  // The bar stays under the save sheet; the scrim dims it.
  const show = barShown();
  $('bar').hidden = !show;
  if (show) {
    const n = selected().length;
    const busy = Boolean(st.job?.running);
    $('playAll').replaceChildren(icon('play', 14), n ? `Play ${Songs(n)}` : 'Play');
    $('playAll').title = n ? `Play the ${songs(n)} you ticked` : 'Tick at least one song first.';
    $('queueAll').replaceChildren(icon('queue', 14), 'Queue');
    $('queueAll').title = n ? `Add ${songs(n)} to the end of your Spotify queue` : '';
    $('saveBtn').replaceChildren('Save…');
    for (const id of ['playAll', 'queueAll', 'saveBtn']) $(id).disabled = !n || busy;
  }
  requestAnimationFrame(onScroll);
}

// ---------- the status line ----------

// One feedback line (#job, role=status) above the bar: a glyph, the message, an optional link,
// and a determinate bar while a queue job counts up. Parts are updated in place, so the bar animates.
let fb = null;
function feedbackParts() {
  if (fb) return fb;
  fb = {
    glyph: h('span', { class: 'fb-glyph' }),
    text: h('span', { class: 'fb-text' }),
    link: h('a', { class: 'fb-link', target: '_blank', rel: 'noopener', onclick: spotifyClick }, 'Open in Spotify', icon('arrowUpRight', 12)),
    bar: h('span', { class: 'progress', 'aria-hidden': 'true' }, h('i')),
    kind: '',
  };
  return fb;
}

function renderJob(job, { fresh = false } = {}) {
  const prev = st.job;
  st.job = job && Date.now() - job.at < 120_000 ? job : null;
  const j = st.job;
  const box = $('job');
  // A keyboard shortcut that could not pick a Spotify device: ask now and run it again.
  if (j?.needsDevice) resumeDeviceJob(j, (action, uris) => run(action, uris));
  // A job that failed because the no-setup login cannot work any more offers the official setup.
  if (j?.error && j.needsSetup && st.setupMessage !== j.error) {
    st.setupMessage = j.error;
    renderLogin();
  }
  if (!j || !(j.error || j.message)) {
    box.replaceChildren();
    box.className = 'feedback';
    renderBar();
    return;
  }
  const parts = feedbackParts();
  const kind = j.running ? 'run' : j.error ? 'err' : 'ok';
  box.className = `feedback ${kind}`;
  // A job that has just finished, or a note that just arrived, gets the drawn checkmark.
  const celebrate = kind === 'ok' && (fresh || prev?.running) && !reducedMotion();
  if (kind !== parts.kind || celebrate) {
    parts.glyph.replaceChildren(kind === 'run' ? spinner() : kind === 'err' ? icon('warn', 16) : icon('checkCircle', 16, celebrate ? 'mark-in' : ''));
    parts.kind = kind;
  }
  parts.text.textContent = j.error || j.message;
  parts.link.hidden = !j.link || Boolean(j.error);
  if (j.link) parts.link.href = j.link;
  const counting = j.running && j.total > 1 && j.done != null;
  parts.bar.hidden = !counting;
  if (counting) parts.bar.firstChild.style.setProperty('--p', String(Math.min(1, j.done / j.total)));
  if (!box.contains(parts.glyph)) box.replaceChildren(parts.glyph, parts.text, parts.link, parts.bar);
  renderBar();
}

// Shows a message on the status line. A job that is still running keeps the buttons disabled.
function say(message, error = true) {
  renderJob({ message: error ? '' : message, error: error ? message : '', running: Boolean(st.job?.running), at: Date.now() }, { fresh: !error });
}

function renderAll() {
  renderAccount();
  renderLogin();
  renderNow();
  renderSpotifyRow();
  renderMix();
  renderHead();
  renderBar();
}

// ---------- actions ----------

// More than one Spotify player and none chosen: ask which, remember it, and run the action again (feature 8).
async function run(action, uris, extra = {}, retried = false) {
  try {
    const res = await bg('run', { action, uris, ...extra });
    if (res?.job) renderJob(res.job);
    return res;
  } catch (err) {
    if (err.needsDevice && !retried) {
      const device = await chooseDevice(err.devices);
      if (!device) return null;
      try {
        await bg('setDevice', { id: device.id, name: device.name });
      } catch (e) {
        await onError(e);
        return null;
      }
      return run(action, uris, extra, true);
    }
    await onError(err);
    return null;
  }
}

async function like(uri) {
  if (st.liked.has(uri)) return say('Already in Liked Songs.', false);
  if (await run('like', [uri])) {
    st.liked.add(uri);
    renderNow({ popHeart: !reducedMotion() });
    $('now').querySelector('[data-act="like"]')?.focus();
  }
}

async function relogin(message) {
  st.loginMessage = message;
  st.status = await bg('status').catch(() => st.status);
  if (st.status) st.status.user = null;
  renderAll();
}

async function afterConnect() {
  st.loginMessage = '';
  st.setupMessage = '';
  st.status = await bg('status');
  await refreshMatches();
  await refreshLink();
  renderAll();
  requestMatching();
}

function busyButton(id, text) {
  const btn = $(id);
  if (!btn) return () => {};
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return () => { if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } };
}

const WAITING = 'Finish signing in in the Spotify tab that opened. Dhaara picks it up when you are done.';

async function connect() {
  const done = busyButton('connectBtn', 'Waiting for Spotify…');
  try {
    await bg('connect');
    await afterConnect();
  } catch (err) {
    if (err.needsSetup) st.setupMessage = err.message;
    // The login waits in its own tab and can outlive the background worker: it is finished from there.
    else st.loginMessage = err.interrupted ? WAITING : err.message;
    renderLogin();
  } finally {
    done();
  }
}

// The no-setup login: Spotify's web player in a tab the user is signed in to (decision 4).
async function connectWeb() {
  const done = busyButton(st.status?.mode === 'web' ? 'connectBtn' : 'webBtn', 'Waiting for Spotify…');
  try {
    if (!isWeb()) await bg('setMode', { mode: 'web' });
    st.status = { ...st.status, mode: 'web' };
    await bg('connect');
    await afterConnect();
  } catch (err) {
    if (err.needsSetup) st.setupMessage = err.message;
    else st.loginMessage = err.message;
    st.status = await bg('status').catch(() => st.status);
    renderLogin();
  } finally {
    done();
  }
}

// The official setup: a Spotify app the user owns.
async function setupOfficial() {
  if (st.settingUp) return;
  st.settingUp = true;
  try {
    if (isWeb()) await bg('setMode', { mode: 'app' });
    if (st.status?.hasClientId) {
      st.status = { ...st.status, mode: 'app' };
      st.setupMessage = '';
      return connect();
    }
    await bg('setup');
    window.close();
  } catch (err) {
    st.setupMessage = err.message;
    renderLogin();
  } finally {
    st.settingUp = false;
  }
}

const isYouTubeMix = () => st.page?.source?.kind === 'mix' && st.page.source.site === 'youtube';
const moreLabel = () => (isYouTubeMix() ? 'Load More Songs' : 'Load Entire Playlist');

// A Mix asks YouTube for the next songs; a long playlist page scrolls until every row has loaded.
async function loadMore() {
  const btn = $('moreBtn');
  const mix = isYouTubeMix();
  btn.disabled = true;
  btn.replaceChildren(spinner(), mix ? 'Loading More Songs…' : 'Loading Playlist…');
  try {
    const res = mix
      ? await sendToTab({ type: 'yt2sp:more', have: list().map(t => t.videoId).filter(Boolean) })
      : await sendToTab({ type: 'yt2sp:extract', loadAll: true });
    if (res?.error) throw new Error(res.error);
    const site = st.page.source.site;
    const known = new Set(list().map(t => t.key));
    const fresh = (res.tracks || []).map(t => ({ ...t, site, key: trackKey(t) })).filter(t => !known.has(t.key));
    if (!fresh.length) throw new Error(mix ? 'YouTube has no more songs for this Mix right now.' : 'That is the whole playlist.');
    st.page.tracks.push(...fresh);
    const listId = st.page.source.listId;
    const saved = (await chrome.storage.session.get(MORE_KEY))[MORE_KEY] || {};
    if (mix) await chrome.storage.session.set({ [MORE_KEY]: { ...saved, [listId]: [...(saved[listId] || []), ...fresh] } });
    await refreshMatches(fresh.map(t => t.key));
    const start = list().length - fresh.length;
    const els = fresh.map((t, j) => row(t, start + j));
    $('rows').append(...els);
    if (!reducedMotion()) stagger(els);
    renderMeta();
    renderBar();
    requestMatching(fresh);
    say(`Added ${songs(fresh.length)} from YouTube.`, false);
  } catch (err) {
    say(err.message);
  } finally {
    btn.disabled = false;
    btn.replaceChildren(moreLabel());
  }
}

// ---------- save sheet ----------

// mix: the songs are the whole Mix, so a link to its playlist applies (and a save is remembered).
async function openSheet(uris, name, { mix = false } = {}) {
  const sel = $('target');
  const seq = ++st.sheetSeq;
  st.sheetUris = uris;
  st.sheetMix = mix && Boolean(st.page?.source?.listId);
  st.sheetFresh = st.sheetMix && st.link ? newSongs(st.link, uris).length : uris.length;
  st.sheetTrigger = document.activeElement;
  st.sheetOpen = true;
  const sheet = $('saveSheet');
  st.targetTouched = false;
  if (!$('playlistName').value || uris.length > 1) $('playlistName').value = displayTitle(name || '');
  $('scrim').hidden = false;
  sheet.hidden = false;
  preselectLink();
  onTarget();
  // Room under the sheet's pop-up menu: it opens upward, inside the popup window.
  document.body.style.minHeight = `${sheet.offsetHeight + 150}px`;
  void sheet.offsetWidth;
  $('scrim').classList.add('on');
  sheet.classList.add('on');
  ($('playlistName').hidden ? sel : $('playlistName')).focus({ preventScroll: true });

  // Also count what the playlist itself holds, where the provider can tell.
  if (st.sheetMix && st.link) {
    bg('linkInfo', { listId: st.page.source.listId, uris }).then(res => {
      if (seq !== st.sheetSeq || !st.sheetOpen || !res.link) return;
      st.sheetFresh = res.fresh;
      syncSheet();
    }).catch(() => {});
  }
  if (!st.playlistsLoaded) {
    try {
      const { playlists } = await bg('playlists');
      st.playlistsLoaded = true;
      sel.setOptions([
        { value: 'new', label: 'New Playlist' },
        // The no-setup login cannot count tracks (total is null), so the count is left out then.
        ...playlists.map((p, k) => ({ value: p.id, label: p.name, name: p.name, detail: p.total == null ? '' : String(p.total), separatorBefore: k === 0 })),
      ], sel.value);
    } catch (err) {
      onError(err);
    }
    // The list can take a while to load; a playlist the user chose in the meantime stays chosen.
    if (!st.targetTouched) preselectLink();
    onTarget();
  }
}

// The Mix's linked playlist is chosen when the sheet opens, even when the playlist list does not have it.
function preselectLink() {
  const link = st.sheetMix ? st.link : null;
  const sel = $('target');
  if (!link) return;
  if (!sel.options.some(o => o.value === link.playlistId)) {
    sel.setOptions([...sel.options, { value: link.playlistId, label: link.name, name: link.name, separatorBefore: true }]);
  }
  sel.value = link.playlistId;
}

// The sheet's title and button follow the chosen playlist: "Add 4 New Songs" for the linked one.
function syncSheet() {
  const sel = $('target');
  const link = st.sheetMix ? st.link : null;
  const onLink = Boolean(link) && sel.value === link.playlistId;
  const n = onLink ? st.sheetFresh : st.sheetUris.length;
  $('sheetTitle').textContent = onLink ? `Add New Songs to ${sel.selectedOption?.name || link.name}` : 'Save to Playlist';
  $('saveGo').textContent = onLink ? (n ? `Add ${n} New ${n === 1 ? 'Song' : 'Songs'}` : 'No New Songs') : `Save ${Songs(n)}`;
  $('saveGo').disabled = onLink && !n;
}

// Closes the save sheet and puts focus back on whatever opened it.
function closeSheet() {
  if (!st.sheetOpen) return;
  st.sheetOpen = false;
  const sheet = $('saveSheet');
  sheet.classList.remove('on');
  $('scrim').classList.remove('on');
  setTimeout(() => {
    if (st.sheetOpen) return;
    sheet.hidden = true;
    $('scrim').hidden = true;
    document.body.style.minHeight = '';
  }, reducedMotion() ? 160 : 220);
  const back = st.sheetTrigger?.isConnected ? st.sheetTrigger : document.querySelector('[data-act="playlist"]') || $('saveBtn');
  st.sheetTrigger = null;
  back?.focus({ preventScroll: true });
}

function onTarget() {
  const isNew = $('target').value === 'new';
  for (const id of ['playlistName', 'nameLabel', 'publicRow', 'publicGap']) $(id).hidden = !isNew;
  syncSheet();
}

async function save() {
  const go = $('saveGo');
  // Enter in the name field and a click can both arrive: one save only (review finding 8).
  if (st.saving || go.disabled) return;
  st.saving = true;
  go.disabled = true;
  const sel = $('target');
  const isNew = sel.value === 'new';
  const name = $('playlistName').value.trim() || st.page?.source?.title || 'From YouTube';
  const listId = st.sheetMix ? st.page?.source?.listId : null;
  const res = await run('save', st.sheetUris, {
    target: sel.value,
    name,
    // What the result message names: the new playlist's name, or the chosen playlist's own name.
    playlistName: isNew ? name : sel.selectedOption?.name || '',
    isPublic: $('isPublic').checked,
    description: `Imported from YouTube: ${st.page?.source?.title || st.page?.current?.title || ''}`.slice(0, 300),
    ...(listId && { listId }),
  });
  go.disabled = false;
  st.saving = false;
  if (res) {
    closeSheet();
    if (isNew) {
      // The new playlist shows up (and is preselected, as the Mix's link) next time.
      st.playlistsLoaded = false;
      sel.setOptions([{ value: 'new', label: 'New Playlist' }], 'new');
    }
    await refreshLink();
  } else {
    syncSheet();
  }
}

// Keeps Tab inside the sheet while it is open.
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const items = [...$('saveSheet').querySelectorAll('button, input')].filter(el => !el.disabled && !el.hidden && el.offsetParent);
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ---------- full view ----------

async function openFull(hash = '') {
  if (list().length) {
    const current = (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY];
    const tracks = current?.tracks || [];
    const known = new Set(tracks.map(t => t.key));
    const sources = current?.sources || [];
    const src = st.page.source;
    const seenSource = sources.some(s => s.listId === src.listId && s.title === src.title);
    await chrome.storage.local.set({
      [QUEUE_KEY]: {
        sources: seenSource ? sources : [...sources, src],
        tracks: [...tracks, ...list().filter(t => !known.has(t.key)).map(t => ({ ...strip(t), checked: st.checks[t.key] }))],
        playlistName: current?.playlistName || src.title,
        origin: 'popup',
        rev: Date.now(),
      },
    });
  }
  const url = chrome.runtime.getURL('import.html');
  const [existing] = await chrome.tabs.query({ url: `${url}*` }).catch(() => []);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true, url: url + hash });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + hash });
  }
  window.close();
}

// The select-all checkbox: mixed or off ticks every matched song; all on unticks them.
async function tickAll() {
  const matched = list().filter(t => view(t.key).match);
  const allOn = matched.length > 0 && matched.every(t => isTicked(view(t.key), st.checks[t.key]));
  for (const t of matched) st.checks[t.key] = !allOn;
  await saveChecks();
  $('rows').replaceChildren(...list().map(row));
  renderMeta();
  renderBar();
  if (st.page?.current) renderNow();
}

// ---------- empty, failure and loading states ----------

function showState(kind) {
  const box = $('status');
  box.hidden = false;
  if (kind === 'loading') {
    box.replaceChildren(h('div', { class: 'skeleton', 'aria-label': 'Reading this page' },
      h('i', { class: 'sk-art' }), h('div', { class: 'sk-lines' }, h('i'), h('i'), h('i'))));
    return;
  }
  const states = {
    notYouTube: [icon('video', 28), 'Nothing to Match Here', 'Play a song, Mix or playlist on YouTube or YouTube Music, then open this again.', null],
    unreadable: [icon('reload', 28), 'Can’t Read This Page', 'Reload the YouTube tab, then open this again.',
      h('button', { onclick: () => { chrome.tabs.reload(st.tab.id); window.close(); } }, 'Reload Page')],
  };
  const [glyph, title, text, action] = states[kind];
  box.replaceChildren(h('div', { class: 'empty enter' }, glyph, h('h2', {}, title), h('p', {}, text), action));
}

// One entrance for the content: the card, then the list 60 ms later. Rows do not stagger.
function enter() {
  if (st.entered) return;
  st.entered = true;
  for (const [id, cls] of [['login', 'enter'], ['now', 'enter'], ['mix', 'enter enter-2']]) {
    const el = $(id);
    if (el.hidden) continue;
    el.classList.add(...cls.split(' '));
    el.addEventListener('animationend', () => el.classList.remove('enter', 'enter-2'), { once: true });
  }
}

// ---------- start ----------

async function init() {
  $('playAll').onclick = () => run('play', selected());
  $('queueAll').onclick = () => run('queue', selected());
  $('saveBtn').onclick = () => openSheet(selected(), st.page?.source?.title, { mix: true });
  $('saveGo').onclick = save;
  $('sheetClose').append(icon('close', 16));
  $('sheetClose').onclick = closeSheet;
  $('sheetCancel').onclick = closeSheet;
  $('scrim').onclick = closeSheet;
  $('saveSheet').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    trapFocus(e);
  });
  $('playlistName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  popupMenu($('target'), { options: [{ value: 'new', label: 'New Playlist' }], value: 'new' });
  $('target').onchange = () => { st.targetTouched = true; onTarget(); };
  $('moreBtn').onclick = loadMore;
  $('tickAll').onchange = tickAll;
  $('fullBtn').append(icon('expand', 16));
  $('fullBtn').onclick = () => openFull();
  document.body.addEventListener('scroll', onScroll, { passive: true });
  new ResizeObserver(() => onScroll()).observe($('main'));

  // A keyboard shortcut may have left a badge on the toolbar icon: opening the popup is the answer to it.
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
  chrome.action.setTitle({ title: 'Dhaara' }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LINKS_KEY]) refreshLink();
    // A login that finished while this popup was open (the Brave tab fallback finishes in the background).
    if (area === 'local' && changes[TOKEN_KEY]?.newValue && !signedIn() && st.status?.mode !== 'web') afterConnect().catch(() => {});
    if (area !== 'session') return;
    if (changes[JOB_KEY]) renderJob(changes[JOB_KEY].newValue);
    if (changes[LOGIN_KEY]?.newValue) relogin(changes[LOGIN_KEY].newValue);
  });

  // A skeleton only if reading the page takes long enough to notice.
  const slow = setTimeout(() => { if (!st.page) showState('loading'); }, 250);

  st.tab = await activeTab();
  st.checks = (await chrome.storage.session.get(CHECKS_KEY))[CHECKS_KEY] || {};
  st.status = await bg('status').catch(() => ({ user: null, hasClientId: false }));
  renderAccount();
  renderJob((await chrome.storage.session.get(JOB_KEY))[JOB_KEY]);

  if (!isYouTube(st.tab?.url)) {
    clearTimeout(slow);
    renderLogin();
    renderHead();
    showState('notYouTube');
    enter();
    return;
  }
  try {
    await loadPage();
  } catch {
    clearTimeout(slow);
    renderHead();
    showState('unreadable');
    return;
  }
  clearTimeout(slow);
  $('status').hidden = true;
  await refreshMatches();
  await refreshLink();
  renderAll();
  enter();
  requestMatching();
  pollPlayback();
  setInterval(pollPlayback, POLL_MS);

  watchMatches(async keys => {
    const mine = keys.filter(k => allItems().some(t => t.key === k));
    if (!mine.length) return;
    const before = Object.fromEntries(mine.map(k => [k, view(k).status]));
    await refreshMatches(mine);
    for (const k of mine) {
      const was = before[k];
      if ((was === 'pending' || was === 'matching') && LEVELS[view(k).status] > 0) st.justMatched.add(k);
      // Do not rebuild a row whose Change panel is open: it would wipe what the user typed.
      if (k !== st.open && !(k === st.page.current?.key && st.nowOpen)) updateKey(k);
      st.justMatched.delete(k);
    }
    renderMeta();
    renderBar();
  });
}

init();

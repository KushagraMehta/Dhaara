// Background worker: matching, play/queue/save jobs and the Spotify setup helper.
// Work lives here so it keeps going after the popup closes.
// Two Spotify providers with the same functions: 'app' (spotify.js, the official PKCE login) and 'web'
// (spotify-web.js, the unofficial no-setup login through an open.spotify.com tab). The mode is kept
// in chrome.storage.local and every piece of work picks the provider when it starts.
import * as app from './spotify.js';
import * as web from './spotify-web.js';
import { matchItem, confidence } from './match.js';
import {
  JOB_KEY, LOGIN_KEY, MODE_KEY, WEB_PROBLEM_KEY, QUEUE_KEY, MORE_KEY, LINKS_KEY, DEVICE_KEY, CHECKS_KEY,
  DESKTOP_KEY, EXCLUSIVE_KEY,
  matchKey, trackKey, readMatches, readLinks, linkFor, isTicked,
} from './store.js';

const USER_KEY = 'yt2sp:user';    // session: { id, name, image }
const SETUP_KEY = 'yt2sp:setup';  // session: set while the user is setting up their Spotify app: { at, known, created, target }
const SETUP_URL = 'https://developer.spotify.com/dashboard';
const SETUP_SCRIPT = 'yt2sp-setup';   // id of the registered content script for developer.spotify.com
const SETUP_MS = 30 * 60_000;         // how long a setup may take before the script is taken away again
const MAX_CACHED = 3000;
const NONE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;  // a song "not on Spotify" is searched again after a week
const MAX_LINKS = 100;
const MAX_SAVED_URIS = 2000;
const MAX_ALTS = 3;                   // alternatives kept per match (the cache has to fit the storage quota)

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- provider ----------

const PROVIDERS = { app, web };

async function getMode() {
  return (await chrome.storage.local.get(MODE_KEY))[MODE_KEY] === 'web' ? 'web' : 'app';
}

async function provider() {
  return PROVIDERS[await getMode()];
}

// Not the user's fault, so the UI offers the official setup (only the web provider throws these).
const needsSetup = err => Boolean(err?.needsSetup);

// ---------- the no-setup login's page scripts ----------
// spotify-hook.js (it wraps the player's fetch) and spotify-bridge.js are NOT in the manifest: they are
// registered only while the mode is 'web', so someone who uses the official setup never runs them
// (decision 4, review finding 2).

const WEB_SCRIPTS = [
  { id: 'yt2sp-web-hook', matches: ['https://open.spotify.com/*'], js: ['spotify-hook.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true },
  { id: 'yt2sp-web-bridge', matches: ['https://open.spotify.com/*'], js: ['spotify-bridge.js'], runAt: 'document_start', persistAcrossSessions: true },
];

// One change at a time, so two quick calls never hit "Duplicate script ID".
let webScriptsQueue = Promise.resolve();

// Registered when the mode is 'web', removed otherwise (or always, with off: true).
function syncWebScripts({ off = false } = {}) {
  webScriptsQueue = webScriptsQueue.catch(() => {}).then(async () => {
    const want = !off && (await getMode()) === 'web';
    const have = new Set((await chrome.scripting.getRegisteredContentScripts({ ids: WEB_SCRIPTS.map(s => s.id) })).map(s => s.id));
    if (want) {
      const missing = WEB_SCRIPTS.filter(s => !have.has(s.id));
      if (missing.length) await chrome.scripting.registerContentScripts(missing);
    } else if (have.size) {
      await chrome.scripting.unregisterContentScripts({ ids: [...have] });
    }
  });
  return webScriptsQueue;
}

// Tabs that were already open do not get a registered script until they reload, so the scripts are
// also injected into them now (both ignore a second copy).
async function injectIntoSpotifyTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
  for (const tab of tabs) {
    if (tab.discarded) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['spotify-hook.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['spotify-bridge.js'] });
    } catch (err) {
      console.warn('yt2sp: could not add the page scripts to a Spotify tab:', err?.message);
    }
  }
}

// ---------- account ----------

let refusedMessage = '';  // set when Spotify refuses /me (403): the account is not added under User Management

async function currentUser() {
  const cached = (await chrome.storage.session.get(USER_KEY))[USER_KEY];
  if (cached) return cached;
  const p = await provider();
  if (!(await p.isConnected())) return null;
  refusedMessage = '';
  try {
    const me = await p.me();
    const user = { id: me.id, name: me.display_name || me.id, image: me.images?.[0]?.url || '' };
    await chrome.storage.session.set({ [USER_KEY]: user });
    return user;
  } catch (err) {
    if (err.status === 403) refusedMessage = p.friendlyError(err);
    return null;
  }
}

async function forgetUser(message) {
  await chrome.storage.session.remove(USER_KEY);
  if (message) await chrome.storage.session.set({ [LOGIN_KEY]: message });
}

async function connect() {
  // The page scripts must be registered before the login opens (or reuses) a Spotify tab.
  if ((await getMode()) === 'web') await syncWebScripts();
  await (await provider()).connect();
  await chrome.storage.session.remove([USER_KEY, LOGIN_KEY, WEB_PROBLEM_KEY]);
  const user = await currentUser();
  if (!user && refusedMessage) throw new Error(refusedMessage);
  return user;
}

// Switches provider. Each mode keeps its own stored login, so neither is deleted here. The no-setup
// page scripts follow the mode. Results of "not found" are dropped: they came from the other provider
// and may be wrong for this one (review finding 5).
async function setMode(mode) {
  if (mode !== 'app' && mode !== 'web') throw new Error('Unknown mode');
  const before = await getMode();
  await chrome.storage.local.set({ [MODE_KEY]: mode });
  await chrome.storage.session.remove([USER_KEY, LOGIN_KEY, WEB_PROBLEM_KEY]);
  await syncWebScripts();
  if (mode === 'web') await injectIntoSpotifyTabs();
  if (mode !== before) {
    const all = await chrome.storage.local.get(null);
    const none = Object.keys(all).filter(n => n.startsWith('yt2sp:m:') && all[n]?.status === 'none');
    if (none.length) await chrome.storage.local.remove(none);
  }
  return mode;
}

// ---------- matching ----------

const todo = [];
const inflight = new Set();
let workers = 0;
let epoch = 0;   // bumped by Disconnect, so a search or job that is still running does not write its result back
let inserts = 0;

// A stored result that needs no more searching. Left over 'matching' (a worker that was shut down
// mid-search), errors, and 'none' results older than a week count as not done (decision 17). A 'none'
// also has to come from the provider in use now: another one may find the song.
const isDone = (m, mode) => Boolean(m) && !['error', 'matching', 'pending'].includes(m.status)
  && !(m.status === 'none' && (m.via !== mode || Date.now() - (m.at || 0) > NONE_RETRY_MS));

async function enqueue(items) {
  const mode = await getMode();
  const have = await chrome.storage.local.get(items.map(i => matchKey(i.key)));
  for (const it of items) {
    if (isDone(have[matchKey(it.key)], mode) || inflight.has(it.key)) continue;
    inflight.add(it.key);
    todo.push(it);
  }
  while (workers < 3 && todo.length) {
    workers++;
    worker().finally(() => { workers--; });
  }
}

async function worker() {
  while (todo.length) {
    const it = todo.shift();
    const name = matchKey(it.key);
    const mine = epoch;
    const mode = await getMode();
    const p = PROVIDERS[mode];
    try {
      if (mine !== epoch) continue;
      await chrome.storage.local.set({ [name]: { status: 'matching', at: Date.now() } });
      const { match, alts } = await matchItem(it, q => p.searchTracks(q));
      if (mine !== epoch) continue;
      await chrome.storage.local.set({ [name]: { status: confidence(match?.score), match, alts: (alts || []).slice(0, MAX_ALTS), at: Date.now(), via: mode } });
      // The cache is pruned as it grows, not only at browser start (review finding 10).
      if (++inserts % 100 === 0) pruneMatches().catch(() => {});
    } catch (err) {
      if (mine !== epoch) continue;
      if (err instanceof app.NotConnected || needsSetup(err)) {
        const dropped = [it, ...todo.splice(0)];
        dropped.forEach(x => inflight.delete(x.key));
        await chrome.storage.local.remove(dropped.map(x => matchKey(x.key))).catch(() => {});
        await forgetUser(err.message);
        return;
      }
      // A full storage quota makes this write fail as well; the row then stays "searching" until it is reopened.
      await chrome.storage.local.set({ [name]: { status: 'error', error: p.friendlyError(err), at: Date.now() } }).catch(() => {});
    } finally {
      inflight.delete(it.key);
    }
  }
}

// Keeps the match cache from growing forever: drops the oldest results past MAX_CACHED.
async function pruneMatches() {
  const all = await chrome.storage.local.get(null);
  const names = Object.keys(all).filter(n => n.startsWith('yt2sp:m:'));
  if (names.length <= MAX_CACHED) return;
  names.sort((a, b) => (all[a]?.at || 0) - (all[b]?.at || 0));
  await chrome.storage.local.remove(names.slice(0, names.length - MAX_CACHED));
}

// ---------- jobs: play, queue, save, like ----------

const MESSAGES = { play: 'Starting playback…', queue: 'Adding to queue…', save: 'Saving…', like: 'Adding to Liked Songs…' };
const NO_DEVICE = 'No Spotify player found. Open Spotify (desktop app or open.spotify.com), play any song for a second, then try again.';

// More than one player and no sign of which one: the UI asks, remembers the answer and retries (feature 8).
class NeedsDevice extends Error {
  constructor(devices) {
    super('More than one Spotify player is available. Choose which one to use.');
    this.devices = devices.map(({ id, name, type }) => ({ id, name, type }));
  }
}

// A Computer that is not a web player: the Spotify desktop app. "Open in Spotify" uses this (decision 18).
const isWebPlayer = d => d.web === true || /web player|in your browser/i.test(d.name || '');

// Remembers when the desktop app was last seen in a device list, for "Open Songs In: Automatic".
async function noteDevices(devices) {
  if (devices.some(d => d.type === 'Computer' && !isWebPlayer(d))) await chrome.storage.local.set({ [DESKTOP_KEY]: Date.now() }).catch(() => {});
}

// The active player first, then the one the user chose before (if it is still listed), then the only
// one there is. A Web Player tab gets a new id on every load, so a remembered name that matches
// exactly one listed player counts too.
async function pickDevice(p) {
  const devices = await p.listDevices();
  await noteDevices(devices);
  if (!devices.length) throw new Error(NO_DEVICE);
  const active = devices.find(d => d.active);
  if (active) return active;
  const saved = (await chrome.storage.local.get(DEVICE_KEY))[DEVICE_KEY];
  if (saved) {
    const named = devices.filter(d => d.name === saved.name);
    const remembered = devices.find(d => d.id === saved.id) || (named.length === 1 ? named[0] : null);
    if (remembered) return remembered;
  }
  if (devices.length === 1) return devices[0];
  throw new NeedsDevice(devices);
}

// Records that this Mix was saved to this playlist, with the songs saved so far. Only ever grows.
async function rememberLink({ listId, playlistId, name, user, mode, uris, fresh }) {
  const links = await readLinks();
  const current = linkFor(links, listId, user, mode);
  let next;
  if (fresh) {
    next = { playlistId, name, userId: user.id, mode, savedUris: [...new Set(uris)], savedAt: Date.now() };
  } else if (current?.playlistId === playlistId) {
    next = { ...current, name: name || current.name, savedUris: [...new Set([...(current.savedUris || []), ...uris])], savedAt: Date.now() };
  } else {
    return;
  }
  next.savedUris = next.savedUris.slice(-MAX_SAVED_URIS);
  links[listId] = next;
  const keep = Object.entries(links).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)).slice(0, MAX_LINKS);
  await chrome.storage.local.set({ [LINKS_KEY]: Object.fromEntries(keep) });
}

async function dropLink(listId) {
  const links = await readLinks();
  if (!links[listId]) return;
  delete links[listId];
  await chrome.storage.local.set({ [LINKS_KEY]: links });
}

// ---------- one player at a time (decision 19) ----------
// Spotify's terms do not allow its audio next to video, and two players at once are confusing anyway.
// With the setting on (the default), Dhaara pauses YouTube before it starts Spotify, and pauses Spotify
// when YouTube starts playing.

async function isExclusive() {
  return (await chrome.storage.local.get(EXCLUSIVE_KEY))[EXCLUSIVE_KEY] !== false;
}

// Pauses the main video in every open YouTube / YouTube Music tab. Tabs without our reader (open before
// the extension was installed, or asleep) are skipped. Returns how many were playing.
async function pauseYouTube() {
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://music.youtube.com/*'] });
  const results = await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'yt2sp:pauseVideo' }).catch(() => null)));
  return results.filter(r => r?.wasPlaying).length;
}

// Whether the provider can be asked about playback without a prompt or a new tab.
async function canReadPlayback(p, scopes = ['user-read-playback-state']) {
  if (!(await p.isConnected()) || !(await p.hasScopes(scopes))) return false;
  return p !== web || web.hasTab();
}

let lastYouTubeStart = 0;

// A YouTube tab started playing: pause Spotify if it is playing, and say so on the status line.
async function youtubeStarted() {
  if (Date.now() - lastYouTubeStart < 3000) return;
  lastYouTubeStart = Date.now();
  if (!(await isExclusive())) return;
  const p = await provider();
  if (!(await canReadPlayback(p, ['user-read-playback-state', 'user-modify-playback-state']))) return;
  const state = await p.getPlayback();
  if (!state?.isPlaying) return;
  await p.pause();
  const now = (await chrome.storage.session.get(JOB_KEY))[JOB_KEY];
  if (now?.running && Date.now() - now.at < 120_000) return;   // do not replace the line of a job that is running
  await chrome.storage.session.set({ [JOB_KEY]: { action: 'pause', done: 0, total: 0, running: false, message: 'Paused Spotify because YouTube started playing.', at: Date.now() } });
}

let saving = false;   // a save is running: a second one (double click, Enter then click) is refused (review finding 8)

// playlistName: what the user sees for the target playlist (the typed name, or an existing playlist's name).
// listId: set when the songs are a whole Mix or playlist, so the save is remembered as a link (decision 3).
// viaShortcut: the job came from a keyboard shortcut, so the popup may have to finish it (a device choice).
async function runJob({ action, uris = [], target, name, playlistName, isPublic, description, listId, viaShortcut }) {
  if (action === 'save' && saving) return { error: 'A save is already running. Wait for it to finish.' };
  const mine = epoch;   // Disconnect during a job: its later writes are dropped, so the wiped data does not come back
  const job = { action, done: 0, total: uris.length, running: true, message: MESSAGES[action], at: Date.now(), ...(viaShortcut && { viaShortcut: true }) };
  const update = patch => (mine === epoch ? chrome.storage.session.set({ [JOB_KEY]: Object.assign(job, patch, { at: Date.now() }) }) : Promise.resolve());
  await update({});
  if (action === 'save') saving = true;
  const p = await provider();
  try {
    if (!uris.length) throw new Error('Tick at least one song first.');
    const n = uris.length;
    const songs = `${n} ${n === 1 ? 'song' : 'songs'}`;
    if (action === 'play' || action === 'queue') {
      await p.ensureScopes(['user-read-playback-state', 'user-modify-playback-state']);
      const device = await pickDevice(p);
      if (action === 'play') {
        // Only one player at a time: YouTube is paused first, then Spotify starts.
        if (await isExclusive()) await pauseYouTube();
        const res = await p.playNow(uris, device.id, i => update({ done: i, message: `Starting playback… ${i}/${n}` }));
        // Only say "Playing" when the player confirmed it: a desktop app that is not the active device
        // can accept the request and ignore it.
        if (res?.verified === false) {
          throw new Error(`Spotify didn't start playing on ${device.name}. Open the Spotify app, press play on any song once, then try again.`);
        }
        const sent = res?.played ?? n;
        const limit = sent < n ? ` Spotify takes up to ${sent} songs at once.` : '';
        const shown = sent < n ? `${sent} of ${n} songs` : songs;
        await update({
          message: (res?.verified === null
            ? `Sent to ${device.name}. If it didn't start, press play in Spotify.`
            : res?.playing === false
              ? `Loaded on ${device.name}. Press play in Spotify if it didn't start.`
              : `Playing ${shown} on ${device.name}.`) + limit,
        });
      } else {
        await p.addToQueue(uris, device.id, i => update({ done: i, message: `Adding to queue… ${i}/${n}` }));
        await update({ message: `Queued ${songs} on ${device.name}.` });
      }
    } else if (action === 'like') {
      // user-library-read is for the heart (reading Liked Songs back); an older login gets it now, once.
      await p.ensureScopes(['user-library-modify', 'user-library-read']);
      await p.saveToLibrary(uris);
      await update({ message: n === 1 ? 'Added to Liked Songs.' : `Added ${songs} to Liked Songs.` });
    } else if (action === 'save') {
      const user = listId ? await currentUser() : null;
      const mode = await getMode();
      const link = user ? linkFor(await readLinks(), listId, user, mode) : null;
      let id = target;
      let added = n;
      let skipped = 0;
      if (target === 'new') {
        id = (await p.createPlaylist(name, description, isPublic)).id;
        await p.addItems(id, uris);
      } else {
        let existing;
        try {
          existing = await p.playlistUris(id);
        } catch (err) {
          if (err.status === 404) {
            if (link?.playlistId === id) await dropLink(listId);
            throw new Error('That playlist is gone from Spotify. Save again to make a new one.');
          }
          throw err;
        }
        // Songs saved earlier count as there even if they were taken out by hand: saving only ever adds.
        const earlier = new Set(link?.playlistId === id ? link.savedUris : []);
        const fresh = uris.filter(u => !existing.has(u) && !earlier.has(u));
        skipped = n - fresh.length;
        added = fresh.length;
        await p.addItems(id, fresh);
      }
      const where = playlistName || name || 'your playlist';
      if (user && mine === epoch) await rememberLink({ listId, playlistId: id, name: where, user, mode, uris, fresh: target === 'new' });
      await update({
        message: added
          ? `Saved ${added} ${added === 1 ? 'song' : 'songs'} to ${where}${skipped ? ` (${skipped} already added)` : ''}.`
          : `Nothing new to save: ${skipped === 1 ? 'that song is' : `all ${skipped} songs are`} already in ${where}.`,
        link: `https://open.spotify.com/playlist/${id}`,
        playlistId: id,
      });
    } else {
      throw new Error(`Unknown action ${action}`);
    }
    await update({ running: false });
    return { job };
  } catch (err) {
    const needsLogin = err instanceof app.NotConnected;
    const setup = needsSetup(err);
    const choose = err instanceof NeedsDevice;
    if (needsLogin || setup) await forgetUser(err.message);
    const message = p.friendlyError(err);
    await update({
      running: false, error: message, message: '',
      ...(setup && { needsSetup: true }),
      ...(choose && { needsDevice: true, devices: err.devices, retry: { action, uris } }),
    });
    return { error: message, needsLogin, needsSetup: setup, ...(choose && { needsDevice: true, devices: err.devices }), job };
  } finally {
    if (action === 'save') saving = false;
  }
}

// ---------- keyboard shortcuts (feature 1) ----------
// Each one reads the active YouTube tab, uses the cached match (or matches the song now) and acts only on
// a sure one. The toolbar icon's badge says how it went: ✓ done, ? not sure (nothing was done), ! error.

const BADGES = {
  busy: { text: '…', color: '#6a6a70', clear: 0 },
  ok: { text: '✓', color: '#0066cc', clear: 3000 },
  ask: { text: '?', color: '#a35200', clear: 8000 },
  err: { text: '!', color: '#d70015', clear: 15000 },
};
const TOOLBAR_TITLE = 'Dhaara';
let badgeSeq = 0;

async function clearBadge() {
  await Promise.all([chrome.action.setBadgeText({ text: '' }), chrome.action.setTitle({ title: TOOLBAR_TITLE })]).catch(() => {});
}

async function showBadge(kind, tip = '') {
  const b = BADGES[kind];
  const seq = ++badgeSeq;
  await Promise.all([
    chrome.action.setBadgeText({ text: b.text }),
    chrome.action.setBadgeBackgroundColor({ color: b.color }),
    chrome.action.setBadgeTextColor?.({ color: '#ffffff' }),
    chrome.action.setTitle({ title: tip ? `${TOOLBAR_TITLE}: ${tip}` : TOOLBAR_TITLE }),
  ].filter(Boolean)).catch(() => {});
  if (b.clear) setTimeout(() => { if (seq === badgeSeq) clearBadge(); }, b.clear);
}

// A worker that was stopped in the middle of a shortcut leaves its "…" badge behind, and its clear timer
// died with it. A fresh worker has nothing running, so a "…" it finds is stale (review finding 9).
{
  const seq = badgeSeq;
  chrome.action.getBadgeText({}).then(text => { if (seq === badgeSeq && text === BADGES.busy.text) clearBadge(); }).catch(() => {});
}

class Doubt extends Error {}    // a "?" outcome: nothing is done
class Stored extends Error {}   // an error runJob already wrote to JOB_KEY

const isYouTube = url => /^https:\/\/(www|music)\.youtube\.com\//.test(url || '');

async function youtubeTab(tab) {
  let t = tab;
  if (!t?.id || !isYouTube(t.url)) [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!t?.id || !isYouTube(t.url)) throw new Doubt('Open a song or Mix on YouTube first.');
  return t;
}

// What the popup reads from the page, with the same keys. A tab that was open before the extension
// was installed has no reader yet: inject it and ask again.
async function readPage(tab) {
  const msg = { type: 'yt2sp:extract' };
  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    res = await chrome.tabs.sendMessage(tab.id, msg);
  }
  if (res?.error) throw new Doubt(res.error);
  const site = new URL(tab.url).hostname === 'music.youtube.com' ? 'ytmusic' : 'youtube';
  const withKey = t => ({ ...t, site, key: trackKey(t) });
  return { source: res.source, tracks: (res.tracks || []).map(withKey), current: res.current ? withKey(res.current) : null };
}

// Cached results are used as they are; the rest are searched now, and this waits for them.
async function settledMatches(items, timeoutMs = 120_000) {
  const keys = items.map(i => i.key);
  const mode = await getMode();
  let views = await readMatches(keys);
  const open = () => items.filter(i => !isDone(views[i.key], mode));
  if (!open().length) return views;
  await enqueue(open());
  const end = Date.now() + timeoutMs;
  while (open().length && Date.now() < end) {
    await sleep(400);
    views = await readMatches(keys);
    // The worker gave up (the login was lost): nothing is searching these any more.
    if (!open().some(i => inflight.has(i.key) || todo.some(t => t.key === i.key))) break;
  }
  return views;
}

const isSure = v => Boolean(v?.match) && (v.status === 'high' || v.status === 'picked');

async function signedInUser() {
  const user = await currentUser();
  if (!user) throw new Error(refusedMessage || 'Open Dhaara and connect Spotify first.');
  return user;
}

async function songShortcut(tab, action) {
  await signedInUser();
  const { current } = await readPage(tab);
  if (!current) throw new Doubt('No song found on this page.');
  const v = (await settledMatches([current]))[current.key];
  if (v.status === 'error') throw new Error(v.error || 'Spotify search failed.');
  if (!isSure(v)) throw new Doubt(v.match ? 'Not sure about this match. Open Dhaara to check it.' : 'No match on Spotify. Open Dhaara to look.');
  const res = await runJob({ action, uris: [v.match.uri], viaShortcut: true });
  if (res.error) throw new Stored(res.error);
  return res.job.message;
}

// The Mix on the page, to its linked playlist: only the songs that start ticked (sure matches and hand
// picks), minus the ones the user unticked in the popup. A Mix with no link yet gets a new private
// playlist, which is then linked.
async function saveMixShortcut(tab) {
  const user = await signedInUser();
  const { source, tracks } = await readPage(tab);
  if (!source?.listId) throw new Doubt('Open a Mix or playlist first.');
  const more = (await chrome.storage.session.get(MORE_KEY))[MORE_KEY]?.[source.listId] || [];
  const known = new Set(tracks.map(t => t.key));
  const items = [...tracks, ...more.filter(t => !known.has(t.key))];
  if (!items.length) throw new Doubt('No songs found in this Mix.');
  const views = await settledMatches(items);
  const checks = (await chrome.storage.session.get(CHECKS_KEY))[CHECKS_KEY] || {};
  const uris = [...new Set(items.filter(t => isTicked(views[t.key], checks[t.key])).map(t => views[t.key].match.uri))];
  if (!uris.length) throw new Doubt('No sure matches in this Mix yet. Open Dhaara to look.');
  const link = linkFor(await readLinks(), source.listId, user, await getMode());
  const title = source.title || 'From YouTube';
  const res = await runJob({
    action: 'save',
    uris,
    target: link ? link.playlistId : 'new',
    name: title,
    playlistName: link ? link.name : title,
    isPublic: false,
    description: `Imported from YouTube: ${title}`.slice(0, 300),
    listId: source.listId,
    viaShortcut: true,
  });
  if (res.error) throw new Stored(res.error);
  return res.job.message;
}

const SHORTCUTS = {
  'like-current': { action: 'like', run: tab => songShortcut(tab, 'like') },
  'queue-current': { action: 'queue', run: tab => songShortcut(tab, 'queue') },
  'save-mix': { action: 'save', run: saveMixShortcut },
};

async function runShortcut(command, tab) {
  if (!Object.hasOwn(SHORTCUTS, command)) return;
  const { action, run } = SHORTCUTS[command];
  await showBadge('busy', 'Working…');
  try {
    const message = await run(await youtubeTab(tab));
    await showBadge('ok', message);
  } catch (err) {
    if (err instanceof Doubt) return showBadge('ask', err.message);
    const message = (await provider()).friendlyError(err);
    // Errors thrown outside runJob are not in JOB_KEY yet; the popup shows what is there.
    if (!(err instanceof Stored)) {
      await chrome.storage.session.set({ [JOB_KEY]: { action, done: 0, total: 0, running: false, error: message, message: '', at: Date.now(), viaShortcut: true } });
    }
    await showBadge('err', message);
  }
}

chrome.commands.onCommand.addListener((command, tab) => { runShortcut(command, tab); });

// ---------- login in a normal tab (Brave fallback) ----------
// Top-level listeners, so a worker that was stopped while the user typed a password still finishes the
// login when the tab reaches the redirect URI (spotify.js keeps the PKCE state in session storage).

async function afterTabLogin(result) {
  if (!result) return;
  if (result.ok) await chrome.storage.session.remove([USER_KEY, LOGIN_KEY, WEB_PROBLEM_KEY]);
  else if (!result.closed) await forgetUser(result.error);
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || tab?.pendingUrl || tab?.url || '';
  if (url.startsWith(app.redirectUri())) app.loginTabUpdated(tabId, url).then(afterTabLogin).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => { app.loginTabClosed(tabId).then(afterTabLogin).catch(() => {}); });

// ---------- setup helper ----------
// The official setup: the user's own Spotify app, with this extension's redirect URI on it. The page
// script (spotify-setup.js) runs on developer.spotify.com only while a setup is active. It may only
// hand over the Client ID of an app that THIS setup created (a new ID, reached straight from the Create
// form), or of an existing app the user explicitly chose with its confirmation button; either way the
// redirect URI is checked on that app's settings page first (review finding 1).

let setupTimer;
let starting = null;

async function unregisterSetupScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SETUP_SCRIPT] });
  } catch {
    // It was not registered.
  }
}

async function endSetup() {
  clearTimeout(setupTimer);
  await chrome.storage.session.remove(SETUP_KEY);
  await unregisterSetupScript();
}

// A page that was already loading when the script was registered may not get it, so the new tab is
// also given the script by hand once it has finished loading. The script ignores a second copy.
function injectWhenLoaded(tabId) {
  const stop = () => chrome.tabs.onUpdated.removeListener(onUpdated);
  const inject = () => chrome.scripting.executeScript({ target: { tabId }, files: ['spotify-setup.js'] }).catch(() => {});
  function onUpdated(id, info) {
    if (id !== tabId || info.status !== 'complete') return;
    stop();
    inject();
  }
  chrome.tabs.onUpdated.addListener(onUpdated);
  setTimeout(stop, 60_000);
  chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') { stop(); inject(); } }, () => {});
}

// One start at a time: a second click while the first runs gets the same answer (review finding 19).
function startSetup() {
  starting ??= (async () => {
    await chrome.storage.session.set({ [SETUP_KEY]: { at: Date.now(), known: null, created: false, target: null } });
    await unregisterSetupScript();
    await chrome.scripting.registerContentScripts([{
      id: SETUP_SCRIPT,
      matches: ['https://developer.spotify.com/*'],
      js: ['spotify-setup.js'],
      runAt: 'document_idle',
      persistAcrossSessions: false,
    }]);
    clearTimeout(setupTimer);
    setupTimer = setTimeout(endSetup, SETUP_MS);
    const tab = await chrome.tabs.create({ url: SETUP_URL });
    injectWhenLoaded(tab.id);
  })().finally(() => { starting = null; });
  return starting;
}

// The flag of the running setup, or null (none, or it ran out: the 30 minute timer does not survive a
// sleeping worker, so the script asking is the other check).
async function setupFlag() {
  const flag = (await chrome.storage.session.get(SETUP_KEY))[SETUP_KEY];
  if (flag && Date.now() - flag.at >= SETUP_MS) {
    await endSetup();
    return null;
  }
  return flag || null;
}

async function patchSetup(patch) {
  const flag = await setupFlag();
  if (!flag) return null;
  const next = { ...flag, ...patch };
  await chrome.storage.session.set({ [SETUP_KEY]: next });
  return next;
}

async function setupState() {
  const flag = await setupFlag();
  return {
    active: Boolean(flag),
    redirectUri: app.redirectUri(),
    hasClientId: Boolean(await app.getClientId()),
    known: flag?.known ?? null,
    created: Boolean(flag?.created),
    target: flag?.target || null,
  };
}

const isClientId = id => typeof id === 'string' && /^[0-9a-f]{32}$/i.test(id);

// The app IDs the dashboard list showed when setup began: only an ID that is not among them can be a
// brand new app.
async function setupApps(ids) {
  const flag = await setupFlag();
  if (!flag) return { active: false };
  if (flag.target) return { ok: true };
  const list = (Array.isArray(ids) ? ids : []).filter(isClientId).map(id => id.toLowerCase()).slice(0, 50);
  await patchSetup({ known: [...new Set([...(flag.known || []), ...list])] });
  return { ok: true };
}

// The app the user is working on. 'created': the page went from the Create form to this app, and it
// is not one the list showed. 'existing': the user clicked "Use this app" for it.
async function setupTarget({ clientId, via, fromCreate }) {
  if (!isClientId(clientId)) return { error: 'Not a Client ID' };
  const flag = await setupFlag();
  if (!flag) return { active: false };
  const id = clientId.toLowerCase();
  if (via === 'created') {
    // With a snapshot of the list, a new app is simply one that was not in it; without one, the page must
    // have come straight from the Create form.
    const isNew = flag.known ? !flag.known.includes(id) : fromCreate === true;
    if (!flag.created || !isNew) return { error: 'That is not the app this setup created.' };
  } else if (via !== 'existing') {
    return { error: 'Unknown request' };
  }
  await patchSetup({ target: { id, via } });
  return { ok: true };
}

// The user confirmed this app (or it was created here and its redirect URI is in place): save it.
async function foundClientId(clientId) {
  if (!isClientId(clientId)) return { error: 'Not a Client ID' };
  const flag = await setupFlag();
  if (!flag) return { saved: false };
  if (flag.target?.id !== clientId.toLowerCase()) return { error: 'That is not the app chosen for this setup.' };
  const current = await app.getClientId();
  if (current !== clientId) await app.setClientId(clientId);
  await endSetup();
  // The setup helper is the official way, so this is the app login even if the no-setup one was on.
  if ((await getMode()) !== 'app') await setMode('app');
  // Log in right away, so the user does not have to come back and click Connect.
  try {
    await connect();
    return { saved: true, connected: true };
  } catch (err) {
    return { saved: true, connected: false, error: err.message };
  }
}

// ---------- disconnect: delete personal data (decision 17) ----------

// Keeps the Client ID and the mode (the user's own setup); everything else about the account goes:
// the login, saved matches and picks, the list, playlist links, the device, ticks and session state.
async function wipePersonalData() {
  epoch++;
  todo.length = 0;
  inflight.clear();
  await app.disconnect();
  await web.disconnect();
  // Signed out of the no-setup login: its page scripts are not needed until it connects again.
  await syncWebScripts({ off: true }).catch(() => {});
  const all = await chrome.storage.local.get(null);
  const personal = Object.keys(all).filter(n => n.startsWith('yt2sp:m:') || n.startsWith('yt2sp:p:'));
  await chrome.storage.local.remove([...personal, QUEUE_KEY, LINKS_KEY, DEVICE_KEY]);
  const session = Object.keys(await chrome.storage.session.get(null)).filter(n => n.startsWith('yt2sp:') && n !== SETUP_KEY);
  await chrome.storage.session.remove(session);
  await clearBadge();
}

// ---------- messages ----------

const fromSpotifyDashboard = sender => sender.tab?.url?.startsWith('https://developer.spotify.com/');

// Playback controls ignore "restriction violated" (pausing what is already paused).
const ignoreRestriction = err => {
  if (err?.status === 403 && /restriction/i.test(err.detail || err.message || '')) return {};
  throw err;
};

const handlers = {
  async status() {
    const user = await currentUser();
    const webProblem = (await chrome.storage.session.get(WEB_PROBLEM_KEY))[WEB_PROBLEM_KEY] || null;
    return { user, hasClientId: Boolean(await app.getClientId()), mode: await getMode(), webProblem };
  },
  async connect() {
    return { user: await connect() };
  },
  async disconnect() {
    await wipePersonalData();
    return {};
  },
  // Starting the official setup means leaving the no-setup mode.
  async setup() {
    if ((await getMode()) !== 'app') await setMode('app');
    await startSetup();
    return {};
  },
  async setClientId({ clientId }) {
    await app.setClientId(clientId);
    await forgetUser();
    await endSetup();
    return {};
  },
  async setMode({ mode }) {
    return { mode: await setMode(mode) };
  },
  // Search for the popup and the full view, with whichever provider is selected.
  async search({ q }) {
    const text = String(q ?? '').trim();
    if (!text) return { tracks: [] };
    try {
      return { tracks: await (await provider()).searchTracks(text) };
    } catch (err) {
      if (err instanceof app.NotConnected || needsSetup(err)) await forgetUser(err.message);
      throw err;
    }
  },
  async match({ items }) {
    await enqueue(items || []);
    return {};
  },
  async run(msg) {
    return runJob(msg);
  },
  async playlists() {
    const user = await currentUser();
    if (!user) throw new app.NotConnected('Connect Spotify first');
    return { playlists: await (await provider()).myPlaylists(user.id) };
  },
  // Which songs are in the real Liked Songs: { liked: { [uri]: boolean } }. Never prompts and never fails
  // the popup: an older login without user-library-read, or a web player without the operation, gives {}.
  // In web mode it does not open a Spotify tab just to ask: with no tab already open, the heart shows
  // what was liked in this session.
  async liked({ uris }) {
    const list = [...new Set((Array.isArray(uris) ? uris : []).filter(u => /^spotify:track:[A-Za-z0-9]+$/.test(u)))].slice(0, 200);
    if (!list.length) return { liked: {} };
    try {
      const p = await provider();
      if (!(await p.hasScopes(['user-library-read']))) return { liked: {} };
      if (p === web && !(await web.hasTab())) return { liked: {} };
      return { liked: await p.areSaved(list) };
    } catch {
      return { liked: {} };
    }
  },
  // For the Save sheet of a linked Mix: how many of these songs are new to its playlist. A song counts
  // as new when it is neither in the link's savedUris nor in the playlist (where the provider can tell).
  async linkInfo({ listId, uris }) {
    const user = await currentUser();
    const link = user ? linkFor(await readLinks(), listId, user, await getMode()) : null;
    if (!link) return { link: null };
    const saved = new Set(link.savedUris || []);
    let inPlaylist = new Set();
    try {
      inPlaylist = await (await provider()).playlistUris(link.playlistId);
    } catch {
      // Keep going with what was saved before.
    }
    const fresh = (uris || []).filter(u => !saved.has(u) && !inPlaylist.has(u));
    return { link: { playlistId: link.playlistId, name: link.name }, fresh: fresh.length };
  },
  async setDevice({ id, name }) {
    if (typeof id !== 'string' || !id) throw new Error('No device chosen');
    await chrome.storage.local.set({ [DEVICE_KEY]: { id, name: String(name || '').slice(0, 120) } });
    return {};
  },
  // What Spotify is playing, for the popup (it asks every 3 s while it is open, never in the background):
  // { isPlaying, item: { uri, linkedUri, name, artists }, device: { id, name }, progressMs, durationMs },
  // or { isPlaying: false }. It never prompts, never opens a Spotify tab and never fails the popup.
  async playback() {
    try {
      const p = await provider();
      if (!(await canReadPlayback(p))) return { isPlaying: false };
      return await p.getPlayback();
    } catch {
      return { isPlaying: false };
    }
  },
  async pause() {
    const p = await provider();
    await p.ensureScopes(['user-read-playback-state', 'user-modify-playback-state']);
    try {
      await p.pause();
    } catch (err) {
      return ignoreRestriction(err);
    }
    return {};
  },
  // Starting Spotify again counts as Dhaara-started playback: YouTube is paused first.
  async resume() {
    const p = await provider();
    await p.ensureScopes(['user-read-playback-state', 'user-modify-playback-state']);
    if (await isExclusive()) await pauseYouTube();
    try {
      await p.resume();
    } catch (err) {
      return ignoreRestriction(err);
    }
    return {};
  },
  // A YouTube tab's video started playing (content.js).
  async youtubePlaying(_msg, sender) {
    if (!isYouTube(sender.tab?.url)) return {};
    try {
      await youtubeStarted();
    } catch (err) {
      console.warn('yt2sp: could not pause Spotify:', err?.message);
    }
    return {};
  },
  async setupState(_msg, sender) {
    if (!fromSpotifyDashboard(sender)) return { active: false };
    return setupState();
  },
  async setupApps({ ids }, sender) {
    if (!fromSpotifyDashboard(sender)) return { error: 'Wrong page' };
    return setupApps(ids);
  },
  async setupCreate(_msg, sender) {
    if (!fromSpotifyDashboard(sender)) return { error: 'Wrong page' };
    await patchSetup({ created: true });
    return { ok: true };
  },
  async setupTarget(msg, sender) {
    if (!fromSpotifyDashboard(sender)) return { error: 'Wrong page' };
    return setupTarget(msg);
  },
  async foundClientId({ clientId }, sender) {
    if (!fromSpotifyDashboard(sender)) return { error: 'Wrong page' };
    return foundClientId(clientId);
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const name = typeof msg?.type === 'string' && msg.type.startsWith('yt2sp:') ? msg.type.slice(6) : null;
  const handler = name && Object.hasOwn(handlers, name) ? handlers[name] : null;
  if (!handler || sender.id !== chrome.runtime.id) return;
  handler(msg, sender).then(sendResponse, async err => {
    const p = await provider();
    sendResponse({ error: p.friendlyError(err), needsLogin: err instanceof app.NotConnected, needsSetup: needsSetup(err) });
  });
  return true;
});

// A browser start or an update leaves no setup running and no setup script registered, and the page
// scripts of the no-setup login follow the mode.
const settle = () => { pruneMatches().catch(() => {}); endSetup(); syncWebScripts().catch(() => {}); };
chrome.runtime.onStartup.addListener(settle);
chrome.runtime.onInstalled.addListener(settle);

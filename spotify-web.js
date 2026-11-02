// "No setup" Spotify provider (unofficial): uses the user's own logged-in Spotify web player.
// It has the same exports as spotify.js, so background.js can pick either one by mode.
//
// How it works: an open.spotify.com tab runs spotify-hook.js (page world) and spotify-bridge.js
// (isolated world). The hook has the player's own session headers and makes requests for us;
// this file asks it through chrome.tabs.sendMessage. The session never leaves the page. This file
// owns everything that does not have to run in the page: finding or opening the tab, the
// persisted-query hash registry, pacing, retries, response mapping and the fallback to the
// official login.
//
// Spotify's terms do not allow this. The private API changes without notice, so every failure that
// is not the user's fault throws an Error with .needsSetup = true, and the last one is kept in
// chrome.storage.session (WEB_PROBLEM_KEY) for the status call.
//
// Adapted from MIT code: spotify-full-experience (hash registry with a PersistedQueryNotFound
// retry, Connect play and queue commands), hearted.music (playlist/v2 create + rootlist, the
// addToPlaylist / libraryV3 / fetchPlaylistContents / profileAttributes shapes, 200 ms pacing) and
// spogo (finding operation hashes in the web player's webpack chunks). See THIRD_PARTY_NOTICES.md.

import { NotConnected, patientSleep } from './spotify.js';
import { WEB_PROBLEM_KEY } from './store.js';

export { NotConnected };

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SPOTIFY_URL = 'https://open.spotify.com/';
const USER_KEY = 'yt2sp:webUser';      // local: last profile; its presence means "connected in web mode"
const HASH_KEY = 'yt2sp:webHashes';    // local: { build, hashes, at } hashes of one web-player build
const SESSION_WAIT_MS = 20_000;        // how long to wait for the player's session headers
const MIN_GAP_MS = 200;                // spacing between two requests to Spotify

// The operations this file uses. A scan looks for all of them.
const NEEDED = ['searchDesktop', 'profileAttributes', 'libraryV3', 'addToPlaylist', 'addToLibrary', 'fetchPlaylistContents'];

const NOT_LOGGED_IN = 'Log in to Spotify in the tab that opened, then click Connect again.';
const LOGGED_OUT = 'Spotify says you are logged out. Log in at open.spotify.com, then click Connect again.';
const NO_PLAYER = 'Spotify could not reach that player. Open Spotify, play any song for a second, then try again.';
const NOTHING_PLAYING = 'Nothing is playing yet. Start a song in Spotify (or use Play), then queue.';
const PREMIUM = 'Playing and queueing need Spotify Premium.';

// ---------- errors: anything that is not the user's fault offers the official setup ----------

const SETUP = 'Set up Spotify the official way instead.';
const SETUP_MESSAGES = {
  session: `No-setup login could not get a session from the Spotify tab. ${SETUP}`,
  tab: `No-setup login could not start the Spotify tab (the page did not load). ${SETUP}`,
  refused: `No-setup login stopped working (Spotify refused the web player's session). ${SETUP}`,
  changed: `No-setup login stopped working (Spotify changed its web player). ${SETUP}`,
};
let hadProblem = false;

// code: session | tab | refused | no-hash | stale | bad-shape | http. Codes other than the first
// three use the "changed" message.
function setupError(code, detail = '') {
  const err = new Error(SETUP_MESSAGES[code] || SETUP_MESSAGES.changed);
  err.needsSetup = true;
  err.code = code;
  err.detail = detail;
  console.warn('yt2sp: no-setup login problem:', code, detail);
  return err;
}

// Every exported action goes through this: a setup error that reaches the caller is remembered for
// the status call and ends the web login; a later success forgets the problem. Problems an action handles itself (the playlist
// list, the duplicate check) never get here.
const hard = fn => async (...args) => {
  try {
    const result = await fn(...args);
    if (hadProblem) {
      hadProblem = false;
      chrome.storage.session.remove(WEB_PROBLEM_KEY).catch(() => {});
    }
    return result;
  } catch (err) {
    if (err?.needsSetup) {
      hadProblem = true;
      // Remembered for the status call. The saved profile goes too, so the UI shows the login
      // screen with the problem, and one click on Connect tries again.
      await chrome.storage.session.set({ [WEB_PROBLEM_KEY]: err.message }).catch(() => {});
      await chrome.storage.local.remove(USER_KEY).catch(() => {});
    }
    throw err;
  }
};

// Operations that are only nice to have degrade instead of failing when Spotify changed them.
const isSoftFailure = err => err?.needsSetup && ['no-hash', 'bad-shape', 'stale'].includes(err.code);

export const friendlyError = err => err?.message || String(err);

// ---------- the Spotify tab ----------

let tabId = null;
let finding = null;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('The Spotify tab did not answer in time.'), { code: 'timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// One message to the bridge of a tab. Throws an Error with .code (gone | no-hook | timeout | ...).
async function rawCall(id, cmd, args = {}, timeoutMs = 30_000) {
  let res;
  try {
    res = await withTimeout(chrome.tabs.sendMessage(id, { type: 'yt2sp:page', cmd, args }), timeoutMs);
  } catch (err) {
    throw Object.assign(new Error(err?.message || 'No Spotify tab'), { code: err?.code === 'timeout' ? 'timeout' : 'gone' });
  }
  if (!res?.ok) throw Object.assign(new Error(res?.error?.message || 'The Spotify tab did not answer.'), { code: res?.error?.code || 'error' });
  return res.result;
}

async function ping(id) {
  try {
    const res = await chrome.tabs.sendMessage(id, { type: 'yt2sp:page', cmd: 'ping' });
    return res?.ok ? res.result : null;
  } catch {
    return null;
  }
}

async function waitForScripts(id) {
  for (let i = 0; i < 30; i++) {
    if ((await ping(id))?.hookReady) return true;
    await sleep(500);
  }
  return false;
}

async function findTab() {
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
  for (const tab of tabs.filter(t => !t.discarded)) {
    if ((await ping(tab.id))?.hookReady) return tab.id;
  }
  // A tab the browser put to sleep is not playing, so reloading it costs nothing. A live tab without
  // our scripts (opened before the extension was installed) is left alone, because reloading would
  // stop its playback; a second tab is opened for us instead.
  const sleeping = tabs.find(t => t.discarded);
  if (sleeping) {
    await chrome.tabs.reload(sleeping.id);
    if (await waitForScripts(sleeping.id)) return sleeping.id;
  }
  return null;
}

async function openTab() {
  const tab = await chrome.tabs.create({ url: SPOTIFY_URL, active: false });
  if (!(await waitForScripts(tab.id))) throw setupError('tab', 'the new tab never answered');
  return tab.id;
}

// Finds an open.spotify.com tab with our scripts and a session, or opens one in the background.
// One lookup at a time, so three matching workers do not open three tabs.
function ensureTab(force = false) {
  if (force) tabId = null;
  if (tabId !== null) return Promise.resolve(tabId);
  finding ??= (async () => {
    let id = await findTab();
    let fresh = false;
    if (id === null) {
      id = await openTab();
      fresh = true;
    }
    let ready = await sessionReady(id);
    if (!ready && !fresh) {
      // A tab that was open before our scripts could be added only sees the player's session headers
      // when the player makes its next request, which an idle tab may not do for a long time. One that
      // has been silent for 20 s is not playing, so reloading it once costs nothing.
      await chrome.tabs.reload(id).catch(() => {});
      if (await waitForScripts(id)) ready = await sessionReady(id);
    }
    if (!ready) throw setupError('session', 'no authorization header arrived in 20 s');
    tabId = id;
    return id;
  })().finally(() => { finding = null; });
  return finding;
}

async function sessionReady(id) {
  try {
    return (await rawCall(id, 'waitReady', { timeoutMs: SESSION_WAIT_MS }, SESSION_WAIT_MS + 2000)).ready;
  } catch (err) {
    console.warn('yt2sp: waiting for the player session failed:', err.message);
    return false;
  }
}

// Whether a Spotify tab with our scripts is already open. Never opens or reloads one, so reads that
// are only nice to have (the heart, the playback state) do not create a tab.
export async function hasTab() {
  if (tabId !== null) return true;
  const tabs = await chrome.tabs.query({ url: 'https://open.spotify.com/*' });
  for (const tab of tabs.filter(t => !t.discarded)) {
    if ((await ping(tab.id))?.hookReady) return true;
  }
  return false;
}

async function focusTab() {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
  } catch (err) {
    console.warn('yt2sp: could not focus the Spotify tab:', err.message);
  }
}

// Requests to Spotify are spaced at least MIN_GAP_MS apart, with a little jitter. Done here, not in
// the page, because a hidden tab's timers are slowed down by the browser.
let nextSlot = 0;
async function gate() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS + Math.floor(Math.random() * 100);
  if (at > now) await sleep(at - now);
}

// Runs one command in the Spotify tab; reopens the tab (once) if it went away.
async function page(cmd, args = {}, timeoutMs = 30_000) {
  for (let attempt = 0; ; attempt++) {
    const id = await ensureTab(attempt > 0);
    if (cmd === 'pathfinder' || cmd === 'spclient') await gate();
    try {
      return await rawCall(id, cmd, args, timeoutMs);
    } catch (err) {
      if (err.code === 'gone' || err.code === 'no-hook') {
        if (attempt === 0) continue;
        throw setupError('tab', err.message);
      }
      if (err.code === 'no-session') throw setupError('session', err.message);
      if (err.code === 'network') throw new Error('Could not reach Spotify. Check your connection and try again.');
      if (err.code === 'timeout') throw new Error('The Spotify tab did not answer. Check that it is still open, then try again.');
      throw setupError('changed', `${cmd}: ${err.code} ${err.message}`);
    }
  }
}

// ---------- persisted-query hash registry ----------
// Spotify's web player asks for GraphQL operations by the sha256 of the stored query, and those
// hashes change with its builds. They are read at runtime from the player itself, never hard coded:
//   1. the hashes the player sent in this very tab (exactly what works right now);
//   2. the player's JavaScript, where each operation is written as "name","query"|"mutation","<hash>".
//      The main bundle has most; the rest sit in webpack chunks, whose file names come from the
//      chunk-file function in the main bundle (ids -> names, ids -> content hashes).
// The result is cached in chrome.storage.local for one build and dropped when a request comes back
// with 412 or PersistedQueryNotFound.

const OPERATION_RE = /"(\w+)","(query|mutation)","([0-9a-f]{64})"/g;
const isCdn = url => /^https:\/\/open\.spotifycdn\.com\//.test(url);
let registry = null;     // { build, hashes, scanned }: scanned = the bundles were already searched for this build
let loading = null;
let scanning = null;

async function currentBuild() {
  try {
    const status = await page('status');
    if (status.appVersion) return status.appVersion;
    const main = await mainBundleUrl();
    return main.slice(main.lastIndexOf('/') + 1);
  } catch (err) {
    if (err.needsSetup || err instanceof NotConnected) throw err;
    return '';
  }
}

// One load at a time, so parallel callers share one registry object.
function loadRegistry() {
  if (registry) return Promise.resolve(registry);
  loading ??= (async () => {
    const build = await currentBuild();
    const stored = (await chrome.storage.local.get(HASH_KEY))[HASH_KEY];
    const same = Boolean(build) && stored?.build === build;
    registry = { build, hashes: same ? { ...stored.hashes } : {}, scanned: same };
    return registry;
  })().finally(() => { loading = null; });
  return loading;
}

const pickMainBundle = list => list.find(u => /\/web-player\.[0-9a-f]+\.js(\?|$)/.test(u))
  || list.find(u => u.includes('/web-player/') && !/\/(vendor|encore)~/.test(u));

async function mainBundleUrl() {
  let url;
  try {
    url = pickMainBundle((await page('scripts')).scripts);
  } catch (err) {
    if (err.needsSetup) throw err;
  }
  if (!url) {
    // Fall back to the player's HTML page. No cookies are sent.
    const html = await (await fetch(SPOTIFY_URL, { credentials: 'omit' })).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => new URL(m[1], SPOTIFY_URL).href);
    url = pickMainBundle(srcs.filter(isCdn));
  }
  if (!url || !isCdn(url)) throw setupError('no-hash', 'main bundle not found');
  return url;
}

async function fetchText(url) {
  if (!isCdn(url)) throw new Error(`Refusing to fetch ${url}`);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function addOperations(js, found) {
  for (const m of js.matchAll(OPERATION_RE)) if (!found[m[1]]) found[m[1]] = m[3];
}

const parseMap = literal => Object.fromEntries([...literal.matchAll(/(\d+):"([^"]*)"/g)].map(m => [m[1], m[2]]));

// webpack's chunk-file function in the main bundle:
//   u.u = e => "" + ({id:"name",...}[e] || e) + "." + ({id:"hash",...}[e]) + ".js"
// A chunk without a name map entry is called by its numeric id. Falls back to guessing the two
// maps by what their values look like if that exact shape changes.
export function chunkUrls(js, mainUrl) {
  const base = mainUrl.slice(0, mainUrl.lastIndexOf('/') + 1);
  let names;
  let hashes;
  const exact = /\(\{((?:\d+:"[^"]*",?)*)\}\)\[\w+\]\|\|\w+\)\+"\."\+\(\{((?:\d+:"[0-9a-f]+",?)+)\}\)\[\w+\]\+"\.js"/.exec(js);
  if (exact) {
    names = parseMap(exact[1]);
    hashes = parseMap(exact[2]);
  } else {
    const maps = (js.match(/\{(?:\d+:"[^"]+",?){3,}\}/g) || []).map(parseMap);
    const share = (map, test) => Object.values(map).filter(test).length / Math.max(1, Object.keys(map).length);
    const size = map => Object.keys(map).length;
    hashes = maps.filter(m => share(m, v => /^[0-9a-f]{6,12}$/.test(v)) > 0.9).sort((a, b) => size(b) - size(a))[0];
    names = maps.filter(m => share(m, v => /[-/]/.test(v)) > 0.4).sort((a, b) => size(b) - size(a))[0] || {};
  }
  if (!hashes) return [];
  return Object.keys(hashes).map(id => {
    const name = names[id] || id;
    return { name, url: `${base}${name}.${hashes[id]}.js` };
  });
}

// Chunks whose name shares a word with a missing operation go first (searchDesktop -> "search").
function prioritize(chunks, wanted) {
  const skip = new Set(['query', 'fetch', 'add', 'to', 'get', 'desktop', 'attributes', 'contents', 'v3', 'v2']);
  const words = wanted.flatMap(op => op.split(/(?=[A-Z])/).map(w => w.toLowerCase())).filter(w => !skip.has(w));
  const score = c => words.filter(w => c.name.toLowerCase().includes(w)).length;
  return chunks.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
}

async function scrapeBundles(found) {
  const mainUrl = await mainBundleUrl();
  const main = await fetchText(mainUrl);
  addOperations(main, found);
  const missing = () => NEEDED.filter(op => !found[op]);
  if (!missing().length) return;
  const chunks = prioritize(chunkUrls(main, mainUrl), missing());
  for (let i = 0; i < chunks.length && missing().length; i += 4) {
    const texts = await Promise.all(chunks.slice(i, i + 4).map(c => fetchText(c.url).catch(() => '')));
    for (const text of texts) addOperations(text, found);
  }
}

// avoidOp / avoidHash: a hash that just got a 412. Anything the player used is trusted except that.
async function doScan(avoidOp, avoidHash) {
  const reg = await loadRegistry();
  const status = await page('status');
  const found = { ...status.hashes };
  if (avoidOp && found[avoidOp] === avoidHash) delete found[avoidOp];
  try {
    if (NEEDED.some(op => !found[op])) await scrapeBundles(found);
  } catch (err) {
    if (err.needsSetup) throw err;
    console.warn('yt2sp: reading the web player bundles failed:', err.message);
    if (!Object.keys(found).length) throw setupError('no-hash', err.message);
  }
  reg.build = status.appVersion || reg.build;
  reg.hashes = found;
  reg.scanned = true;
  await chrome.storage.local.set({ [HASH_KEY]: { build: reg.build, hashes: found, at: Date.now() } });
}

// bad: the hash that was just refused, so an unchanged hash after a rescan counts as a failure.
async function refreshHash(op, bad = '') {
  const reg = await loadRegistry();
  if (reg.hashes[op] && reg.hashes[op] !== bad) return reg.hashes[op];
  if (!bad && reg.scanned) {
    // Searched already: only something the player has used since can help. No second full scan for
    // an operation this build does not have.
    const seen = (await page('status')).hashes[op];
    if (!seen) throw setupError('no-hash', `${op} is not in the web player (build ${reg.build})`);
    return (reg.hashes[op] = seen);
  }
  scanning ??= doScan(op, bad).finally(() => { scanning = null; });
  await scanning;
  const hash = reg.hashes[op];
  if (!hash) throw setupError('no-hash', `${op} is not in the web player`);
  if (hash === bad) throw setupError('stale', `${op} still has the refused hash`);
  return hash;
}

async function hashFor(op) {
  const reg = await loadRegistry();
  return reg.hashes[op] || refreshHash(op);
}

// ---------- requests with retries ----------

const isStale = res => res.status === 412 || (res.body?.errors || []).some(e => /PersistedQueryNotFound/i.test(`${e?.message} ${e?.extensions?.code}`));

// Runs a pathfinder or spclient command and returns the raw {status, ok, body, text} after handling
//   429 (wait Retry-After), 401 and, for pathfinder, 403 (wait for the player's next token, once),
//   412 / PersistedQueryNotFound (rescan the hashes, once).
// authFail: what a request that is refused twice means. 'setup' (default): the web player changed or
// refused its own session; 'logout': the user is simply not logged in.
async function send(cmd, makeArgs, { authFail = 'setup', auth403 = cmd === 'pathfinder' } = {}) {
  let rate = 0;
  let tokenRetried = false;
  let hashRetried = false;
  for (;;) {
    const args = await makeArgs();
    const res = await page(cmd, args);
    if (res.status === 429) {
      if (res.retryAfter > 60) throw new Error(`Spotify rate limit hit; try again in ${Math.ceil(res.retryAfter / 60)} min`);
      if (++rate > 4) throw new Error('Spotify kept rate-limiting; try again in a minute');
      await patientSleep((res.retryAfter || 2) * 1000 + 250);
      continue;
    }
    if (res.status === 401 || (res.status === 403 && auth403)) {
      if (!tokenRetried) {
        tokenRetried = true;
        const fresh = await page('freshToken', { timeoutMs: authFail === 'logout' ? 8000 : SESSION_WAIT_MS }, (authFail === 'logout' ? 8000 : SESSION_WAIT_MS) + 3000);
        if (fresh.fresh) continue;
      }
      if (authFail === 'logout') throw new NotConnected(LOGGED_OUT);
      // Logged out is the user's business; anything else means the web player's session is not usable.
      try {
        await fetchProfile();
      } catch (err) {
        if (err instanceof NotConnected) throw err;
      }
      throw setupError('refused', `${cmd} -> HTTP ${res.status}`);
    }
    if (cmd === 'pathfinder' && isStale(res)) {
      if (hashRetried) throw setupError('stale', `${args.operationName} refused after a rescan`);
      hashRetried = true;
      await refreshHash(args.operationName, args.hash);
      continue;
    }
    return res;
  }
}

// GraphQL data of one operation. Errors outside the user's control become setup errors.
async function gql(op, variables, opts) {
  const res = await send('pathfinder', async () => ({ operationName: op, hash: await hashFor(op), variables }), opts);
  if (res.status >= 500) throw new Error(`Spotify had a problem (HTTP ${res.status}). Try again in a moment.`);
  if (!res.ok) throw setupError('http', `${op} -> HTTP ${res.status} ${res.text}`);
  const errors = res.body?.errors;
  if (Array.isArray(errors) && errors.length && !res.body.data) {
    const err = setupError('bad-shape', `${op}: ${errors.map(e => e?.message).join('; ').slice(0, 200)}`);
    throw err;
  }
  if (!res.body || typeof res.body.data !== 'object' || res.body.data === null) throw setupError('bad-shape', `${op}: no data`);
  return res.body.data;
}

// A JSON spclient call. Statuses the caller must interpret come back as they are.
async function spclient(method, path, body, opts) {
  const res = await send('spclient', async () => ({ method, path, body }), opts);
  if (res.status >= 500) throw new Error(`Spotify had a problem (HTTP ${res.status}). Try again in a moment.`);
  return res;
}

// ---------- account ----------

const readUser = async () => (await chrome.storage.local.get(USER_KEY))[USER_KEY] || null;

async function fetchProfile() {
  let data;
  try {
    data = await gql('profileAttributes', {}, { authFail: 'logout' });
  } catch (err) {
    if (err.code === 'bad-shape' && /unauth|logged|log in|login|anonymous|permission/i.test(err.detail || '')) {
      await chrome.storage.local.remove(USER_KEY);
      throw new NotConnected(LOGGED_OUT);
    }
    if (err instanceof NotConnected) await chrome.storage.local.remove(USER_KEY);
    throw err;
  }
  const profile = data.me?.profile;
  if (!profile?.username) {
    await chrome.storage.local.remove(USER_KEY);
    throw new NotConnected(LOGGED_OUT);
  }
  const user = { username: profile.username, name: profile.name || profile.username, image: profile.avatar?.sources?.[0]?.url || '', at: Date.now() };
  await chrome.storage.local.set({ [USER_KEY]: user });
  return user;
}

const toMe = u => ({ id: u.username, display_name: u.name, images: u.image ? [{ url: u.image }] : [] });

export async function isConnected() {
  return Boolean(await readUser());
}

// Finds or opens the Spotify tab, waits for the player's session, and checks that the user is
// logged in. If not, brings the tab to the front so they can log in.
async function do_connect() {
  await page('status');
  try {
    await fetchProfile();
  } catch (err) {
    if (err instanceof NotConnected) {
      await focusTab();
      throw new NotConnected(NOT_LOGGED_IN);
    }
    throw err;
  }
}

// Only the web-mode login is removed; the official login (spotify.js) is not touched.
export async function disconnect() {
  await chrome.storage.local.remove(USER_KEY);
}

// The saved profile is returned as it is, so the popup's status call never waits for the Spotify
// tab. A login that is gone shows up on the first real request, which clears it.
const do_me = async () => toMe((await readUser()) || (await fetchProfile()));

// Nothing to ask for: the web session has no scopes.
export async function ensureScopes() {}
export async function hasScopes() { return true; }

// ---------- mapping ----------

// The same image rule as spotify.js: the largest one up to 320 px wide, else the smallest.
// Only Spotify's own image hosts are used, so a forged reply cannot make the extension load a tracking pixel.
const imageHost = url => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (hostname === 'i.scdn.co' || hostname.endsWith('.scdn.co') || hostname === 'spotifycdn.com' || hostname.endsWith('.spotifycdn.com'));
  } catch {
    return false;
  }
};

function pickImage(sources) {
  const list = (Array.isArray(sources) ? sources : []).filter(s => s?.url && imageHost(s.url));
  const small = list.filter(s => s.width && s.width <= 320).sort((a, b) => b.width - a.width)[0];
  const smallest = [...list].sort((a, b) => (a.width || 1e9) - (b.width || 1e9))[0];
  return (small || smallest)?.url || '';
}

export function toTrack(raw) {
  const d = raw?.item?.data ?? raw?.data ?? raw;
  const uri = d?.uri;
  if (typeof uri !== 'string' || !/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) return null;
  const id = uri.split(':').pop();
  const ms = d.duration?.totalMilliseconds ?? d.trackDuration?.totalMilliseconds ?? 0;
  return {
    id,
    uri,
    name: d.name || '',
    artists: (d.artists?.items || []).map(a => a?.profile?.name).filter(Boolean),
    album: d.albumOfTrack?.name || '',
    image: pickImage(d.albumOfTrack?.coverArt?.sources),
    durationSec: Math.round(ms / 1000),
    url: `https://open.spotify.com/track/${id}`,
  };
}

// ---------- search, playlists, library ----------

async function do_searchTracks(q) {
  const data = await gql('searchDesktop', {
    searchTerm: q,
    offset: 0,
    limit: 10,
    numberOfTopResults: 5,
    includeAudiobooks: true,
    includePreReleases: true,
    includeArtistHasConcertsField: false,
    includeLocalConcertsField: false,
  });
  const found = data.searchV2;
  if (!found || typeof found !== 'object') throw setupError('bad-shape', 'searchDesktop: no searchV2');
  // A shape change must not turn into "Not found" (cached for a week): it is an error, so the user is
  // offered the official setup. A query that simply has no results still has tracksV2 with no items.
  if (found.tracksV2 === undefined) throw setupError('bad-shape', 'searchDesktop: no tracksV2');
  const items = found.tracksV2?.items ?? [];
  if (!Array.isArray(items)) throw setupError('bad-shape', 'searchDesktop: tracksV2 has no items list');
  const tracks = items.map(toTrack).filter(Boolean);
  if (items.length && !tracks.length) throw setupError('bad-shape', 'searchDesktop: no readable track in the results');
  return tracks;
}

// Playlists the user can add to: their own and collaborative ones. libraryV3 has no song count for
// a playlist, so total is null. A problem here only hides the list (the UI still offers "New playlist").
async function do_myPlaylists(userId) {
  const out = [];
  try {
    for (let offset = 0; offset < 500; offset += 50) {
      const data = await gql('libraryV3', {
        filters: ['Playlists'],
        order: null,
        textFilter: '',
        features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'EVENTS'],
        limit: 50,
        offset,
        flatten: true,
        expandedFolders: [],
        folderUri: null,
        includeFoldersWhenFlattening: true,
      });
      const library = data.me?.libraryV3;
      if (!library || !Array.isArray(library.items)) throw setupError('bad-shape', 'libraryV3: no items');
      for (const entry of library.items) {
        const p = entry?.item?.data;
        const id = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(p?.uri || '')?.[1];
        if (p?.__typename !== 'Playlist' || !id) continue;
        const owner = p.ownerV2?.data;
        const mine = owner?.username === userId || owner?.uri === `spotify:user:${userId}`;
        if (!mine && p.currentUserCapabilities?.canEditItems !== true) continue;
        out.push({ id, name: p.name || '', total: typeof p.count === 'number' ? p.count : null });
      }
      if (!library.items.length || offset + 50 >= (library.totalCount ?? 0)) break;
    }
  } catch (err) {
    if (!isSoftFailure(err)) throw err;
    console.warn('yt2sp: could not list playlists, offering only "New playlist":', err.detail);
  }
  return out;
}

async function username() {
  return (await readUser())?.username || (await fetchProfile()).username;
}

// The playlist no longer exists: status 404, which background.js treats as "drop the link" (finding 13).
const gone = () => Object.assign(new Error('That playlist is gone from Spotify.'), { status: 404 });

function failed(res, what) {
  if (res.status === 403) return new Error(`Spotify refused to ${what}.`);
  return setupError('http', `${what} -> HTTP ${res.status} ${res.text}`);
}

// There is no GraphQL mutation for this: the player calls playlist/v2 to make the playlist and then
// adds it to the top of the user's rootlist (their library).
async function do_createPlaylist(name, description, isPublic = false) {
  const user = await username();
  const create = values => spclient('POST', '/playlist/v2/playlist', {
    ops: [{ kind: 'UPDATE_LIST_ATTRIBUTES', updateListAttributes: { newAttributes: { values } } }],
  });
  let res = await create(description ? { name, description } : { name });
  if (res.status === 400 && description) res = await create({ name });  // a description the API does not like
  if (!res.ok) throw failed(res, 'create a playlist');
  const uri = res.body?.uri;
  const id = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(uri || '')?.[1];
  if (!id) throw setupError('bad-shape', 'playlist/v2: no playlist uri');
  const rootlist = ops => spclient('POST', `/playlist/v2/user/${encodeURIComponent(user)}/rootlist/changes`, {
    deltas: [{ ops, info: { source: { client: 'WEBPLAYER' } } }],
  });
  const added = await rootlist([{ kind: 'ADD', add: { items: [{ uri, attributes: { timestamp: String(Date.now()) } }], addFirst: true } }]);
  if (!added.ok) throw failed(added, 'add the playlist to your library');
  if (isPublic) {
    const shown = await rootlist([{ kind: 'UPDATE_ITEM_ATTRIBUTES', updateItemAttributes: { newAttributes: { values: { public: true } }, item: { uri } } }]);
    if (!shown.ok) console.warn('yt2sp: could not make the playlist public:', shown.status);
  }
  return { id, uri, name };
}

// Songs already in a playlist, for de-duplication. If Spotify changed this operation, de-duplication
// is skipped (an empty set) rather than failing the save.
async function do_playlistUris(playlistId) {
  const uris = new Set();
  try {
    for (let offset = 0; offset < 10_000; offset += 100) {
      const data = await gql('fetchPlaylistContents', { uri: `spotify:playlist:${playlistId}`, offset, limit: 100 });
      // A playlist that was deleted (or is not visible to this account): the caller drops its link.
      if (data.playlistV2 === null || /NotFound/i.test(data.playlistV2?.__typename || '')) throw gone();
      const content = data.playlistV2?.content;
      if (!content || !Array.isArray(content.items)) throw setupError('bad-shape', 'fetchPlaylistContents: no content');
      for (const it of content.items) {
        const d = it?.itemV2?.data;
        if (d?.__typename === 'Track' && d.uri) uris.add(d.uri);
      }
      if (!content.items.length || offset + 100 >= (content.totalCount ?? 0)) break;
    }
  } catch (err) {
    if (!isSoftFailure(err)) throw err;
    console.warn('yt2sp: skipping duplicate check:', err.detail);
    return new Set();
  }
  return uris;
}

async function do_addItems(playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    const data = await gql('addToPlaylist', {
      playlistUri: `spotify:playlist:${playlistId}`,
      playlistItemUris: uris.slice(i, i + 100),
      newPosition: { moveType: 'BOTTOM_OF_PLAYLIST', fromUid: null },
      interactionId: null,
    });
    const result = data.addItemsToPlaylist;
    if (!result) throw setupError('bad-shape', 'addToPlaylist: no addItemsToPlaylist');
    if (/notfound/i.test(result.__typename || '')) throw gone();
    if (/error|forbidden|invalid|full/i.test(result.__typename || '')) throw new Error(`Spotify would not add the songs (${result.__typename}).`);
  }
}

// Which of these songs are in Liked Songs: { [uri]: boolean }. Uses the web player's own
// areEntitiesInLibrary operation, if its hash is in the registry; if the player does not have it, or
// its answer has a shape we do not know, the answer is {} and the heart falls back to what was liked
// in this session. The variables ({ uris }) and the answer shape (an array of entries with a boolean
// "saved") are from memory of the player's traffic, not checked on a live build.
async function do_areSaved(uris) {
  const out = {};
  try {
    for (let i = 0; i < uris.length; i += 40) {
      const chunk = uris.slice(i, i + 40);
      const data = await gql('areEntitiesInLibrary', { uris: chunk });
      const rows = Array.isArray(data.lookup) ? data.lookup : Array.isArray(data.areEntitiesInLibrary) ? data.areEntitiesInLibrary : null;
      if (!rows) throw setupError('bad-shape', 'areEntitiesInLibrary: no lookup');
      let read = 0;
      rows.forEach((row, j) => {
        const d = row?.data ?? row;
        const flag = [d?.saved, d?.isSaved, d?.inLibrary, d?.isInLibrary, row?.saved].find(v => typeof v === 'boolean');
        const uri = typeof d?.uri === 'string' ? d.uri : typeof row?._uri === 'string' ? row._uri : chunk[j];
        if (flag !== undefined && uri) {
          out[uri] = flag;
          read++;
        }
      });
      if (!read && rows.length) throw setupError('bad-shape', 'areEntitiesInLibrary: no saved flag');
    }
  } catch (err) {
    if (!isSoftFailure(err)) throw err;
    console.warn('yt2sp: could not read Liked Songs:', err.detail);
    return {};
  }
  return out;
}

// Liked Songs.
async function do_saveToLibrary(uris) {
  for (let i = 0; i < uris.length; i += 50) {
    await gql('addToLibrary', { libraryItemUris: uris.slice(i, i + 50), interactionId: null });
  }
}

// ---------- playback: Spotify Connect commands through the player's own device ----------
// Commands are POSTed to /connect-state/v1/player/command/from/<this tab's device>/to/<target>.

const DEVICE_ID = /^[0-9a-f]{16,64}$/;
const commandId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

async function ownDevice(patientMs = 0) {
  const end = Date.now() + patientMs;
  for (;;) {
    const status = await page('status');
    if (status.deviceId || Date.now() >= end) return status;
    await sleep(700);
  }
}

const DEVICE_TYPES = {
  COMPUTER: 'Computer', SMARTPHONE: 'Smartphone', TABLET: 'Tablet', SPEAKER: 'Speaker', AVR: 'Speaker', AUDIO_DONGLE: 'Speaker',
  CAST_AUDIO: 'Speaker', TV: 'TV', STB: 'TV', CAST_VIDEO: 'TV', GAME_CONSOLE: 'Game console', AUTOMOBILE: 'Car',
};

// Same idea as spotify.js: the players that can be controlled, as { id, name, type, active }. This
// tab's own web player is always there; the rest come from the Connect cluster state (phones, the
// desktop app, speakers). Only the device whose cluster state has a track counts as active. Which one
// to use is decided in background.js.
async function do_listDevices() {
  const status = await ownDevice(8000);
  if (!status.deviceId) return [];
  const own = { id: status.deviceId, name: 'Spotify in your browser', type: 'Computer', active: false, web: true };
  const others = [];
  try {
    const res = await spclient('GET', '/connect-state/v1/cluster', undefined, { auth403: false });
    const cluster = res.ok ? res.body : null;
    const active = typeof cluster?.active_device_id === 'string' ? cluster.active_device_id : '';
    const playing = Boolean(cluster?.player_state?.track);
    for (const [id, d] of Object.entries(cluster?.devices || {})) {
      if (!DEVICE_ID.test(id)) continue;
      const entry = { name: (d?.name || '').trim(), type: DEVICE_TYPES[d?.device_type] || '', active: id === active && playing };
      if (id === own.id) {
        own.active = entry.active;
        if (entry.name) own.name = entry.name;
      } else {
        others.push({ id, ...entry, name: entry.name || 'Spotify player' });
      }
    }
  } catch (err) {
    if (err.needsSetup || err instanceof NotConnected) throw err;
    console.warn('yt2sp: could not read the Connect state, using this tab:', err.message);
  }
  return [own, ...others];
}

async function command(from, to, body, what) {
  const res = await spclient('POST', `/connect-state/v1/player/command/from/${from}/to/${to}`, body, { auth403: false });
  if (res.ok) return;
  if (res.status === 403) throw new Error(PREMIUM);
  if (res.status === 404 || res.status === 410) throw Object.assign(new Error(NO_PLAYER), { status: res.status });
  if (what === 'queue' && (res.status === 400 || res.status === 409)) throw new Error(NOTHING_PLAYING);
  throw setupError('http', `${what} command -> HTTP ${res.status} ${res.text}`);
}

// Play a list: the first song starts as its own context (a track URI is a context the web player
// accepts, as when you open a /track page), then the rest are added to the queue, in order, on the
// same device. Why not a playlist: Connect can play a playlist as the context, but that needs a
// throw-away playlist created in the user's account for every Play click, and it can lag behind the
// create call. Why not a custom context holding all the tracks: the page list format is not
// observable in the player's own traffic, so it would be a guess. Known limit: songs the user had
// already queued play before the rest of this list, as Spotify always puts queued songs first.
// The Connect cluster as far as playback is concerned: which device is active, what it has loaded and
// whether it is playing. null when it cannot be read (the check then cannot say either way).
// Never throws: it is only used to check a command that has already been sent.
async function playbackState() {
  try {
    const res = await spclient('GET', '/connect-state/v1/cluster', undefined, { auth403: false });
    const cluster = res.ok ? res.body : null;
    if (!cluster || typeof cluster !== 'object') return null;
    const player = cluster.player_state || {};
    const meta = player.track?.metadata || {};
    const activeId = typeof cluster.active_device_id === 'string' ? cluster.active_device_id : '';
    const playing = player.is_playing === true && player.is_paused !== true;
    // GUESSED, not checked against a live build: the metadata names (title, artist_name), the string
    // milliseconds in duration / position_as_of_timestamp, and the server clock in timestamp.
    const durationMs = Number(player.duration) || Number(meta.duration) || 0;
    const sinceMs = playing && Number(player.timestamp) ? Math.max(0, Date.now() - Number(player.timestamp)) : 0;
    return {
      activeId,
      activeName: typeof cluster.devices?.[activeId]?.name === 'string' ? cluster.devices[activeId].name : '',
      uri: player.track?.uri || '',
      linkedUri: meta.linked_from_uri || '',
      playing,
      title: typeof meta.title === 'string' ? meta.title : '',
      artists: typeof meta.artist_name === 'string' && meta.artist_name ? [meta.artist_name] : [],
      durationMs,
      progressMs: Math.min(durationMs || Infinity, (Number(player.position_as_of_timestamp) || 0) + sinceMs),
    };
  } catch (err) {
    console.warn('yt2sp: could not read the playback state:', err?.message);
    return null;
  }
}

// Polls for about 3.5 s until the song is loaded on the target device (and playing).
// verified: true = it is there, false = it is not, null = the state could not be read.
async function waitForStart(deviceId, uri) {
  const end = Date.now() + 3500;
  let loaded = false;
  let readable = false;
  for (;;) {
    const state = await playbackState();
    if (state) {
      readable = true;
      if (state.activeId === deviceId && (state.uri === uri || state.linkedUri === uri)) {
        loaded = true;
        if (state.playing) return { verified: true, playing: true };
      }
    }
    if (Date.now() >= end) return { verified: readable ? loaded : null, playing: false };
    await sleep(500);
  }
}

// Moves playback to the device (the player's own transfer request). Best effort: the play command that
// follows is what counts, and a refused transfer only means that command may need its retry.
async function transferTo(from, to, resume) {
  try {
    const res = await spclient('POST', `/connect-state/v1/connect/transfer/from/${from}/to/${to}`, {
      transfer_options: { restore_paused: resume ? 'resume' : 'restore' },
      command_id: commandId(),
    }, { auth403: false });
    if (!res.ok) console.warn('yt2sp: the playback transfer was refused:', res.status);
  } catch (err) {
    console.warn('yt2sp: the playback transfer failed:', err?.message);
  }
  await sleep(600);
}

async function do_playNow(uris, deviceId, onProgress) {
  const status = await ownDevice();
  if (!status.deviceId) throw new Error(NO_PLAYER);
  const [first, ...rest] = uris;
  const sendFirst = () => command(status.deviceId, deviceId, {
    command: {
      context: { uri: first, url: `context://${first}`, metadata: {} },
      ...(status.playOrigin ? { play_origin: status.playOrigin } : {}),
      options: { license: status.license || 'tft', skip_to: { track_uri: first }, player_options_override: {} },
      logging_params: { command_id: commandId() },
      endpoint: 'play',
    },
  }, 'play');
  // A desktop app that is not the active device may accept the command and ignore it: make it the
  // active one first, send the song, check that it started, and try once more if it did not.
  const before = await playbackState();
  if (before && before.activeId !== deviceId) await transferTo(status.deviceId, deviceId, false);
  await sendFirst();
  let result = await waitForStart(deviceId, first);
  if (result.verified === false) {
    await transferTo(status.deviceId, deviceId, true);
    await sendFirst();
    result = await waitForStart(deviceId, first);
  }
  await onProgress?.(1);
  if (result.verified === false) return { ...result, played: 1 };
  if (!rest.length) return { ...result, played: uris.length };
  await sleep(1500);   // the player needs a moment to take the first song before it accepts a queue
  try {
    for (const [i, uri] of rest.entries()) {
      await command(status.deviceId, deviceId, queueCommand(uri, status.queueTemplate), 'queue');
      await onProgress?.(i + 2);
    }
  } catch (err) {
    if (err.needsSetup) throw err;
    throw new Error(`The first song is playing, but the others could not be queued: ${err.message}`);
  }
  return { ...result, played: uris.length };
}

function queueCommand(uri, template) {
  const base = template || { track: { metadata: { is_queued: 'true' }, provider: 'queue' } };
  return {
    command: {
      ...structuredClone(base),
      track: { ...structuredClone(base.track), uri },
      logging_params: { command_id: commandId() },
      endpoint: 'add_to_queue',
    },
  };
}

async function do_addToQueue(uris, deviceId, onProgress) {
  const status = await ownDevice();
  if (!status.deviceId) throw new Error(NO_PLAYER);
  let transferred = false;
  for (const [i, uri] of uris.entries()) {
    const send = () => command(status.deviceId, deviceId, queueCommand(uri, status.queueTemplate), 'queue');
    try {
      await send();
    } catch (err) {
      // "No such player": it may just not be the active one. Move playback to it (once) and try again.
      if (!(err.status === 404 || err.status === 410) || transferred) throw err;
      transferred = true;
      await transferTo(status.deviceId, deviceId, false);
      await send();
    }
    await onProgress?.(i + 1);
  }
}

// ---------- what is playing, pause and resume (decision 19) ----------

// Same shape as spotify.js getPlayback(). The cluster only knows the active device, so a paused player
// with a loaded song still counts as an item (to offer Resume), and nothing loaded is { isPlaying: false }.
async function do_getPlayback() {
  const state = await playbackState();
  if (!state?.uri || !state.activeId) return { isPlaying: false };
  return {
    isPlaying: state.playing,
    item: { uri: state.uri, linkedUri: state.linkedUri, name: state.title, artists: state.artists },
    device: { id: state.activeId, name: state.activeName || 'Spotify player' },
    progressMs: state.progressMs,
    durationMs: state.durationMs,
  };
}

// The player's own pause / resume commands, sent to the active device. GUESSED, not checked against a
// live build: the endpoint names are the ones the web player's own command traffic uses ('pause',
// 'resume') as far as known from spotify-full-experience. A refusal is an ordinary error and never
// ends the web login.
async function transport(endpoint) {
  const status = await ownDevice();
  if (!status.deviceId) throw new Error(NO_PLAYER);
  const state = await playbackState();
  try {
    await command(status.deviceId, state?.activeId || status.deviceId, { command: { endpoint, logging_params: { command_id: commandId() } } }, endpoint);
  } catch (err) {
    if (err?.needsSetup) throw new Error(`Spotify did not accept that (${err.detail || err.code}).`);
    throw err;
  }
}

// Reads that are only nice to have, or that must not sign the user out: a setup problem gives the
// fallback instead of ending the web login (review finding 6).
const soft = (fn, fallback) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    if (!err?.needsSetup) throw err;
    console.warn('yt2sp: skipped a read that did not work:', err.code, err.detail);
    return fallback();
  }
};

// ---------- exports: the same names as spotify.js ----------

export const me = hard(do_me);
export const connect = hard(do_connect);
export const searchTracks = hard(do_searchTracks);
export const myPlaylists = soft(do_myPlaylists, () => []);
export const createPlaylist = hard(do_createPlaylist);
export const playlistUris = soft(do_playlistUris, () => new Set());
export const addItems = hard(do_addItems);
export const saveToLibrary = hard(do_saveToLibrary);
export const areSaved = soft(do_areSaved, () => ({}));
export const getPlayback = soft(do_getPlayback, () => ({ isPlaying: false }));
export const pause = () => transport('pause');
export const resume = () => transport('resume');
export const listDevices = hard(do_listDevices);
export const playNow = hard(do_playNow);
export const addToQueue = hard(do_addToQueue);

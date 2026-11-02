// Spotify Web API with Authorization Code + PKCE: no client secret and no server needed.
// Uses the post-February-2026 endpoints (/me/playlists, /playlists/{id}/items, /me/library).

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
// user-library-read: GET /me/library/contains (the heart reads your real Liked Songs).
const SCOPES = 'playlist-modify-private playlist-modify-public playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state user-library-modify user-library-read';
const CLIENT_KEY = 'yt2sp:clientId';
const TOKEN_KEY = 'yt2sp:token';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class NotConnected extends Error {}

export const redirectUri = () => chrome.identity.getRedirectURL('spotify');

export async function getClientId() {
  return (await chrome.storage.local.get(CLIENT_KEY))[CLIENT_KEY] || '';
}

export async function setClientId(id) {
  await chrome.storage.local.set({ [CLIENT_KEY]: id.trim() });
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function isConnected() {
  return Boolean((await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY]);
}

export async function disconnect() {
  await chrome.storage.local.remove(TOKEN_KEY);
}

// Whether the saved login already has these scopes. Never asks the user for anything.
export async function hasScopes(needed) {
  const token = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
  const have = (token?.scope || '').split(' ');
  return Boolean(token) && needed.every(s => have.includes(s));
}

// Logins from older versions lack newer scopes (playback, Liked Songs) and need one more consent.
export async function ensureScopes(needed) {
  if (!(await hasScopes(needed))) await connect();
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

// ---------- login ----------
// Brave has had trouble with launchWebAuthFlow, so a failure there falls back to a normal tab that is
// watched for the redirect. That wait can be longer than a service worker lives (the user types a
// password, waits for a 2FA mail), so nothing is kept in memory: the PKCE verifier and state are in
// chrome.storage.session, and background.js has TOP-LEVEL tabs listeners that call loginTabUpdated /
// loginTabClosed below, so a restarted worker still finishes the login (review finding 4).
const PENDING_KEY = 'yt2sp:pkce';          // session: { verifier, state, clientId, redirect, tabId, at }
const RESULT_KEY = 'yt2sp:loginResult';    // session: { state, ok, error, at } how a tab login ended
const PENDING_MS = 10 * 60_000;            // a login that takes longer is given up

// Sleeps in short steps, each touching an extension API, so a service worker is not stopped in the
// middle of a long rate-limit wait (review finding 9).
export async function patientSleep(ms) {
  for (let left = ms; left > 0; left -= 20_000) {
    await sleep(Math.min(left, 20_000));
    if (left > 20_000) await chrome.runtime.getPlatformInfo().catch(() => {});
  }
}

async function exchange(responseUrl, pending) {
  const params = new URL(responseUrl).searchParams;
  if (params.get('error')) throw new Error(`Spotify said: ${params.get('error')}`);
  if (params.get('state') !== pending.state) throw new Error('Login state mismatch, try again');
  await saveToken(await tokenRequest({
    grant_type: 'authorization_code',
    code: params.get('code'),
    redirect_uri: pending.redirect,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
  }));
}

// Resolves when the top-level listener has finished the login of this attempt, rejects with its error.
function waitForResult(state) {
  return new Promise((resolve, reject) => {
    let timer;
    const done = (result, error) => {
      chrome.storage.onChanged.removeListener(onChanged);
      clearTimeout(timer);
      if (error) reject(error);
      else if (result.ok) resolve();
      else reject(new Error(result.error || 'Spotify login failed'));
    };
    const onChanged = (changes, area) => {
      const r = changes[RESULT_KEY]?.newValue;
      if (area === 'session' && r?.state === state) done(r);
    };
    timer = setTimeout(() => done(null, new Error('The Spotify login took too long. Try again.')), PENDING_MS);
    chrome.storage.onChanged.addListener(onChanged);
    chrome.storage.session.get(RESULT_KEY).then(got => {
      const r = got[RESULT_KEY];
      if (r?.state === state) done(r);
    }).catch(() => {});
  });
}

async function tabLogin(url, pending) {
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ [PENDING_KEY]: { ...pending, tabId: tab.id } });
  // While this worker is alive it keeps itself awake; if it is stopped anyway, the listeners finish the job.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20_000);
  try {
    await waitForResult(pending.state);
  } finally {
    clearInterval(keepAlive);
  }
}

// Called from a top-level tabs.onUpdated listener when a tab reaches the redirect URI. Returns the
// result ({ ok, error }) when this finished a login, or null when the tab was not ours.
export function loginTabUpdated(tabId, url) {
  if (!url || !url.startsWith(redirectUri())) return Promise.resolve(null);
  return navigator.locks.request('yt2sp:login-finish', async () => {
    const pending = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if (!pending || pending.tabId !== tabId || Date.now() - pending.at > PENDING_MS) return null;
    await chrome.storage.session.remove(PENDING_KEY);
    chrome.tabs.remove(tabId).catch(() => {});
    let result;
    try {
      await exchange(url, pending);
      result = { state: pending.state, ok: true };
    } catch (err) {
      result = { state: pending.state, ok: false, error: err?.message || String(err) };
    }
    await chrome.storage.session.set({ [RESULT_KEY]: { ...result, at: Date.now() } });
    return result;
  });
}

// Called from a top-level tabs.onRemoved listener: the user closed the login tab.
export function loginTabClosed(tabId) {
  return navigator.locks.request('yt2sp:login-finish', async () => {
    const pending = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if (!pending || pending.tabId !== tabId) return null;
    await chrome.storage.session.remove(PENDING_KEY);
    const result = { state: pending.state, ok: false, closed: true, error: 'Spotify login tab was closed' };
    await chrome.storage.session.set({ [RESULT_KEY]: { ...result, at: Date.now() } });
    return result;
  });
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error_description || body.error || `Spotify token error ${res.status}`);
    err.code = body.error;
    throw err;
  }
  return body;
}

async function saveToken(tok, previous) {
  const token = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || previous?.refresh_token,
    scope: tok.scope || previous?.scope || '',
    expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
  };
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  return token;
}

export async function connect() {
  const clientId = await getClientId();
  if (!clientId) throw new NotConnected('Set up Spotify first');
  const { verifier, challenge } = await pkcePair();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const pending = { verifier, state, clientId, redirect: redirectUri(), tabId: null, at: Date.now() };
  await chrome.storage.session.set({ [PENDING_KEY]: pending });
  await chrome.storage.session.remove(RESULT_KEY);
  const url = `${AUTH}/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: pending.redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  })}`;
  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  } catch (err) {
    if (/did not approve|cancel/i.test(err?.message || '')) {
      await chrome.storage.session.remove(PENDING_KEY);
      throw err;
    }
    return tabLogin(url, pending);
  }
  await chrome.storage.session.remove(PENDING_KEY);
  await exchange(responseUrl, pending);
}

const readToken = async () => (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
const stillValid = token => token.expires_at - 60_000 > Date.now();

// Spotify replaces the refresh token on every refresh, so two refreshes at once (three match
// workers, or the popup and the background together) would log the user out. A Web Lock makes
// it one refresh at a time across the popup, the full view and the background worker; whoever
// waited reads the new token instead of refreshing again.
// Only invalid_grant means the login is gone (refresh tokens expire six months after the first
// login, July 2026); a network error is just an error.
async function accessToken() {
  const token = await readToken();
  if (!token) throw new NotConnected('Connect Spotify first');
  if (stillValid(token)) return token.access_token;
  return navigator.locks.request('yt2sp:token-refresh', async () => {
    const current = await readToken();
    if (!current) throw new NotConnected('Connect Spotify first');
    if (stillValid(current)) return current.access_token;
    let fresh;
    try {
      fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refresh_token, client_id: await getClientId() });
    } catch (err) {
      if (err.code !== 'invalid_grant') throw new Error(`Could not refresh the Spotify login: ${err.message}`);
      await disconnect();
      throw new NotConnected('Spotify login expired, connect again');
    }
    return (await saveToken(fresh, current)).access_token;
  });
}

// Only expires the token this request used: another request may already have refreshed it.
async function expireToken(used) {
  const token = await readToken();
  if (token?.access_token === used) await chrome.storage.local.set({ [TOKEN_KEY]: { ...token, expires_at: 0 } });
}

export async function api(path, { method = 'GET', query, body } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
    const token = await accessToken();
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') || 2);
      if (wait > 60) throw new Error(`Spotify rate limit hit; try again in ${Math.ceil(wait / 60)} min`);
      await patientSleep(wait * 1000 + 250);
      continue;
    }
    if (res.status === 401 && attempt === 0) {
      await expireToken(token);
      continue;
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const err = new Error(`Spotify ${res.status}: ${detail?.error?.message || res.statusText}`);
      err.status = res.status;
      err.path = path;
      err.detail = detail?.error?.message || res.statusText || '';
      throw err;
    }
    return res.status === 204 || res.status === 202 ? null : res.json().catch(() => null);
  }
  throw new Error('Spotify kept rate-limiting; try again in a minute');
}

// The one place that turns an error into the text the user sees. Only a 403 is rewritten;
// anything else keeps its own message.
export function friendlyError(err) {
  const message = err?.message || String(err);
  // The player endpoints answer 404 when no Spotify player is active (review finding 12).
  if (err?.status === 404 && err.path?.startsWith('/me/player')) {
    return err.path.startsWith('/me/player/queue')
      ? 'Nothing is playing yet. Start a song in Spotify (or use Play), then queue.'
      : 'No Spotify player found. Open Spotify (desktop app or open.spotify.com), play any song for a second, then try again.';
  }
  if (err?.status !== 403) return message;
  const detail = err.detail || '';
  if (/premium/i.test(detail)) return 'Playing and queueing need Spotify Premium.';
  if (err.path === '/me' || /not (be )?registered|isn't registered/i.test(detail)) {
    return 'Spotify refused this account. Add it under User Management in your Spotify app, then try again.';
  }
  return `Spotify refused this request${detail ? `: ${detail}` : '.'}`;
}

function toTrack(t) {
  const images = t.album?.images || [];
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map(a => a.name),
    album: t.album?.name || '',
    image: (images.find(i => i.width && i.width <= 320) || images[images.length - 1] || images[0])?.url || '',
    durationSec: Math.round((t.duration_ms || 0) / 1000),
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  };
}

export const me = () => api('/me');

// Development-mode apps get at most 10 results per search since Feb 2026.
// No market param: market=from_token fails with "403 Insufficient client scope", and a user
// token already limits results to the account's country.
export async function searchTracks(q) {
  const res = await api('/search', { query: { q, type: 'track', limit: 10 } });
  return (res?.tracks?.items || []).filter(Boolean).map(toTrack);
}

export async function myPlaylists(userId) {
  const out = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await api('/me/playlists', { query: { limit: 50, offset } });
    out.push(...(page?.items || []));
    if (!page?.next) break;
  }
  return out
    .filter(p => p && (p.owner?.id === userId || p.collaborative))
    .map(p => ({ id: p.id, name: p.name, total: p.items?.total ?? p.tracks?.total ?? 0 }));
}

export function createPlaylist(name, description, isPublic = false) {
  return api('/me/playlists', { method: 'POST', body: { name, description, public: isPublic } });
}

export async function playlistUris(playlistId) {
  const uris = new Set();
  for (let offset = 0; offset < 10_000; offset += 100) {
    const page = await api(`/playlists/${playlistId}/items`, { query: { limit: 100, offset } });
    for (const it of page?.items || []) {
      const uri = it?.item?.uri || it?.track?.uri;
      if (uri) uris.add(uri);
    }
    if (!page?.next) break;
  }
  return uris;
}

export async function addItems(playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    await api(`/playlists/${playlistId}/items`, { method: 'POST', body: { uris: uris.slice(i, i + 100) } });
  }
}

// Which of these songs are in Liked Songs: GET /me/library/contains?uris=spotify:track:...,... (Feb 2026,
// 40 URIs at most, answers [true, false, ...] in the same order). Needs user-library-read.
// Returns { [uri]: boolean }.
export async function areSaved(uris) {
  const out = {};
  for (let i = 0; i < uris.length; i += 40) {
    const chunk = uris.slice(i, i + 40);
    const flags = await api('/me/library/contains', { query: { uris: chunk.join(',') } });
    if (!Array.isArray(flags)) continue;
    chunk.forEach((uri, j) => { if (typeof flags[j] === 'boolean') out[uri] = flags[j]; });
  }
  return out;
}

// Liked Songs: PUT /me/library with Spotify URIs, 40 per call (Feb 2026). The reference shows
// them in the query string and the migration guide in the body, so a 400 retries with the body.
export async function saveToLibrary(uris) {
  for (let i = 0; i < uris.length; i += 40) {
    const chunk = uris.slice(i, i + 40);
    try {
      await api('/me/library', { method: 'PUT', query: { uris: chunk.join(',') } });
    } catch (err) {
      if (err.status !== 400) throw err;
      await api('/me/library', { method: 'PUT', body: { uris: chunk } });
    }
  }
}

// Player endpoints need Premium and a Spotify app or web player that is open somewhere.
// The players that can be controlled, as { id, name, type, active }. Which one to use is decided in
// background.js (the active one, then the one the user chose, then asking).
export async function listDevices() {
  const { devices = [] } = (await api('/me/player/devices')) || {};
  return devices
    .filter(d => d?.id && !d.is_restricted)
    .map(d => ({ id: d.id, name: d.name || 'Spotify player', type: d.type || '', active: Boolean(d.is_active) }));
}

// What Spotify is playing now, for the popup and for "one player at a time" (decision 19):
//   { isPlaying, item: { uri, linkedUri, name, artists }, device: { id, name }, progressMs, durationMs }
// A paused song still has an item (so the popup can offer Resume); { isPlaying: false } alone = nothing loaded.
// Needs user-read-playback-state.
export async function getPlayback() {
  const state = await api('/me/player');    // null (204) when nothing is active
  const item = state?.item;
  if (!item || !state.device) return { isPlaying: false };
  return {
    isPlaying: Boolean(state.is_playing),
    item: { uri: item.uri || '', linkedUri: item.linked_from?.uri || '', name: item.name || '', artists: (item.artists || []).map(a => a?.name).filter(Boolean) },
    device: { id: state.device.id || '', name: state.device.name || 'Spotify player' },
    progressMs: state.progress_ms || 0,
    durationMs: item.duration_ms || 0,
  };
}

export const pause = () => api('/me/player/pause', { method: 'PUT' });
export const resume = () => api('/me/player/play', { method: 'PUT' });

// One play request carries at most this many songs (Spotify's own limit for the `uris` list).
export const MAX_PLAY_URIS = 100;

// A desktop app that is not Spotify's active device often answers a play request with 202/204 and
// then ignores it. So playback is moved to the device first, and what actually started is checked.
const transferTo = (deviceId, play) => api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } });

// Polls the player until one of the songs is loaded on this device (and playing), for about 3.5 s.
// A song that Spotify relinked to another version still counts (item.linked_from.uri).
// Returns { verified, playing }: verified = the song is on the device; playing = it is actually playing.
async function waitForStart(deviceId, wanted) {
  const end = Date.now() + 3500;
  let loaded = false;
  for (;;) {
    let state = null;
    try {
      state = await api('/me/player');
    } catch (err) {
      if (err instanceof NotConnected) throw err;
    }
    const item = state?.item;
    if (state?.device?.id === deviceId && item && (wanted.has(item.uri) || wanted.has(item.linked_from?.uri))) {
      loaded = true;
      if (state.is_playing) return { verified: true, playing: true };
    }
    if (Date.now() >= end) return { verified: loaded, playing: false };
    await sleep(500);
  }
}

// Replaces what is playing with these songs, in order, and checks that it really started.
// Nothing is saved to the library. Returns { verified, playing, played }: `played` is how many of the
// songs were sent (at most MAX_PLAY_URIS).
export async function playNow(uris, deviceId) {
  const list = uris.slice(0, MAX_PLAY_URIS);
  const wanted = new Set(list);
  const play = () => api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body: { uris: list } });
  const current = await api('/me/player');    // null (204) when nothing is active
  if (current?.device?.id !== deviceId) {
    await transferTo(deviceId, false);
    await sleep(600);
  }
  await play();
  let result = await waitForStart(deviceId, wanted);
  if (!result.verified) {
    await transferTo(deviceId, true);
    await sleep(600);
    await play();
    result = await waitForStart(deviceId, wanted);
  }
  return { ...result, played: list.length };
}

// Spotify only queues one song per request. A 404 means the device is not the active player: move
// playback to it (paused) and try that song once more.
export async function addToQueue(uris, deviceId, onProgress) {
  let transferred = false;
  for (const [i, uri] of uris.entries()) {
    const send = () => api('/me/player/queue', { method: 'POST', query: { uri, device_id: deviceId } });
    try {
      await send();
    } catch (err) {
      if (err.status !== 404 || transferred) throw err;
      transferred = true;
      await transferTo(deviceId, false);
      await sleep(600);
      await send();
    }
    await onProgress?.(i + 1);
  }
}

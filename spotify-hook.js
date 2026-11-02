// Page side of the "no setup" Spotify login (unofficial). Runs in the page's own JavaScript world on
// open.spotify.com (manifest: world MAIN, document_start), before the web player's scripts.
//
// Registered by background.js (chrome.scripting.registerContentScripts, world MAIN, document_start) only
// while the no-setup login is on; it is not in the manifest, so official-setup users never run it.
//
// Two jobs:
//  1. Watch the player's own fetch / XMLHttpRequest calls and remember the session headers it sends
//     (authorization, client-token, app-platform, spotify-app-version), the persisted-query hashes
//     it uses, and its Spotify Connect device id and spclient host. Nothing is changed or blocked.
//  2. When the extension asks (through spotify-bridge.js), make a request with those headers. It runs
//     here, on the page's own origin, so there is no CORS trouble and the request looks like the
//     player's. The headers live only in this closure: they never reach the extension or the page.
//
// Talking to the bridge: window.postMessage with a per-page random channel id. The bridge makes the
// id and hands it over in an "init" message. This script listens first (document_start, capture) and
// stops those messages from travelling further, so scripts that load later never see the id.
//
// The header capture, the hash and Connect-device observation and the init handshake pattern are
// adapted from spotify-full-experience (MIT) and hearted.music (MIT). See THIRD_PARTY_NOTICES.md.
// There is no timer-based pacing here on purpose: a hidden tab's timers are throttled by the browser,
// so the extension's service worker does the pacing (spotify-web.js).

(() => {
  'use strict';
  if (window.__yt2spHook) return;
  Object.defineProperty(window, '__yt2spHook', { value: true });

  const realFetch = window.fetch.bind(window);
  // Natives captured now, before any page script can patch them: the channel to the bridge must not
  // be readable or forgeable through a patched postMessage / JSON / Object.hasOwn.
  const realPost = window.postMessage.bind(window);
  const jsonParse = JSON.parse.bind(JSON);
  const jsonStringify = JSON.stringify.bind(JSON);
  const hasOwn = Object.hasOwn;
  const PATHFINDER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query';
  const SPCLIENT_HOST = /(^|[.-])spclient\.(wg\.)?spotify\.com$/;
  const DEFAULT_SPCLIENT = ['https://spclient.wg.spotify.com', 'https://gew4-spclient.spotify.com'];
  const SESSION_HEADERS = ['client-token', 'app-platform', 'spotify-app-version', 'accept-language'];
  // The local player's device id: /track-playback/v1/devices/<id>/(volume|state).
  const DEVICE_PATH = /^\/track-playback\/v1\/devices\/([0-9a-f]{16,64})(?:\/|$)/;
  const COMMAND_PATH = /^\/connect-state\/v1\/player\/command\/from\/([0-9a-f]{16,64})\/to\//;
  // Only these spclient paths can be called on the extension's behalf.
  const ALLOWED_SPCLIENT = /^\/(playlist\/v2|connect-state\/v1)\/[A-Za-z0-9/_:.%-]*(\?[A-Za-z0-9=&_.%-]*)?$/;
  const OP_NAME = /^[A-Za-z0-9]{1,64}$/;
  const HASH = /^[0-9a-f]{64}$/;

  // ---------- what the player tells us ----------

  const session = { authorization: '', 'client-token': '', 'app-platform': '', 'spotify-app-version': '', 'accept-language': '' };
  const connect = { origin: '', other: '', deviceId: '', fromCommand: false, license: '', playOrigin: null, queueTemplate: null };
  const traffic = {};            // operation name -> persisted-query hash the player itself used
  let channel = '';

  function classify(rawUrl) {
    let u;
    try { u = new URL(rawUrl, location.href); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'api-partner.spotify.com' && /^\/pathfinder\/v\d+\/query$/.test(u.pathname)) return { kind: 'pathfinder', u };
    if (SPCLIENT_HOST.test(u.hostname)) return { kind: 'spclient', u };
    return null;
  }

  function noteHash(u, body) {
    let op = '';
    let hash = '';
    try {
      if (typeof body === 'string' && body) {
        const j = jsonParse(body);
        op = j.operationName;
        hash = j.extensions?.persistedQuery?.sha256Hash;
      } else {
        op = u.searchParams.get('operationName');
        hash = jsonParse(u.searchParams.get('extensions') || '{}').persistedQuery?.sha256Hash;
      }
    } catch { /* not a persisted query */ }
    if (typeof op === 'string' && OP_NAME.test(op) && typeof hash === 'string' && HASH.test(hash)) traffic[op] = hash;
  }

  function noteConnect(u, body) {
    if (u.pathname.startsWith('/connect-state/')) connect.origin = u.origin;
    else connect.other = u.origin;
    let m = DEVICE_PATH.exec(u.pathname);
    if (m) {
      connect.origin = u.origin;        // the host the player's device talks to is the one for commands
      if (!connect.fromCommand) connect.deviceId = m[1];
    }
    m = COMMAND_PATH.exec(u.pathname);
    if (!m) return;
    connect.deviceId = m[1];          // the "from" device of a command beats the playback URLs
    connect.fromCommand = true;
    try {
      const command = jsonParse(body).command;
      if (command?.endpoint === 'play') {
        if (typeof command.options?.license === 'string') connect.license = command.options.license;
        if (command.play_origin && typeof command.play_origin === 'object') connect.playOrigin = command.play_origin;
      } else if (command?.endpoint === 'add_to_queue' && command.track && typeof command.track === 'object') {
        const { uri: _uri, uid: _uid, ...track } = command.track;
        const { logging_params: _log, endpoint: _endpoint, ...rest } = command;
        connect.queueTemplate = { ...rest, track };
      }
    } catch { /* body was not a JSON command */ }
  }

  function observe(rawUrl, headers, body) {
    const hit = classify(rawUrl);
    if (!hit) return;
    if (hit.kind === 'pathfinder') noteHash(hit.u, body);
    else noteConnect(hit.u, body);
    const auth = headers.get('authorization');
    if (!auth || !/^Bearer\s+\S+/i.test(auth)) return;
    session.authorization = auth;
    for (const name of SESSION_HEADERS) {
      const value = headers.get(name);
      if (value) session[name] = value;
    }
  }

  // ---------- passive wrappers: the original call is always passed through untouched ----------

  window.fetch = function fetch(...args) {
    try {
      const [input, init] = args;
      const req = typeof Request !== 'undefined' && input instanceof Request ? input : null;
      const url = req ? req.url : input instanceof URL ? input.href : String(input);
      const headers = new Headers(req ? req.headers : undefined);
      if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      observe(url, headers, typeof init?.body === 'string' ? init.body : null);
    } catch { /* never affect the player */ }
    return Reflect.apply(realFetch, this, args);
  };

  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr) {
    const open = xhr.open;
    const setRequestHeader = xhr.setRequestHeader;
    const send = xhr.send;
    const calls = new WeakMap();
    xhr.open = function (method, url, ...rest) {
      try { calls.set(this, { url: String(url), headers: new Headers() }); } catch { /* ignore */ }
      return Reflect.apply(open, this, [method, url, ...rest]);
    };
    xhr.setRequestHeader = function (name, value) {
      try { calls.get(this)?.headers.append(name, value); } catch { /* ignore */ }
      return Reflect.apply(setRequestHeader, this, [name, value]);
    };
    xhr.send = function (body) {
      try {
        const call = calls.get(this);
        if (call) observe(call.url, call.headers, typeof body === 'string' ? body : null);
      } catch { /* ignore */ }
      return Reflect.apply(send, this, [body]);
    };
  }

  // ---------- requests made on the extension's behalf ----------

  const coded = (code, message) => Object.assign(new Error(message), { code });
  const clamp = ms => Math.max(0, Math.min(Number(ms) || 0, 60_000));

  function requestHeaders(contentType) {
    const headers = { accept: 'application/json', 'content-type': contentType };
    for (const [name, value] of Object.entries(session)) if (value) headers[name] = value;
    return headers;
  }

  async function pack(res) {
    const text = await res.text().catch(() => '');
    let body = null;
    try { body = text ? jsonParse(text) : null; } catch { /* not JSON */ }
    return {
      status: res.status,
      ok: res.ok,
      retryAfter: Number(res.headers.get('retry-after')) || 0,
      body,
      text: body === null ? text.slice(0, 300) : '',
    };
  }

  async function pathfinder({ operationName, hash, variables }) {
    if (!OP_NAME.test(String(operationName)) || !HASH.test(String(hash))) throw coded('bad-request', 'Bad operation');
    if (!session.authorization) throw coded('no-session', 'The Spotify player has not sent a session yet.');
    let res;
    try {
      res = await realFetch(PATHFINDER_URL, {
        method: 'POST',
        headers: requestHeaders('application/json;charset=UTF-8'),
        body: jsonStringify({ variables: variables || {}, operationName, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } }),
      });
    } catch (err) {
      throw coded('network', String(err?.message || 'Network error'));
    }
    return pack(res);
  }

  async function spclient({ method, path, body }) {
    if (typeof path !== 'string' || !ALLOWED_SPCLIENT.test(path) || path.includes('..')) throw coded('bad-request', 'Path not allowed');
    if (!session.authorization) throw coded('no-session', 'The Spotify player has not sent a session yet.');
    const first = path.startsWith('/connect-state/') ? connect.origin || connect.other : connect.other || connect.origin;
    const origins = [...new Set([first, ...DEFAULT_SPCLIENT].filter(Boolean))];
    let failure;
    for (const origin of origins) {
      try {
        const res = await realFetch(origin + path, {
          method: method === 'GET' ? 'GET' : 'POST',
          headers: requestHeaders('application/json'),
          body: method === 'GET' || body === undefined ? undefined : jsonStringify(body),
        });
        return await pack(res);
      } catch (err) {
        failure = err;          // network error: try the next host
      }
    }
    throw coded('network', String(failure?.message || 'Network error'));
  }

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Resolves true as soon as a session exists; the extension races its own timer against this one.
  async function waitReady(ms) {
    const end = Date.now() + clamp(ms);
    while (!session.authorization && Date.now() < end) await pause(250);
    return Boolean(session.authorization);
  }

  async function waitNewToken(ms) {
    const bad = session.authorization;
    const end = Date.now() + clamp(ms);
    while (session.authorization === bad && Date.now() < end) await pause(250);
    return session.authorization !== bad;
  }

  const COMMANDS = {
    // No header value ever leaves this function.
    status: async () => ({
      ready: Boolean(session.authorization),
      appVersion: session['spotify-app-version'],
      hasClientToken: Boolean(session['client-token']),
      deviceId: connect.deviceId,
      license: connect.license,
      playOrigin: connect.playOrigin,
      queueTemplate: connect.queueTemplate,
      hashes: { ...traffic },
    }),
    waitReady: async ({ timeoutMs }) => ({ ready: await waitReady(timeoutMs) }),
    freshToken: async ({ timeoutMs }) => ({ fresh: await waitNewToken(timeoutMs) }),
    scripts: async () => ({
      scripts: [...document.scripts].map(s => s.src).filter(src => src.startsWith('https://open.spotifycdn.com/')),
    }),
    pathfinder,
    spclient,
  };

  async function run({ id, cmd, args }) {
    try {
      const handler = hasOwn(COMMANDS, cmd) ? COMMANDS[cmd] : null;
      if (!handler) throw coded('bad-command', `Unknown command ${String(cmd).slice(0, 40)}`);
      reply({ id, ok: true, result: await handler(args && typeof args === 'object' ? args : {}) });
    } catch (err) {
      reply({ id, ok: false, error: { code: err?.code || 'error', message: String(err?.message || err).slice(0, 300) } });
    }
  }

  const reply = msg => realPost({ yt2sp: 'res', channel, ...msg }, location.origin);

  // ---------- the channel to spotify-bridge.js ----------

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    if (d.yt2sp === 'init') {
      event.stopImmediatePropagation();       // later page scripts must not learn the channel id
      if (!channel && typeof d.channel === 'string' && d.channel.length >= 32) {
        channel = d.channel;                   // first id wins; a later "init" cannot replace it
        realPost({ yt2sp: 'ready', channel }, location.origin);
      }
      return;
    }
    if (d.yt2sp !== 'req' || !channel || d.channel !== channel) return;
    event.stopImmediatePropagation();
    run(d);
  }, true);

  // The bridge may have loaded first and missed nothing: it answers "hello" with an init.
  realPost({ yt2sp: 'hello' }, location.origin);
})();

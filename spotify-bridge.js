// Content script for open.spotify.com in the extension's isolated world (document_start). It relays
// between the extension (chrome.runtime) and spotify-hook.js, which runs in the page's own world.
//
// The relay only goes one way: the extension asks, the page script answers. Nothing in the page can
// start a message to the extension. Messages cross the page boundary through window.postMessage, so
// both sides check event.source, the origin, and a random channel id that is made here, once per page,
// and handed to the hook in an "init" message. The hook stops that message from travelling further,
// so scripts that load later never learn the id. See the hook for the other half.

(() => {
  if (window.__yt2spBridge) return;     // this world's globals are invisible to the page
  window.__yt2spBridge = true;

  const channel = crypto.randomUUID() + crypto.randomUUID();
  const pending = new Map();            // request id -> answer function
  const REQUEST_TIMEOUT_MS = 90_000;    // only a cleanup: the extension has its own, shorter timers
  let hookReady = false;
  let nextId = 1;

  const post = msg => window.postMessage(msg, location.origin);
  const sendInit = () => post({ yt2sp: 'init', channel });

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    // The hook says hello when it loads after us. Once it has answered "ready", say nothing more.
    if (d.yt2sp === 'hello') {
      if (!hookReady) sendInit();
      return;
    }
    if (d.channel !== channel) return;
    if (d.yt2sp === 'ready') {
      event.stopImmediatePropagation();
      hookReady = true;
    } else if (d.yt2sp === 'res') {
      event.stopImmediatePropagation();
      const answer = pending.get(d.id);
      if (answer) {
        pending.delete(d.id);
        answer(d);
      }
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || msg?.type !== 'yt2sp:page') return;
    if (msg.cmd === 'ping') {
      sendResponse({ ok: true, result: { hookReady } });
      return;
    }
    if (!hookReady) {
      sendResponse({ ok: false, error: { code: 'no-hook', message: 'The page script is not running in this tab.' } });
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      sendResponse({ ok: false, error: { code: 'timeout', message: 'The Spotify tab did not answer.' } });
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, d => {
      clearTimeout(timer);
      sendResponse(d.ok ? { ok: true, result: d.result } : { ok: false, error: d.error });
    });
    post({ yt2sp: 'req', channel, id, cmd: String(msg.cmd), args: msg.args || {} });
    return true;
  });

  sendInit();
})();

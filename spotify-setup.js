// Runs on developer.spotify.com, and only during setup: background.js registers it when the user
// clicks Set Up Spotify and takes it away again when the Client ID is saved (or after 30 minutes).
//
// It helps in two ways and never takes an app's Client ID unless that app is the right one:
//   * New app: it fills in the "Create app" form (name, description, redirect URI, Web API). The user
//     ticks the terms box and clicks Save. Only an app that the page reaches straight from that form,
//     and that was not in the dashboard list when setup began, is taken as the new one.
//   * Existing app (Spotify allows one per developer account): "Use my existing app" opens its settings,
//     adds the redirect URI there (filled in and highlighted), and takes the Client ID only after the
//     user confirms.
// In both cases the app's settings page is checked for the redirect URI before the login starts
// (review finding 1: a wrong app gave "Invalid redirect URI" with no hint why).

(() => {
  if (window.__yt2spSetup) return;
  window.__yt2spSetup = true;

  const APP_NAME = 'Dhaara';
  const APP_DESC = 'Personal tool: lets my YouTube Mixes flow into my Spotify.';
  const APP_PATH = /^\/dashboard\/([0-9a-f]{32})(\/settings)?\/?$/i;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ask = (type, data = {}) => chrome.runtime.sendMessage({ type: `yt2sp:${type}`, ...data }).catch(() => null);
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const buttons = () => [...document.querySelectorAll('button')];

  // ---------- banner (shadow DOM so the page's styles do not leak in) ----------

  let host = null;
  let banner = null;
  function show(html, actions = []) {
    if (!banner) {
      host = document.createElement('div');
      host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
      document.documentElement.append(host);
      banner = host.attachShadow({ mode: 'open' });
    }
    banner.innerHTML = `<style>
      .b{font:14px/1.45 system-ui,sans-serif;background:#181818;color:#f1f1f1;border:1px solid #1ed760;border-radius:12px;padding:14px 16px;width:330px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
      .t{font-weight:700;margin-bottom:4px;color:#1ed760}
      code{background:#2a2a2a;padding:2px 6px;border-radius:5px;font-size:12px;word-break:break-all}
      button{font:inherit;margin:10px 8px 0 0;border-radius:999px;border:1px solid #444;background:#2a2a2a;color:#fff;padding:5px 12px;cursor:pointer}
      button.p{background:#1ed760;color:#000;border-color:transparent;font-weight:600}
    </style><div class="b" role="status"><div class="t">Dhaara setup</div><div class="m">${html}</div><div class="a"></div></div>`;
    const bar = banner.querySelector('.a');
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      if (a.primary) btn.className = 'p';
      btn.onclick = a.onclick;
      bar.append(btn);
    }
  }

  // ---------- form filling ----------

  // Finds the input whose label (or placeholder / aria-label / id) mentions one of the words.
  function field(words) {
    const want = words.map(norm);
    for (const label of document.querySelectorAll('label')) {
      if (!want.some(w => norm(label.textContent).startsWith(w))) continue;
      const el = (label.htmlFor && document.getElementById(label.htmlFor)) ||
        label.querySelector('input, textarea') ||
        label.parentElement?.querySelector('input, textarea');
      if (el) return el;
    }
    return [...document.querySelectorAll('input, textarea')].find(el =>
      want.some(w => norm(el.placeholder).includes(w) || norm(el.getAttribute('aria-label')).includes(w) || norm(el.id).includes(w.replace(/\s/g, ''))));
  }

  // From this isolated world, setting .value does not touch React's value tracker, so the input
  // event below is seen as a real change.
  function type(el, value) {
    if (!el || el.value === value) return Boolean(el);
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function checkboxFor(text) {
    for (const label of document.querySelectorAll('label')) {
      if (norm(label.textContent) !== norm(text)) continue;
      return (label.htmlFor && document.getElementById(label.htmlFor)) || label.querySelector('input[type=checkbox]') ||
        label.parentElement?.querySelector('input[type=checkbox]');
    }
    return null;
  }

  async function addRedirect(uri) {
    if (document.body.textContent.includes(uri) && ![...document.querySelectorAll('input')].some(i => i.value === uri)) return true;
    const input = field(['redirect uri', 'redirect uris']);
    if (!type(input, uri)) return false;
    await sleep(150);
    const scope = input.closest('div')?.parentElement || document;
    const add = [...scope.querySelectorAll('button')].find(b => norm(b.textContent) === 'add');
    if (add) add.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(300);
    return document.body.textContent.includes(uri);
  }

  function outline(el) {
    if (el) el.style.outline = '3px solid #1ed760';
  }

  const saveButton = () => buttons().find(b => norm(b.textContent) === 'save');

  const goto = path => { location.href = path; };

  async function fillCreateForm(redirectUri) {
    // The form renders after the dashboard app loads.
    for (let i = 0; i < 40 && !field(['app name']); i++) await sleep(250);
    const name = type(field(['app name']), APP_NAME);
    const desc = type(field(['app description', 'description']), APP_DESC);
    const redirect = await addRedirect(redirectUri);
    const webApi = checkboxFor('Web API');
    if (webApi && !webApi.checked) webApi.click();

    const terms = [...document.querySelectorAll('input[type=checkbox]')].find(c => /terms/i.test(c.closest('label, div')?.textContent || ''));
    outline(terms?.closest('label') || terms);
    outline(saveButton());

    const copy = text => () => navigator.clipboard.writeText(text);
    const already = { label: 'I already have an app', onclick: () => goto('/dashboard') };
    if (name && desc && redirect && webApi) {
      show('Filled in for you. Now tick the <b>terms</b> box and click <b>Save</b>. I check the new app’s redirect URI, then start the login.', [already]);
    } else {
      show(`Filled in what I could. Please check these, tick the terms box and click <b>Save</b>:<br>
        Name: <code>${APP_NAME}</code><br>Redirect URI: <code>${esc(redirectUri)}</code><br>API: tick <b>Web API</b>`,
      [{ label: 'Copy redirect URI', onclick: copy(redirectUri) }, already]);
    }
  }

  // ---------- the app the user is working on ----------

  const appIdsOnPage = () => [...new Set([...document.querySelectorAll('a[href]')]
    .map(a => (a.getAttribute('href') || '').match(/^(?:https:\/\/developer\.spotify\.com)?\/dashboard\/([0-9a-f]{32})(?:[/?#]|$)/i)?.[1]?.toLowerCase())
    .filter(Boolean))];

  let finished = false;

  async function useApp(id, via, fromCreate = false) {
    const res = await ask('setupTarget', { clientId: id, via, fromCreate });
    if (res?.ok) {
      show('Opening the app’s settings to check the redirect URI…');
      goto(`/dashboard/${id}/settings`);
    } else {
      show(esc(res?.error || 'Could not choose that app. Try Set Up Spotify again from the extension.'));
    }
  }

  // The app's settings page: the redirect URI must be listed on it before the login starts.
  async function settingsStep(id, state) {
    const uri = state.redirectUri;
    show('Checking this app’s redirect URI…');
    for (let i = 0; i < 40 && !/redirect/i.test(document.body.textContent); i++) await sleep(250);

    const finish = async () => {
      finished = true;
      show('Got it. Approve the Spotify login window that opens to finish.');
      const res = await ask('foundClientId', { clientId: id });
      if (res?.connected) show('All set. Go back to YouTube and click the extension icon.');
      else if (res?.saved) show(`Client ID saved. Open the extension and click <b>Connect Spotify</b>.${res.error ? `<br><small>${esc(res.error)}</small>` : ''}`);
      else show(esc(res?.error || 'Setup was not active any more. Start it again from the extension.'));
    };
    const listed = () => document.body.textContent.includes(uri);
    // Listed and not being edited: the Save button is only there while editing.
    const saved = () => listed() && !saveButton() && ![...document.querySelectorAll('input, textarea')].some(el => el.value.includes(uri));

    if (saved()) {
      if (state.target.via === 'created') return finish();
      show('This app already has Dhaara’s redirect URI. Use it for Dhaara?', [{ label: 'Use this app', primary: true, onclick: finish }]);
      return;
    }

    // Not there yet (an existing app, or the form did not take it): open the editor and add it.
    const edit = buttons().concat([...document.querySelectorAll('a')]).find(b => ['edit', 'edit settings'].includes(norm(b.textContent)));
    if (edit) {
      edit.click();
      await sleep(500);
    }
    const added = await addRedirect(uri);
    outline(saveButton());
    const proceed = {
      label: 'Continue',
      primary: true,
      onclick: () => {
        if (listed()) finish();
        else show(`The redirect URI is not on the page yet. Add <code>${esc(uri)}</code> under Redirect URIs, click <b>Save</b>, then click Continue.`, [{ label: 'Continue', primary: true, onclick: proceed.onclick }]);
      },
    };
    show(added
      ? 'I added the redirect URI to this app. Click <b>Save</b> on the page, then click <b>Continue</b>.'
      : `I could not add it myself. Under Redirect URIs add <code>${esc(uri)}</code>, click <b>Save</b>, then click <b>Continue</b>.`,
    [proceed, { label: 'Copy redirect URI', onclick: () => navigator.clipboard.writeText(uri) }]);
  }

  // An app page (its overview or its settings).
  async function appStep(id, onSettings, state, cameFromCreate) {
    if (state.target?.id === id) {
      if (onSettings) return settingsStep(id, state);
      show('Opening the app’s settings to check the redirect URI…');
      return goto(`/dashboard/${id}/settings`);
    }
    // Reached straight from the Create form, and not an app the list showed: the one this setup made.
    const isNew = state.created && !onSettings && (state.known ? !state.known.includes(id) : cameFromCreate);
    if (isNew) return useApp(id, 'created', cameFromCreate);
    // Any other app is only offered, never taken silently.
    show('This is an app you already had. To use it for Dhaara, I add the redirect URI to it, and you confirm.', [
      { label: 'Use this app', primary: true, onclick: () => useApp(id, 'existing') },
    ]);
  }

  // The dashboard list: remember which apps exist before a new one is made, and offer an existing one.
  async function listStep(state) {
    show('Looking at your Spotify apps…');
    let ids = [];
    for (let i = 0; i < 40 && !ids.length; i++) {
      ids = appIdsOnPage();
      if (!ids.length) await sleep(250);
    }
    if (location.pathname.replace(/\/$/, '') !== '/dashboard') return;
    // After the Create form, the list may come first: a lone app that was not there before is the new one.
    const fresh = state.created && state.known ? ids.filter(id => !state.known.includes(id)) : [];
    if (fresh.length === 1) return useApp(fresh[0], 'created', true);
    await ask('setupApps', { ids });
    const create = { label: 'Create a new app', onclick: () => goto('/dashboard/create') };
    if (!ids.length) {
      show('Click <b>Create app</b> (top right). I will fill in the form. Already have an app? Open it and click <b>Use this app</b>.', [{ ...create, label: 'Create app', primary: true }]);
    } else if (ids.length === 1) {
      show('You already have a Spotify app. Spotify allows one per developer account, so Dhaara can use it: I add the redirect URI to it, and you confirm.', [
        { label: 'Use my existing app', primary: true, onclick: () => useApp(ids[0], 'existing') }, create,
      ]);
    } else {
      show(`You have ${ids.length} Spotify apps. Open the one to use and click <b>Use this app</b>, or make a new one.`, [create]);
    }
  }

  // ---------- page watcher (the dashboard is a single-page app) ----------

  let lastPath = '';
  let lastCheck = 0;
  let busy = false;
  let timer = null;

  // Setup is over (done, cancelled or timed out): nothing keeps running in this tab.
  function stop() {
    clearInterval(timer);
    if (!finished) host?.remove();
    window.__yt2spSetup = false;
  }

  async function onPage() {
    if (busy) return;
    const path = location.pathname;
    const changed = path !== lastPath;
    // The path is only looked at when it changes; the state is re-read once a minute to notice the end.
    if (!changed && Date.now() - lastCheck < 60_000) return;
    const cameFromCreate = changed && lastPath.startsWith('/dashboard/create');
    lastPath = path;
    lastCheck = Date.now();
    busy = true;
    try {
      const state = await ask('setupState');
      if (!state?.active) return stop();
      if (!changed) return;
      const app = path.match(APP_PATH);
      if (path.startsWith('/dashboard/create')) {
        await ask('setupCreate');
        await fillCreateForm(state.redirectUri);
      } else if (path === '/dashboard' || path === '/dashboard/') {
        await listStep(state);
      } else if (app) {
        await appStep(app[1].toLowerCase(), Boolean(app[2]), state, cameFromCreate);
      }
    } finally {
      busy = false;
    }
  }

  onPage();
  timer = setInterval(onPage, 800);
})();

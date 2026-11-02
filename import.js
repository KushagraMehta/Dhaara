// The full view. Matching, play/queue/save jobs and login live in the background worker (background.js);
// this page renders what is in storage and sends it requests.
import * as sp from './spotify.js';
import {
  $, h, fmt, icon, spinner, onToast, trackCard, signal, resultRow, changePanel, songs, Songs, pasteKey,
  BADGES, LEVELS, displayTitle, isDoubtful, expand, collapse, reducedMotion,
  popupMenu, chooseDevice, resumeDeviceJob, showConfirm, linkLine, spotifyClick, readOpenIn,
} from './ui.js';
import {
  QUEUE_KEY, JOB_KEY, LOGIN_KEY, LINKS_KEY, OPEN_KEY, EXCLUSIVE_KEY,
  matchKey, trackKey, readMatches, watchMatches, savePick, isTicked, bg, readLinks, linkFor, newSongs,
} from './store.js';

// Storage keys owned by spotify.js: a change to either means the login or the Client ID changed.
const CLIENT_KEY = 'yt2sp:clientId';
const TOKEN_KEY = 'yt2sp:token';

let queue = emptyQueue();            // { sources, tracks, playlistName }; tracks hold no match data
let views = {};                      // key -> { status, match, alts, error }, from readMatches
let status = { user: null, hasClientId: false };
let job = null;                      // the play/queue/save job shown in the status line
let wasRunning = false;
let todoAt = null;                   // key the "Review" button last took the user to
let loginMessage = '';
let setupMessage = '';               // a needsSetup error: offer the official setup (decision 4)
let settingsOpen = false;
let manualOpen = false;
let links = {};                      // listId -> the playlist that Mix was saved to (decision 3)
let targetTouched = false;           // the user picked a playlist themselves, so the link no longer chooses it
let shortcutsUrl = 'chrome://extensions/shortcuts';
let creating = false;                // a save is being started: a second click or Enter is ignored
let settingUp = false;               // the official setup is being started
const open = new Set();              // keys whose Change panel is open

function emptyQueue() {
  return { sources: [], tracks: [], playlistName: '' };
}

const view = key => views[key] || { status: 'pending' };
const strip = t => ({ key: t.key, videoId: t.videoId, title: t.title, channel: t.channel, durationSec: t.durationSec, site: t.site });
const isWeb = () => status.mode === 'web';

// ---------- queue ----------

function normalizeQueue(q) {
  if (!q) return emptyQueue();
  const seenSource = new Set();
  const seenKey = new Set();
  const tracks = [];
  for (const t of q.tracks || []) {
    // Keys follow trackKey() now; lists saved by an older version used a different spelling.
    const key = t.site === 'manual' ? t.key : trackKey(t);
    if (!key || seenKey.has(key)) continue;
    seenKey.add(key);
    // An older version stored its own match and a tick on the track; that tick no longer means anything.
    const legacy = 'status' in t || 'match' in t;
    tracks.push({
      key, videoId: t.videoId, title: t.title, channel: t.channel, durationSec: t.durationSec, site: t.site,
      checked: !legacy && typeof t.checked === 'boolean' ? t.checked : undefined,
    });
  }
  return {
    sources: (q.sources || []).filter(s => !seenSource.has(`${s.listId}|${s.title}`) && seenSource.add(`${s.listId}|${s.title}`)),
    playlistName: q.playlistName || q.sources?.[0]?.title || '',
    tracks,
  };
}

// Hand picks and manual songs saved by an older version move to the per-song pick keys.
async function migrateLegacy(raw) {
  const picks = (raw?.tracks || []).filter(t => t.match && (t.status === 'picked' || t.site === 'manual'));
  await Promise.all(picks.map(t => savePick(t.site === 'manual' ? t.key : trackKey(t), t.match)));
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { sources, tracks, playlistName } = queue;
    chrome.storage.local.set({ [QUEUE_KEY]: { sources, tracks, playlistName, origin: 'importer', rev: Date.now() } });
  }, 300);
}

// ---------- errors and notes ----------

// Small notes go to the status line under the toolbar, never to a timed toast.
function note(message, error = false) {
  showResult(error ? { error: message } : { message, fresh: true });
}

async function onError(err) {
  if (err?.needsSetup) {
    setupMessage = err.message;
    settingsOpen = true;
    renderSettings();
    $('settings').scrollIntoView({ block: 'nearest' });
    return;
  }
  if (err?.needsLogin) return relogin(err.message);
  note(err?.message || String(err), true);
}

// ---------- matching ----------

function requestMatching(tracks = queue.tracks) {
  if (!status.user) return;
  const items = tracks.filter(t => t.site !== 'manual').map(strip);
  if (!items.length) return;
  bg('match', { items }).catch(onError);
}

async function rematchAll() {
  if (!status.user) return note('Connect Spotify first.', true);
  const redo = queue.tracks.filter(t => t.site !== 'manual' && view(t.key).status !== 'picked');
  for (const t of redo) {
    delete t.checked;
    delete views[t.key];
  }
  await chrome.storage.local.remove(redo.map(t => matchKey(t.key)));
  for (const t of redo) updateRow(t.key);
  renderStats();
  renderToolbar();
  save();
  requestMatching();
}

// ---------- account and settings ----------

function renderAccount() {
  const box = $('account');
  box.replaceChildren();
  const user = status.user;
  const label = user ? user.name : 'Connect Spotify';
  box.append(h('button', {
    'aria-expanded': String(settingsOpen), 'aria-controls': 'settings',
    title: user ? `Spotify: ${user.name}${isWeb() ? ', through your Spotify tab' : ''}. Settings` : 'Spotify account settings',
    onclick: toggleSettings,
  },
  user?.image ? h('img', { class: 'avatar', src: user.image, alt: '' }) : h('span', { class: 'avatar', 'aria-hidden': 'true' }, user ? (user.name || '?')[0].toUpperCase() : '?'),
  h('span', { class: 'name' }, label)));
}

function toggleSettings() {
  settingsOpen = !settingsOpen;
  if (!settingsOpen) manualOpen = false;
  renderSettings();
  renderAccount();
  if (settingsOpen) $('settings').scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function renderSettings() {
  const { user, hasClientId } = status;
  const web = isWeb();
  // A failed no-setup login signs out and leaves webProblem: say why and offer the official setup (decision 4).
  const webProblem = !user ? status.webProblem || '' : '';
  const retryWeb = web || (Boolean(webProblem) && !hasClientId);
  $('settings').hidden = Boolean(user) && !settingsOpen && !setupMessage;
  if ($('settings').hidden) return;
  // First run: the two choices. Official app saved but signed out, or the web login failing: one message.
  $('setupBox').hidden = Boolean(user) || hasClientId || retryWeb || Boolean(setupMessage);
  $('loginBox').hidden = (Boolean(user) && !setupMessage) || !(hasClientId || retryWeb || setupMessage);
  const problem = setupMessage || loginMessage || webProblem;
  $('loginText').replaceChildren(...(problem
    ? [h('span', { class: 'msg' }, icon('warn', 14), problem)]
    : ['Sign in to Spotify to find your songs there.']));
  $('connectBtn').hidden = Boolean(setupMessage);
  $('connectBtn').textContent = retryWeb ? 'Try My Spotify Tab Again' : 'Connect Spotify…';
  $('connectBtn').className = retryWeb ? '' : 'primary';
  $('loginSetupBtn').hidden = !(retryWeb || setupMessage);
  $('loginSetupBtn').className = retryWeb || setupMessage ? 'primary' : '';
  $('connectedBox').hidden = !user || Boolean(setupMessage);
  $('userName').textContent = user?.name || '';
  $('modeText').textContent = web
    ? 'Connected through your Spotify tab (unofficial, no setup).'
    : 'Connected through your own Spotify app (official).';
  $('modeBtn').textContent = web ? 'Switch to Official Setup…' : 'Use My Spotify Tab Instead';
  $('clientToggle').hidden = !hasClientId || web;
  $('clientToggle').textContent = manualOpen ? 'Hide Client ID' : 'Change Client ID…';
  $('manual').hidden = (hasClientId || web) && !manualOpen;
  $('manualTitle').textContent = hasClientId ? 'Change Client ID' : 'Set It Up by Hand';
  if (document.activeElement !== $('clientId')) sp.getClientId().then(id => { $('clientId').value = id || ''; }).catch(() => {});
  renderShortcuts();
}

// The keyboard shortcuts as the browser has them now (the user can change them on its own page).
async function renderShortcuts() {
  const box = $('shortcutsBox');
  box.hidden = !status.user || Boolean(setupMessage);
  $('prefsBox').hidden = box.hidden;
  if (box.hidden) return;
  let commands = [];
  try {
    commands = (await chrome.commands.getAll()).filter(c => c.name !== '_execute_action');
  } catch {
    // The list stays empty.
  }
  $('shortcutList').replaceChildren(...commands.map(c => h('div', { class: 'shortcut' },
    h('span', {}, c.description || c.name),
    c.shortcut ? h('kbd', {}, c.shortcut) : h('span', { class: 'muted' }, 'Not set'))));
}

function toggleManual() {
  manualOpen = !manualOpen;
  if (manualOpen) $('manual').open = true;
  renderSettings();
}

function resetPlaylists() {
  $('target').setOptions([{ value: 'new', label: 'New Playlist' }], 'new');
  onTargetChange();
}

function applyStatus(next) {
  const was = status;
  status = next;
  if (next.user) {
    loginMessage = '';
    setupMessage = '';
  } else {
    resetPlaylists();
  }
  renderAll();
  if (next.user && !was.user) {
    loadPlaylists();
    requestMatching();
  }
}

async function refreshStatus() {
  const next = await bg('status').catch(() => null);
  if (next && JSON.stringify(next) !== JSON.stringify(status)) applyStatus(next);
}

// The background says the login is gone (expired, or a worker run hit a 401).
async function relogin(message) {
  loginMessage = message;
  const next = await bg('status').catch(() => status);
  applyStatus({ ...next, user: null });
}

function busy(btn, text) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return () => { btn.disabled = false; btn.textContent = label; };
}

async function connect() {
  const done = busy($('connectBtn'), 'Waiting for Spotify…');
  try {
    await bg('connect');
    loginMessage = '';
    setupMessage = '';
  } catch (err) {
    if (err.needsSetup) setupMessage = err.message;
    // The login waits in its own tab and can outlive the background worker: it is finished from there,
    // and the stored login changing refreshes this page.
    else loginMessage = err.interrupted ? 'Finish signing in in the Spotify tab that opened. This page updates when you are done.' : err.message;
  } finally {
    done();
  }
  await refreshStatus();
  renderSettings();
}

// The no-setup login: Spotify's web player in a tab the user is signed in to (decision 4).
async function useWebTab(btn) {
  const done = busy(btn, 'Waiting for Spotify…');
  try {
    await bg('setMode', { mode: 'web' });
    status = { ...status, mode: 'web' };
    await bg('connect');
    loginMessage = '';
    setupMessage = '';
  } catch (err) {
    if (err.needsSetup) setupMessage = err.message;
    else loginMessage = err.message;
  } finally {
    done();
  }
  await refreshStatus();
  renderSettings();
}

// The official setup: a Spotify app the user owns.
async function startSetup() {
  if (settingUp) return;
  settingUp = true;
  try {
    if (isWeb()) await bg('setMode', { mode: 'app' });
    setupMessage = '';
    if (status.hasClientId) {
      status = { ...status, mode: 'app' };
      return await connect();
    }
    await bg('setup');
    note('Spotify’s developer dashboard is open in a new tab. Follow the note at its bottom right: the extension fills in or checks your app, then starts the login.');
  } catch (err) {
    note(err.message, true);
  } finally {
    settingUp = false;
  }
}

async function switchMode() {
  if (isWeb()) return startSetup();
  return useWebTab($('modeBtn'));
}

async function saveClientId() {
  const id = $('clientId').value.trim();
  if (id.includes('chromiumapp.org')) return note('That is the redirect URI: it goes in the Spotify dashboard. Paste the Client ID from your app’s Settings page here.', true);
  if (!/^[0-9a-f]{32}$/i.test(id)) return note('That does not look like a Spotify Client ID (32 letters and digits).', true);
  const btn = $('saveClient');
  btn.disabled = true;
  try {
    await bg('setClientId', { clientId: id });
    manualOpen = false;
    await refreshStatus();
    await connect();
  } catch (err) {
    note(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// Asks first, in a row under the buttons (not window.confirm). Disconnecting deletes what the extension
// saved about the account: the login, matches, hand picks, the list, playlist links and the device.
function askDisconnect() {
  showConfirm($('disconnectConfirm'), {
    text: 'Disconnect and delete saved matches?',
    detail: 'This also clears your list, hand picks and playlist links. Your Spotify playlists stay as they are.',
    action: 'Disconnect',
    onConfirm: disconnect,
  });
}

async function disconnect() {
  // A pending debounced save would write the list back after the wipe.
  clearTimeout(saveTimer);
  try {
    await bg('disconnect');
    clearTimeout(saveTimer);
    queue = emptyQueue();
    views = {};
    links = {};
    open.clear();
    todoAt = null;
    targetTouched = false;
    loginMessage = '';
    setupMessage = '';
    settingsOpen = false;
    manualOpen = false;
    job = null;
    wasRunning = false;
    showResult();
    await refreshStatus();
    renderAll();
    note('Disconnected. Saved matches, hand picks, your list and playlist links were deleted.');
  } catch (err) {
    note(err.message, true);
  }
}

async function loadPlaylists() {
  if (!status.user) return;
  const sel = $('target');
  const current = sel.value;
  try {
    const { playlists } = await bg('playlists');
    sel.setOptions([
      { value: 'new', label: 'New Playlist' },
      // The no-setup login cannot count tracks (total is null), so the count is left out then.
      ...playlists.map((p, k) => ({ value: p.id, label: p.name, name: p.name, detail: p.total == null ? '' : String(p.total), separatorBefore: k === 0 })),
    ], current);
    applyLinkTarget();
  } catch (err) {
    if (err.needsLogin) relogin(err.message);
    else note(`Couldn’t load your playlists: ${err.message}`, true);
  }
  onTargetChange();
}

// A Mix that was saved before has its playlist chosen for it, until the user picks another one.
function applyLinkTarget() {
  if (targetTouched) return;
  const sel = $('target');
  const link = activeLink();
  if (!link) {
    sel.value = 'new';
    return;
  }
  if (!sel.options.some(o => o.value === link.playlistId)) {
    sel.setOptions([...sel.options, { value: link.playlistId, label: link.name, name: link.name, separatorBefore: true }]);
  }
  sel.value = link.playlistId;
}

// The one Mix this list holds, when it holds exactly one: only then does saving link it.
const sourceList = () => (queue.sources.length === 1 ? queue.sources[0].listId || null : null);
const activeLink = () => linkFor(links, sourceList(), status.user, status.mode);

function onTargetChange() {
  const isNew = $('target').value === 'new';
  for (const id of ['playlistName', 'nameLabel', 'publicRow']) $(id).hidden = !isNew;
  renderToolbar();
}

// ---------- rows ----------

function youtubeCell(t) {
  const sub = t.site === 'manual' ? 'Added by you' : t.channel || '';
  return h('div', { class: 'yt' },
    t.videoId ? h('img', { class: 'thumb', src: `https://i.ytimg.com/vi/${t.videoId}/default.jpg`, alt: '', decoding: 'async' }) : h('div', { class: 'thumb ph' }, icon('note', 16)),
    h('div', { class: 'meta' },
      t.videoId
        ? h('a', { class: 'title', href: `https://www.youtube.com/watch?v=${t.videoId}`, target: '_blank', rel: 'noopener', title: t.title }, t.title)
        : h('div', { class: 'title', title: t.title }, t.title),
      h('div', { class: 'sub' }, sub)));
}

function spotifyCell(t) {
  const v = view(t.key);
  if (v.match) return h('div', { class: 'sp' }, trackCard(v.match));
  if (t.site === 'manual') return h('div', { class: 'sp state' }, 'This song’s Spotify details are missing. Search again.');
  if (v.status === 'error') {
    return h('div', { class: 'sp state err' }, v.error || 'Couldn’t search Spotify.',
      h('button', { class: 'small', onclick: () => requestMatching([t]) }, 'Try Again'));
  }
  if (!status.user) return h('div', { class: 'sp state' }, 'Connect Spotify to find this song.');
  if (v.status === 'matching') return h('div', { class: 'sp state' }, spinner(), 'Searching Spotify…');
  if (v.status === 'pending') return h('div', { class: 'sp state' }, 'Waiting…');
  return h('div', { class: 'sp state err' }, 'Not found on Spotify');
}

function fitCell(v) {
  if (!v.match) return h('span', { class: 'fit-cell' });
  const word = { high: 'Sure', picked: 'Picked' }[v.status] || BADGES[v.status] || '';
  return h('span', { class: `fit-cell fit${isDoubtful(v.status) ? ' warn' : ''}` }, signal(v, { animate: justMatched.has(v) }), word);
}

const justMatched = new WeakSet();   // match views whose search just finished: their bars grow in once

function trackRow(t, index) {
  const v = view(t.key);
  const name = v.match ? displayTitle(v.match.name) : t.title;
  const isOpen = open.has(t.key);
  return h('div', { class: `track s-${v.status}` },
    h('span', { class: 'cbx' }, h('input', {
      type: 'checkbox',
      checked: isTicked(v, t.checked),
      disabled: !v.match,
      'aria-label': `Include ${name}`,
      // The checkbox stays (so its tick draws in); only the row's faded state changes.
      onchange: e => { t.checked = e.target.checked; const item = itemEl(t.key); if (item) item.className = itemClass(t); renderToolbar(); renderTickAll(); save(); },
    })),
    h('div', { class: 'num' }, String(index + 1)),
    youtubeCell(t),
    spotifyCell(t),
    fitCell(v),
    h('div', { class: 'time' }, fmt(v.match?.durationSec || t.durationSec)),
    h('div', { class: 'actions' },
      h('button', {
        class: 'icon-btn disc', disabled: !status.user, 'aria-expanded': String(isOpen), onclick: () => toggleOpen(t),
        title: isOpen ? 'Hide Search' : 'Choose a Different Song…',
        'aria-label': `${isOpen ? 'Hide search for' : 'Change match for'} ${t.title}`,
      }, icon('chevronDown', 16)),
      h('button', { class: 'icon-btn', title: 'Remove from List', 'aria-label': `Remove ${t.title} from list`, onclick: () => removeTrack(t) }, icon('close', 14))));
}

const panelFor = t => changePanel(t, view(t.key), a => pick(t, a));
const itemEl = key => $('list').querySelector(`.item[data-key="${CSS.escape(key)}"]`);
const itemClass = t => {
  const v = view(t.key);
  return `item${open.has(t.key) ? ' open' : ''}${v.match && !isTicked(v, t.checked) ? ' off' : ''}`;
};

// Redraws one song's row. An open Change panel is left alone, so what the user typed stays.
function updateRow(key) {
  const index = queue.tracks.findIndex(t => t.key === key);
  const item = itemEl(key);
  if (index < 0 || !item) return;
  const t = queue.tracks[index];
  item.className = itemClass(t);
  item.firstElementChild.replaceWith(trackRow(t, index));
  const panel = item.querySelector(':scope > .change');
  if (open.has(key) && !panel) {
    const fresh = panelFor(t);
    item.append(fresh);
    expand(fresh);
  } else if (!open.has(key) && panel) {
    collapse(panel).then(() => { if (!open.has(key)) panel.remove(); });
  }
}

function renderList() {
  const panels = new Map();
  for (const item of $('list').children) {
    const panel = item.querySelector(':scope > .change');
    if (panel) panels.set(item.dataset.key, panel);
  }
  $('list').replaceChildren(...queue.tracks.map((t, i) => {
    const item = h('div', { class: itemClass(t), 'data-key': t.key }, trackRow(t, i));
    if (open.has(t.key)) item.append(panels.get(t.key) || panelFor(t));
    return item;
  }));
  renderTickAll();
}

function toggleOpen(t) {
  if (open.has(t.key)) open.delete(t.key);
  else open.add(t.key);
  updateRow(t.key);
  const item = itemEl(t.key);
  item?.querySelector('.disc')?.focus();
  if (open.has(t.key)) item?.querySelector('.change input')?.focus({ preventScroll: true });
}

async function pick(t, track) {
  open.delete(t.key);
  t.checked = true;
  if (t.site === 'manual') {
    t.title = track.name;
    t.channel = track.artists.join(', ');
    t.durationSec = track.durationSec;
  }
  try {
    await savePick(t.key, track);
  } catch (err) {
    note(err.message, true);
    return;
  }
  views[t.key] = { ...view(t.key), status: 'picked', match: track };
  updateRow(t.key);
  renderStats();
  renderToolbar();
  renderTickAll();
  save();
}

function removeTrack(t) {
  queue.tracks = queue.tracks.filter(x => x !== t);
  open.delete(t.key);
  renderQueue();
  save();
}

// The select-all checkbox: mixed or off ticks every matched song; all on unticks them.
function matchedTracks() {
  return queue.tracks.filter(t => view(t.key).match);
}

function renderTickAll() {
  const matched = matchedTracks();
  const on = matched.filter(t => isTicked(view(t.key), t.checked)).length;
  const all = $('tickAll');
  all.disabled = !matched.length;
  all.checked = matched.length > 0 && on === matched.length;
  all.indeterminate = on > 0 && on < matched.length;
}

function tickAll() {
  const matched = matchedTracks();
  const allOn = matched.length > 0 && matched.every(t => isTicked(view(t.key), t.checked));
  for (const t of matched) t.checked = !allOn;
  for (const t of matched) updateRow(t.key);
  renderTickAll();
  renderToolbar();
  save();
}

// ---------- page ----------

function selectedTracks() {
  const out = new Map();
  for (const t of queue.tracks) {
    const v = view(t.key);
    if (isTicked(v, t.checked) && !out.has(v.match.id)) out.set(v.match.id, v.match);
  }
  return [...out.values()];
}

const selectedUris = () => [...new Set(selectedTracks().map(m => m.uri))];

// Statuses where the user still has something to do.
const needsLook = s => s === 'check' || s === 'low' || s === 'none' || s === 'error';

// Takes the user to the next song that needs a look, after the last one it showed, and opens its Change panel.
function nextTodo() {
  const tracks = queue.tracks;
  if (!status.user || !tracks.length) return;
  const from = tracks.findIndex(t => t.key === todoAt);
  for (let i = 1; i <= tracks.length; i++) {
    const t = tracks[(from + i + tracks.length) % tracks.length];
    if (!needsLook(view(t.key).status)) continue;
    todoAt = t.key;
    if (!open.has(t.key)) {
      open.add(t.key);
      updateRow(t.key);
    }
    const item = itemEl(t.key);
    item?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    item?.querySelector('.change input')?.focus({ preventScroll: true });
    return;
  }
}

function renderStats() {
  let found = 0, todo = 0, searching = 0;
  for (const t of queue.tracks) {
    const s = view(t.key).status;
    if (LEVELS[s] > 0) found++;
    if (s === 'pending' || s === 'matching') searching++;
    if (needsLook(s)) todo++;
  }
  const dot = () => h('span', { class: 'dot', 'aria-hidden': 'true' }, '·');
  const parts = status.user
    ? [
      songs(queue.tracks.length),
      `${found} on Spotify`,
      todo ? h('button', { class: 'plain', onclick: nextTodo, title: 'Go to the next song that needs a look' }, `Review ${todo}`) : null,
      searching ? h('span', { class: 'searching' }, spinner(), `${searching} searching`) : null,
    ].filter(Boolean)
    : [songs(queue.tracks.length)];
  $('stats').replaceChildren(...parts.flatMap((p, i) => (i ? [dot(), p] : [p])));
}

function renderToolbar() {
  const n = selectedUris().length;
  const running = Boolean(job?.running);
  $('tbActions').hidden = !queue.tracks.length;
  const isNew = $('target').value === 'new';
  const link = activeLink();
  const onLink = Boolean(link) && $('target').value === link.playlistId;
  const fresh = onLink ? newSongs(link, selectedUris()).length : n;
  $('createBtn').textContent = onLink
    ? (fresh ? `Add ${fresh} New ${fresh === 1 ? 'Song' : 'Songs'}` : 'No New Songs')
    : n ? `${isNew ? 'Save' : 'Add'} ${Songs(n)}` : 'Save';
  $('createBtn').title = onLink ? 'Add the ticked songs that are new to the linked playlist'
    : isNew ? 'Save the ticked songs as a new playlist' : 'Add the ticked songs to the playlist you chose';
  $('playBtn').replaceChildren(icon('play', 14), 'Play');
  $('playBtn').title = n ? `Play the ${songs(n)} you ticked` : 'Tick at least one song first.';
  $('queueBtn').replaceChildren(icon('queue', 14), 'Queue');
  $('queueBtn').title = 'Add the ticked songs to the end of your Spotify queue';
  for (const id of ['createBtn', 'playBtn', 'queueBtn']) $(id).disabled = !status.user || !n || running;
  if (onLink && !fresh) $('createBtn').disabled = true;
  $('copyBtn').disabled = !n;
  renderLinkLine();
}

// "Linked to <playlist>, 3 new songs since you last saved" under the sources.
function renderLinkLine() {
  const link = activeLink();
  const box = $('linkLine');
  box.hidden = !link || !queue.tracks.length || !status.user;
  if (!box.hidden) box.replaceChildren(...linkLine(link, newSongs(link, selectedUris()).length));
}

function renderSources() {
  const box = $('sources');
  box.hidden = !queue.sources.length;
  box.replaceChildren('From ');
  queue.sources.forEach((s, i) => {
    if (i) box.append(i === queue.sources.length - 1 ? ' and ' : ', ');
    box.append(h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title), ` on ${s.site === 'ytmusic' ? 'YouTube Music' : 'YouTube'}`);
  });
}

function renderQueue() {
  const has = queue.tracks.length > 0;
  $('empty').hidden = has;
  $('controls').hidden = !has;
  $('table').hidden = !has && !status.user;
  $('credit').hidden = !has;
  $('addSong').hidden = !status.user;
  $('matchBtn').disabled = !status.user;
  $('listTitle').textContent = queue.playlistName || queue.sources[0]?.title || 'My List';
  document.title = has ? `${$('listTitle').textContent} – Dhaara` : 'Dhaara';
  if (has) renderSources();
  if (document.activeElement !== $('playlistName')) $('playlistName').value = queue.playlistName || '';
  renderList();
  renderStats();
  renderToolbar();
}

function renderAll() {
  renderAccount();
  renderSettings();
  renderQueue();
}

// ---------- the status line ----------

// One line (#job, role=status) under the toolbar: job results, the copy-links result and small notes.
// Parts update in place so the queue's progress bar animates.
let fb = null;
let fbKind = '';
function showResult({ error = '', message = '', link = '', running = false, done, total, fresh = false } = {}) {
  const box = $('job');
  if (!error && !message) {
    box.replaceChildren();
    box.className = 'feedback';
    fbKind = '';
    return;
  }
  fb ||= {
    glyph: h('span', { class: 'fb-glyph' }),
    text: h('span', { class: 'fb-text' }),
    link: h('a', { class: 'fb-link', target: '_blank', rel: 'noopener', onclick: spotifyClick }, 'Open in Spotify', icon('arrowUpRight', 12)),
    bar: h('span', { class: 'progress', 'aria-hidden': 'true' }, h('i')),
  };
  const kind = running ? 'run' : error ? 'err' : 'ok';
  box.className = `feedback ${kind}`;
  const celebrate = kind === 'ok' && fresh && !reducedMotion();
  if (kind !== fbKind || celebrate) {
    fb.glyph.replaceChildren(kind === 'run' ? spinner() : kind === 'err' ? icon('warn', 16) : icon('checkCircle', 16, celebrate ? 'mark-in' : ''));
    fbKind = kind;
  }
  fb.text.textContent = error || message;
  fb.link.hidden = !link || Boolean(error);
  if (link) fb.link.href = link;
  const counting = running && total > 1 && done != null;
  fb.bar.hidden = !counting;
  if (counting) fb.bar.firstChild.style.setProperty('--p', String(Math.min(1, done / total)));
  if (!box.contains(fb.glyph)) box.replaceChildren(fb.glyph, fb.text, fb.link, fb.bar);
}

function renderJob(next) {
  const fresh = next && Date.now() - next.at < 120_000 ? next : null;
  const finished = wasRunning && fresh && !fresh.running && !fresh.error;
  const savedPlaylist = finished && fresh.action === 'save';
  job = fresh;
  wasRunning = Boolean(fresh?.running);
  // A job that failed because the no-setup login cannot work any more offers the official setup.
  if (job?.error && job.needsSetup && setupMessage !== job.error) {
    setupMessage = job.error;
    renderSettings();
  }
  showResult({ ...(job || {}), fresh: finished });
  renderToolbar();
  // A keyboard shortcut that could not pick a Spotify device: ask now and run it again.
  if (job?.needsDevice) resumeDeviceJob(job, (action, uris) => run(action, {}, uris));
  if (savedPlaylist) loadLinks().then(loadPlaylists); // the new playlist joins the pop-up, and the Mix is linked to it
}

// ---------- actions ----------

// More than one Spotify player and none chosen: ask which, remember it, and run the action again (feature 8).
async function run(action, extra = {}, uris = selectedUris(), retried = false) {
  if (!uris.length) return;
  try {
    const res = await bg('run', { action, uris, ...extra });
    if (res?.job) renderJob(res.job);
  } catch (err) {
    if (err.needsDevice && !retried) {
      const device = await chooseDevice(err.devices);
      if (!device) return;
      try {
        await bg('setDevice', { id: device.id, name: device.name });
      } catch (e) {
        note(e.message, true);
        return;
      }
      return run(action, extra, uris, true);
    }
    if (err.needsLogin || err.needsSetup) await onError(err);
    else renderJob({ error: err.message, running: false, at: Date.now() });
  }
}

async function createPlaylist() {
  if (creating || job?.running) return;
  creating = true;
  try {
    await startSave();
  } finally {
    creating = false;
  }
}

function startSave() {
  const sources = queue.sources.map(s => s.title).join(', ');
  const sel = $('target');
  const name = $('playlistName').value.trim() || 'From YouTube';
  return run('save', {
    target: sel.value,
    name,
    // What the result message names: the new playlist's name, or the chosen playlist's own name.
    playlistName: sel.value === 'new' ? name : sel.selectedOption?.name || '',
    isPublic: $('isPublic').checked,
    description: (sources ? `Imported from YouTube: ${sources}` : 'Made with Dhaara').slice(0, 300),
    ...(sourceList() && { listId: sourceList() }),
  });
}

async function copyLinks() {
  const ids = selectedTracks().map(m => m.id);
  if (!ids.length) return;
  try {
    await navigator.clipboard.writeText(ids.map(id => `https://open.spotify.com/track/${id}`).join('\n'));
    note(`Copied ${ids.length} ${ids.length === 1 ? 'link' : 'links'}. Paste them into a playlist in the Spotify desktop app with ${pasteKey()}.`);
  } catch (err) {
    note(`Couldn’t copy: ${err.message}`, true);
  }
}

async function addManual(a) {
  const key = `sp:${a.id}`;
  if (queue.tracks.some(t => t.key === key || view(t.key).match?.id === a.id)) return note('That song is already in the list.', true);
  try {
    await savePick(key, a);
  } catch (err) {
    return note(err.message, true);
  }
  views[key] = { status: 'picked', match: a };
  queue.tracks.push({ key, site: 'manual', title: a.name, channel: a.artists.join(', '), durationSec: a.durationSec, checked: true });
  if (!queue.playlistName) queue.playlistName = 'My Mix';
  renderQueue();
  save();
  note(`Added ${displayTitle(a.name)}.`);
}

let addTimer;
let addSeq = 0;
async function searchToAdd() {
  clearTimeout(addTimer);
  const q = $('addQuery').value.trim();
  if (!q || !status.user) return;
  const mine = ++addSeq;
  $('addResults').replaceChildren(h('div', { class: 'alts-note' }, spinner(), 'Searching Spotify…'));
  try {
    const { tracks = [] } = await bg('search', { q });
    if (mine !== addSeq) return;
    $('addResults').replaceChildren(...(tracks.length
      ? tracks.map(a => resultRow(a, { onPick: addManual, action: 'Add' }))
      : [h('div', { class: 'alts-note' }, 'Nothing found. Try other words.')]));
  } catch (err) {
    if (mine !== addSeq) return;
    if (err.needsLogin || err.needsSetup) onError(err);
    else $('addResults').replaceChildren(h('div', { class: 'alts-note err' }, err.message));
  }
}

function toggleAdd() {
  const box = $('addBox');
  const show = box.hidden;
  box.hidden = !show;
  $('addToggle').setAttribute('aria-expanded', String(show));
  if (show) {
    expand(box);
    $('addQuery').focus();
  }
}

// Asks first, in a row under the list's header (not window.confirm).
function askClear() {
  showConfirm($('clearConfirm'), {
    text: `Clear all ${songs(queue.tracks.length)} from this list?`,
    detail: 'Your Spotify playlists are not affected.',
    action: 'Clear List',
    onConfirm: clearList,
  });
}

async function clearList() {
  clearTimeout(saveTimer);
  queue = emptyQueue();
  open.clear();
  await chrome.storage.local.remove(QUEUE_KEY);
  if (!job?.running) renderJob(null);
  renderQueue();
}

// A list the popup just sent: keep what is on screen, add the new songs and ask for their matches.
async function onPopupQueue(next) {
  queue = normalizeQueue(next);
  const keys = new Set(queue.tracks.map(t => t.key));
  for (const k of open) if (!keys.has(k)) open.delete(k);
  Object.assign(views, await readMatches([...keys]));
  if (!job?.running) renderJob(null);
  targetTouched = false;
  applyLinkTarget();
  renderQueue();
  requestMatching();
}

async function loadLinks() {
  links = await readLinks();
  renderToolbar();
}

let statusTimer;
function scheduleStatusRefresh() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(refreshStatus, 250);
}

// ---------- start ----------

async function init() {
  onToast((msg, error) => note(msg, error));
  popupMenu($('target'), { options: [{ value: 'new', label: 'New Playlist' }], value: 'new' });
  try {
    if (await navigator.brave?.isBrave?.()) shortcutsUrl = 'brave://extensions/shortcuts';
  } catch {
    // Not Brave.
  }
  $('shortcutsUrl').textContent = shortcutsUrl;
  $('copyShortcutsUrl').onclick = async () => {
    await navigator.clipboard.writeText(shortcutsUrl);
    note('Address copied. Paste it into the address bar of a new tab.');
  };
  // Coming back from the browser's shortcuts page: show what was changed there.
  window.addEventListener('focus', () => { if (!$('shortcutsBox').hidden) renderShortcuts(); });
  $('redirect').textContent = sp.redirectUri();
  $('copyRedirect').onclick = async () => {
    await navigator.clipboard.writeText(sp.redirectUri());
    note('Redirect URI copied.');
  };
  // Where songs open (decision 18) and whether YouTube and Spotify pause each other (decision 19).
  popupMenu($('openIn'), {
    options: [{ value: 'auto', label: 'Automatic' }, { value: 'app', label: 'Spotify App' }, { value: 'web', label: 'Web Player' }],
    value: await readOpenIn(),
    onChange: value => chrome.storage.local.set({ [OPEN_KEY]: value }),
  });
  $('exclusive').checked = (await chrome.storage.local.get(EXCLUSIVE_KEY))[EXCLUSIVE_KEY] !== false;
  $('exclusive').onchange = e => chrome.storage.local.set({ [EXCLUSIVE_KEY]: e.target.checked });
  $('setupBtn').onclick = startSetup;
  $('webBtn').onclick = () => useWebTab($('webBtn'));
  $('connectBtn').onclick = () => (isWeb() || (status.webProblem && !status.hasClientId && !status.user) ? useWebTab($('connectBtn')) : connect());
  $('loginSetupBtn').onclick = startSetup;
  $('modeBtn').onclick = switchMode;
  $('disconnectBtn').onclick = askDisconnect;
  $('clientToggle').onclick = toggleManual;
  $('saveClient').onclick = saveClientId;
  $('target').onchange = () => { targetTouched = true; onTargetChange(); };
  $('playlistName').oninput = e => {
    queue.playlistName = e.target.value;
    $('listTitle').textContent = e.target.value || queue.sources[0]?.title || 'My List';
    save();
  };
  $('matchBtn').onclick = rematchAll;
  $('clearBtn').onclick = askClear;
  $('copyBtn').onclick = copyLinks;
  $('copyBtn').title = `Copy the links of the ticked songs, one per line. Paste them into a playlist in the Spotify desktop app with ${pasteKey()}.`;
  $('queueBtn').onclick = () => run('queue');
  $('playBtn').onclick = () => run('play');
  $('createBtn').onclick = createPlaylist;
  $('tickAll').onchange = tickAll;
  $('addToggle').onclick = toggleAdd;
  $('addQuery').addEventListener('input', () => { clearTimeout(addTimer); addTimer = setTimeout(searchToAdd, 300); });
  $('addQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchToAdd(); });

  // The toolbar takes the material, and the page title moves into it, once the page scrolls.
  const brand = $('tbTitle').innerHTML;
  let titled = false;
  const onScroll = () => {
    $('top').classList.toggle('scrolled', window.scrollY > 0);
    const head = $('listTitle');
    const past = !$('controls').hidden && head.getBoundingClientRect().bottom < $('top').getBoundingClientRect().bottom;
    if (past === titled) return;
    titled = past;
    if (past) $('tbTitle').replaceChildren(h('span', {}, head.textContent));
    else $('tbTitle').innerHTML = brand;
    if (!reducedMotion()) $('tbTitle').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // The popup's account button points an already open tab at #settings.
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#settings') return;
    settingsOpen = true;
    renderSettings();
    renderAccount();
    $('settings').scrollIntoView({ block: 'nearest' });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes[QUEUE_KEY]?.newValue?.origin === 'popup') onPopupQueue(changes[QUEUE_KEY].newValue);
      if (changes[CLIENT_KEY] || changes[TOKEN_KEY]) scheduleStatusRefresh();
      if (changes[LINKS_KEY]) {
        links = changes[LINKS_KEY].newValue || {};
        renderToolbar();
      }
    } else if (area === 'session') {
      if (changes[JOB_KEY]) renderJob(changes[JOB_KEY].newValue);
      if (changes[LOGIN_KEY]?.newValue) relogin(changes[LOGIN_KEY].newValue);
    }
  });

  watchMatches(async keys => {
    const have = new Set(queue.tracks.map(t => t.key));
    const mine = keys.filter(k => have.has(k));
    if (!mine.length) return;
    const before = Object.fromEntries(mine.map(k => [k, view(k).status]));
    Object.assign(views, await readMatches(mine));
    for (const k of mine) {
      if ((before[k] === 'pending' || before[k] === 'matching') && LEVELS[view(k).status] > 0) justMatched.add(views[k]);
      updateRow(k);
      justMatched.delete(views[k]);
    }
    renderStats();
    renderToolbar();
    renderTickAll();
  });

  settingsOpen = location.hash === '#settings';
  status = await bg('status').catch(() => ({ user: null, hasClientId: false }));
  if (!status.user) loginMessage = (await chrome.storage.session.get(LOGIN_KEY))[LOGIN_KEY] || '';
  const raw = (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY];
  await migrateLegacy(raw);
  queue = normalizeQueue(raw);
  views = await readMatches(queue.tracks.map(t => t.key));
  links = await readLinks();
  applyLinkTarget();
  renderAll();
  renderJob((await chrome.storage.session.get(JOB_KEY))[JOB_KEY]);
  if (status.user) {
    loadPlaylists();
    requestMatching();
  }
}

init();

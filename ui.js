// Small DOM helpers shared by the popup and the full view: elements, icons, the match glyph,
// the song search panel, and the motion helpers (docs/apple-redesign.md 3.6 and 3.7).
import { parseItem, rescore, confidence } from './match.js';
import { bg, JOB_KEY, OPEN_KEY, DESKTOP_KEY } from './store.js';

export const $ = id => document.getElementById(id);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (typeof v === 'boolean') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

export const fmt = s => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
export const songs = n => `${n} ${n === 1 ? 'song' : 'songs'}`;
// Title-style, for buttons: "Play 7 Songs".
export const Songs = n => `${n} ${n === 1 ? 'Song' : 'Songs'}`;

// The paste shortcut for this computer, for hints that tell the user to paste copied links.
export const pasteKey = () => (/mac/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? '⌘V' : 'Ctrl+V');

// ---------- song names ----------

// Film songs on Spotify carry the film in the name: `Tum Se Tum Tak (From "Saiyaara")`.
// Shown without it, because the album line already names the film (decision 14). Display only.
const FROM_TAIL = /\s*(?:[([]\s*From\s+["“”'‘’]?.+?["“”'‘’]?\s*[)\]]|[-–—]\s*From\s+["“”'‘’].+?["“”'‘’])\s*$/i;
export const displayTitle = name => (name || '').replace(FROM_TAIL, '').trim() || name || '';

const squash = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The album, when it says something the title does not (a single named after its song does not).
export function albumLine(m) {
  const album = (m?.album || '').trim();
  if (!album) return '';
  return squash(album) === squash(displayTitle(m.name)) || squash(album) === squash(m.name) ? '' : album;
}

// "Arijit Singh · Saiyaara": artists, then the film or album when it adds something.
export const subText = m => [(m.artists || []).join(', '), albumLine(m)].filter(Boolean).join(' · ');

// ---------- icons: our own outline set, 20 px grid, 1.5 px stroke, round ends ----------

// Each icon is a list of [path, 'f' | 's']: filled or stroked.
const PATHS = {
  play: [['M6.6 4.3v11.4c0 .5.5.8.9.5l9-5.7a.6.6 0 0 0 0-1l-9-5.7a.6.6 0 0 0-.9.5z', 'f']],
  pause: [['M6.4 4.4h2.2c.3 0 .5.2.5.5v10.2c0 .3-.2.5-.5.5H6.4a.5.5 0 0 1-.5-.5V4.9c0-.3.2-.5.5-.5zM11.4 4.4h2.2c.3 0 .5.2.5.5v10.2c0 .3-.2.5-.5.5h-2.2a.5.5 0 0 1-.5-.5V4.9c0-.3.2-.5.5-.5z', 'f']],
  queue: [['M3 5h11M3 10h11M3 15h6', 's'], ['M12.4 12.2v5.6l4.6-2.8z', 'f']],
  heart: [['M10 16.6S3.2 12.6 3.2 7.9c0-2 1.6-3.7 3.6-3.7 1.4 0 2.6.8 3.2 1.9.6-1.1 1.8-1.9 3.2-1.9 2 0 3.6 1.7 3.6 3.7 0 4.7-6.8 8.7-6.8 8.7z', 's']],
  heartFill: [['M10 16.6S3.2 12.6 3.2 7.9c0-2 1.6-3.7 3.6-3.7 1.4 0 2.6.8 3.2 1.9.6-1.1 1.8-1.9 3.2-1.9 2 0 3.6 1.7 3.6 3.7 0 4.7-6.8 8.7-6.8 8.7z', 'f']],
  plus: [['M10 4.5v11M4.5 10h11', 's']],
  swap: [['M4 7h11.5M12.5 4l3 3-3 3M16 13H4.5M7.5 10l-3 3 3 3', 's']],
  search: [['M8.8 14.1a5.3 5.3 0 1 0 0-10.6 5.3 5.3 0 0 0 0 10.6zM12.7 12.7 16.5 16.5', 's']],
  chevronDown: [['M5.5 8l4.5 4.5L14.5 8', 's']],
  close: [['M5.5 5.5l9 9M14.5 5.5l-9 9', 's']],
  expand: [['M11.5 3.5h5v5M16.5 3.5 11.2 8.8M8.5 16.5h-5v-5M3.5 16.5l5.3-5.3', 's']],
  arrowUpRight: [['M6.5 13.5l7-7M8 6.5h5.5V12', 's']],
  check: [['M4.5 10.5l3.6 3.6 7.4-8.2', 's']],
  checkCircle: [['M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z', 's'], ['M6.8 10.3l2.2 2.2 4.3-4.7', 's']],
  warn: [['M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 6.3v4.6M10 13.6v.1', 's']],
  speaker: [['M3.5 8v4h2.8L10 15.2V4.8L6.3 8z', 's'], ['M13 7.6a3.3 3.3 0 0 1 0 4.8M15.3 5.4a6.4 6.4 0 0 1 0 9.2', 's']],
  note: [['M8 14.5V5l8-1.5V13M8 14.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 's']],
  video: [['M3 5.8c0-.9.7-1.6 1.6-1.6h10.8c.9 0 1.6.7 1.6 1.6v8.4c0 .9-.7 1.6-1.6 1.6H4.6c-.9 0-1.6-.7-1.6-1.6z', 's'], ['M8.4 7.4v5.2l4.2-2.6z', 'f']],
  reload: [['M15.6 10.2a5.6 5.6 0 1 1-1.7-4.1M16 3.6v3.2h-3.2', 's']],
  chevronUpDown: [['M6.5 8 10 4.5 13.5 8M6.5 12 10 15.5 13.5 12', 's']],
  computer: [['M4.5 5.6c0-.6.4-1 1-1h9c.6 0 1 .4 1 1v6.4c0 .6-.4 1-1 1h-9c-.6 0-1-.4-1-1z', 's'], ['M3 15.4h14', 's']],
  phone: [['M7.2 3.5h5.6c.6 0 1 .4 1 1v11c0 .6-.4 1-1 1H7.2c-.6 0-1-.4-1-1v-11c0-.6.4-1 1-1z', 's'], ['M9.2 14.3h1.6', 's']],
};

export function icon(name, size = 16, cls = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', `i${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, kind] of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (kind === 'f') {
      p.setAttribute('fill', 'currentColor');
    } else {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('pathLength', '1'); // so a success mark can draw itself in (styles.css .mark-in)
    }
    svg.append(p);
  }
  return svg;
}

export const spinner = (label = '') => h('span', { class: 'spinner', role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true' });

// The full view routes small notes to its status line; toast() is kept for that.
let toastHandler = null;
export const onToast = fn => { toastHandler = fn; };
export function toast(msg, error = false) {
  if (toastHandler) toastHandler(msg, error);
}

// ---------- Open in Spotify: the app or the web player (decision 18) ----------

const DESKTOP_FRESH_MS = 14 * 24 * 60 * 60 * 1000;   // the desktop app counts as installed for 14 days after it was last seen
const SPOTIFY_PAGE = /^https:\/\/open\.spotify\.com\/(track|playlist)\/([A-Za-z0-9]{22})(?:[/?#]|$)/;

// Where "Open in Spotify" goes: 'auto' (default), 'app' or 'web'.
export async function readOpenIn() {
  const mode = (await chrome.storage.local.get(OPEN_KEY))[OPEN_KEY];
  return mode === 'app' || mode === 'web' ? mode : 'auto';
}

// The one place that opens a Spotify song or playlist. 'app', or 'auto' when Spotify's device list showed
// the desktop app in the last 14 days (the background notes that), opens spotify:<kind>:<id>; anything
// else opens the web page in a new tab. A browser cannot tell whether an app is installed, hence the
// setting. The first spotify: link makes the browser ask "Open Spotify?": Always Allow stops that.
// The link is followed as an ordinary click on a link (the same way a web page's "open in app" button
// works): no tab is created, so none is left blank, and the browser remembers its answer per origin.
export async function openInSpotify(url) {
  const page = SPOTIFY_PAGE.exec(url || '');
  const got = await chrome.storage.local.get([OPEN_KEY, DESKTOP_KEY]);
  const mode = got[OPEN_KEY] === 'app' || got[OPEN_KEY] === 'web' ? got[OPEN_KEY] : 'auto';
  const seen = Number(got[DESKTOP_KEY]) || 0;
  const useApp = mode === 'app' || (mode === 'auto' && Date.now() - seen < DESKTOP_FRESH_MS);
  if (useApp && page) {
    const a = h('a', { href: `spotify:${page[1]}:${page[2]}`, target: '_self', rel: 'noopener' });
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    return;
  }
  await chrome.tabs.create({ url });
}

// onclick for any anchor that points at a Spotify page (its href is the https URL, so a right click, copy
// or middle click still work). A plain click goes through openInSpotify.
export function spotifyClick(e) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openInSpotify(e.currentTarget.href).catch(() => {});
}

// ---------- artwork ----------

export function art(m, cls = 'art') {
  return m?.image ? h('img', { class: cls, src: m.image, alt: '', decoding: 'async' }) : h('div', { class: `${cls} ph` }, icon('note', 16));
}

// Cover art that opens the song on Spotify (decision 17: every Spotify song links back).
export function artLink(m, { cls = 'art', tabbable = true } = {}) {
  return h('a', {
    class: 'art-link', href: m.url, target: '_blank', rel: 'noopener', onclick: spotifyClick,
    title: `Open “${displayTitle(m.name)}” in Spotify`, 'aria-label': `Open ${displayTitle(m.name)} in Spotify`,
    tabindex: tabbable ? null : '-1',
  }, art(m, cls));
}

export const openLink = (m, text = 'Open in Spotify') => h('a', {
  class: 'open-link', href: m.url, target: '_blank', rel: 'noopener', onclick: spotifyClick, 'aria-label': `Open ${displayTitle(m.name)} in Spotify`,
}, text, icon('arrowUpRight', 12));

// The full view's Spotify cell: art and title both open the song on Spotify.
export function trackCard(m) {
  return h('div', { class: 'card-track' },
    artLink(m, { tabbable: false }),
    h('div', { class: 'meta' },
      h('a', { class: 'title', href: m.url, target: '_blank', rel: 'noopener', onclick: spotifyClick, title: `Open “${displayTitle(m.name)}” in Spotify` }, displayTitle(m.name)),
      h('div', { class: 'sub', title: subText(m) }, subText(m))));
}

// ---------- match strength ----------

export const BADGES = { high: 'Sure', check: 'Check', low: 'Unsure', picked: 'Picked', none: 'Not found', error: 'Error' };

export const FIT_WORDS = {
  high: 'Sure match', picked: 'Picked by you', check: 'Check this match', low: 'Unsure match',
  none: 'Not found on Spotify', error: 'Couldn’t search Spotify', pending: 'Waiting…', matching: 'Searching Spotify…',
};
export const LEVELS = { high: 3, picked: 3, check: 2, low: 1, none: 0, error: 0 };
export const isDoubtful = s => s === 'check' || s === 'low';

// Three bars like a signal meter: how sure the match is. A song being searched right now shows a
// spinner instead; one waiting its turn shows empty bars. animate: the bars grow in once, on the
// render where its search has just finished.
export function signal(v, { word = FIT_WORDS[v.status] || '', animate = false } = {}) {
  if (v.status === 'matching') return spinner(word);
  const level = LEVELS[v.status] ?? 0;
  const cls = `signal s${level}${isDoubtful(v.status) ? ' warn' : ''}${animate ? ' fill-in' : ''}`;
  return h('span', { class: cls, title: word, role: 'img', 'aria-label': word }, h('i'), h('i'), h('i'));
}
export const meter = signal;

// ---------- search for a different song ----------

// One result: the art opens the song on Spotify, the rest of the row picks it (or adds it).
export function resultRow(a, { current = false, onPick, action = 'Use' } = {}) {
  const score = a.score != null && a.score >= 0.4 ? signal({ status: confidence(a.score) }) : h('span');
  return h('div', { class: `alt${current ? ' sel' : ''}`, role: 'listitem' },
    artLink(a, { tabbable: false }),
    h('button', {
      class: 'alt-pick', 'aria-pressed': current ? 'true' : null,
      'aria-label': `${action} ${displayTitle(a.name)} by ${(a.artists || []).join(', ')}`,
      onclick: () => onPick(a),
    },
    h('span', { class: 'alt-text' }, h('span', { class: 'title' }, displayTitle(a.name)), h('span', { class: 'sub' }, subText(a))),
    action === 'Add' ? h('span', { class: 'alt-add' }, 'Add') : score,
    h('span', { class: 'alt-dur' }, fmt(a.durationSec)),
    h('span', { class: 'alt-mark' }, current ? icon('check', 14) : null)));
}

// A search field that searches as you type, plus its results. item is the YouTube song, v its match.
// Searches go through the background worker, so they work in both sign-in modes.
export function changePanel(item, v, onPick) {
  const parsed = parseItem(item);
  const guess = `${parsed.songish} ${parsed.artists[0] || ''}`.trim();
  const input = h('input', { type: 'search', value: guess || item.title, placeholder: 'Search Spotify', 'aria-label': 'Search Spotify', spellcheck: 'false', autocomplete: 'off' });
  const results = h('div', { class: 'alts', role: 'list', 'aria-label': 'Spotify results', 'aria-busy': 'false' });
  const show = list => results.replaceChildren(...(list.length
    ? list.map(a => resultRow(a, { current: v.match?.id === a.id, onPick }))
    : [h('div', { class: 'alts-note' }, 'Nothing found. Try other words.')]));
  let timer;
  let seq = 0;
  const search = async () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return;
    const mine = ++seq;
    results.setAttribute('aria-busy', 'true');
    results.replaceChildren(h('div', { class: 'alts-note' }, spinner(), 'Searching Spotify…'));
    try {
      const { tracks = [] } = await bg('search', { q });
      if (mine === seq) show(item.site === 'manual' ? tracks : rescore(item, tracks));
    } catch (err) {
      if (mine === seq) results.replaceChildren(h('div', { class: 'alts-note err' }, err.message));
    } finally {
      if (mine === seq) results.setAttribute('aria-busy', 'false');
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 300); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
  if (v.alts?.length) show(v.alts);
  else if (item.title) search();
  return h('div', { class: 'change' }, h('div', { class: 'search' }, icon('search', 14), input), results);
}

// ---------- motion (docs/apple-redesign.md 3.7) ----------

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reduce.matches;
const springs = CSS.supports('transition-timing-function', 'linear(0, 1)');
const EASE_SMOOTH = springs
  ? 'linear(0, 0.086, 0.254, 0.428, 0.579, 0.698, 0.788, 0.853, 0.9, 0.932, 0.955, 0.97, 0.98, 0.987, 0.991, 0.994, 0.996, 0.998, 0.998, 0.999, 1)'
  : 'cubic-bezier(.32,.72,0,1)';

// A disclosure opening: height from 0 to its natural size. Nothing above it moves.
export function expand(el, duration = 250) {
  if (!el || reducedMotion()) return;
  const end = el.getBoundingClientRect().height;
  el.style.overflow = 'hidden';
  el.animate([{ height: '0px', opacity: 0 }, { height: `${end}px`, opacity: 1 }], { duration, easing: EASE_SMOOTH })
    .finished.catch(() => {}).finally(() => { el.style.overflow = ''; });
}

// A disclosure closing. Resolves when it is done, so the caller can then remove it.
export function collapse(el, duration = 200) {
  if (!el || reducedMotion()) return Promise.resolve();
  el.style.overflow = 'hidden';
  return el.animate([{ height: `${el.getBoundingClientRect().height}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration, easing: EASE_SMOOTH, fill: 'forwards' })
    .finished.catch(() => {});
}

// New rows settling in, 30 ms apart, at most 10 steps. Transform and opacity only.
export function stagger(els, max = 10) {
  els.forEach((el, i) => {
    el.style.setProperty('--i', Math.min(i, max));
    el.classList.add('settle');
    el.addEventListener('animationend', () => { el.classList.remove('settle'); el.style.removeProperty('--i'); }, { once: true });
  });
}

// Plays a CSS animation class once, even if it ran before.
export function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

// A same-document View Transition around a DOM update, when the browser has one.
// A transition that is skipped (the popup was hidden, or another one started) rejects its promises with
// "InvalidStateError: Transition was aborted": all three are caught here, and the update always runs once.
export function withTransition(update) {
  if (!document.startViewTransition || document.visibilityState !== 'visible') return update();
  let ran = false;
  const once = () => {
    if (ran) return;
    ran = true;
    return update();
  };
  try {
    const transition = document.startViewTransition(once);
    transition.ready?.catch(() => {});
    transition.finished?.catch(() => {});
    transition.updateCallbackDone?.catch(() => {});
  } catch {
    once();
  }
}

// ---------- pop-up button and menu ----------

// A macOS-style pop-up button with its own floating menu, in place of a native <select> (whose menu
// opens misaligned over a styled box). `btn` is a <button> that is turned into the pop-up button:
// its label is the chosen option plus an up/down chevron. It then has
//   .value                 get / set the chosen option's value (setting does not fire change)
//   .selectedOption        the chosen option object, or null
//   .options               the current options
//   .setOptions(opts, v)   replace the options, keeping v (or the current value, or the first) chosen
// and fires a 'change' event (and onChange(value, option)) when the user picks a different option.
// An option is { value, label, detail?, separatorBefore?, ...anything else the caller wants back }.
// The menu is a listbox placed with position: fixed from the button's rect, inside the nearest dialog (or
// <body>), so no sheet or scroll container clips it and a screen reader reaches it. It opens below the
// button, or above when there is no room, and follows the button while it moves.
let menuCount = 0;

export function popupMenu(btn, { options = [], value, onChange } = {}) {
  const uid = ++menuCount;
  let opts = [];
  let current = '';
  let list = null;      // the open menu
  let items = [];
  let active = -1;
  let typed = '';
  let typedAt = 0;
  let host = null;      // where the open menu was put
  let probe = null;     // marks the origin of position: fixed inside that host
  let raf = 0;

  const label = h('span', { class: 'menu-label' });
  btn.classList.add('menu-btn');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.replaceChildren(label, icon('chevronUpDown', 14));

  const selected = () => opts.find(o => o.value === current) || null;
  const paint = () => { label.textContent = selected()?.label ?? ''; };

  function setActive(i, scroll = false) {
    if (i < 0 || i >= items.length) return;
    active = i;
    items.forEach((el, k) => el.classList.toggle('active', k === i));
    list.setAttribute('aria-activedescendant', items[i].id);
    if (scroll) items[i].scrollIntoView({ block: 'nearest' });
  }

  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt > 700 ? ch : typed + ch;
    typedAt = now;
    const from = typed.length === 1 ? active + 1 : active;
    for (let k = 0; k < opts.length; k++) {
      const i = (from + k) % opts.length;
      if (opts[i].label.toLowerCase().startsWith(typed.toLowerCase())) return setActive(i, true);
    }
  }

  function onKey(e) {
    const last = opts.length - 1;
    if (e.key === 'Tab') return close(true);   // not stopped: Tab then leaves the button as usual
    if (e.key === 'ArrowDown') setActive(Math.min(last, active + 1), true);
    else if (e.key === 'ArrowUp') setActive(Math.max(0, active - 1), true);
    else if (e.key === 'Home') setActive(0, true);
    else if (e.key === 'End') setActive(last, true);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') close(true);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const outside = e => { if (list && !list.contains(e.target) && !btn.contains(e.target)) close(false); };
  const away = () => close(false);

  // Where the menu goes: below the button, or above it when the room below is too small. Done again
  // while the button is still moving (the Save sheet slides in for about 350 ms), and on resize and scroll.
  // The menu lives inside the nearest dialog, so a screen reader that treats the dialog as modal still
  // reaches it. That dialog may be transformed (the sheet is), which makes it the containing block of
  // position: fixed; `probe` is a zero-size fixed element that tells where that block's origin is.
  function place() {
    if (!list?.isConnected) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;
    const margin = 8;
    list.style.minWidth = `${Math.round(r.width)}px`;
    list.style.maxWidth = `${Math.max(r.width, vw - 2 * margin)}px`;
    list.style.maxHeight = '';                       // measured at the stylesheet's own limit
    const natural = Math.min(list.offsetHeight, 320);
    const below = vh - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const up = natural > below && above > below;
    list.style.maxHeight = `${Math.max(96, Math.min(320, up ? above : below))}px`;
    const height = list.offsetHeight;
    const top = up ? Math.max(margin, r.top - gap - height) : r.bottom + gap;
    const left = Math.max(margin, Math.min(r.left, vw - list.offsetWidth - margin));
    const origin = probe.getBoundingClientRect();
    list.style.top = `${top - origin.top}px`;
    list.style.left = `${left - origin.left}px`;
    list.style.setProperty('--oy', up ? '100%' : '0');
  }

  // Places the menu on every animation frame until the button has stopped moving.
  function follow() {
    cancelAnimationFrame(raf);
    let last = '';
    let still = 0;
    const tick = () => {
      if (!list) return;
      const r = btn.getBoundingClientRect();
      const key = `${r.left}|${r.top}|${r.width}|${r.height}|${window.innerWidth}|${window.innerHeight}`;
      if (key === last) still++;
      else {
        still = 0;
        last = key;
        place();
      }
      if (still < 8) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  const scrolled = e => {
    if (!list || list.contains(e.target)) return;
    const r = btn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) close(false);   // the button scrolled out of view
    else follow();
  };

  function open() {
    if (list || btn.disabled || !opts.length) return;
    list = h('div', {
      class: 'menu', id: `menu-${uid}`, role: 'listbox', tabindex: '-1',
      'aria-label': btn.getAttribute('aria-label') || btn.labels?.[0]?.textContent?.trim() || 'Choose',
    });
    opts.forEach((o, i) => {
      if (o.separatorBefore && i) list.append(h('div', { class: 'menu-sep', role: 'presentation' }));
      list.append(h('div', { class: 'menu-item', role: 'option', id: `menu-${uid}-${i}`, 'aria-selected': o.value === current ? 'true' : 'false', 'data-i': String(i) },
        h('span', { class: 'menu-check', 'aria-hidden': 'true' }, o.value === current ? icon('check', 14) : null),
        h('span', { class: 'menu-text' }, o.label),
        o.detail ? h('span', { class: 'menu-detail' }, o.detail) : null));
    });
    items = [...list.querySelectorAll('.menu-item')];

    list.style.visibility = 'hidden';
    host = btn.closest('[role="dialog"]') || document.body;
    probe = h('div', { 'aria-hidden': 'true' });
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none';
    host.append(probe, list);
    place();
    list.style.visibility = '';
    follow();

    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', list.id);
    list.addEventListener('keydown', onKey);
    list.addEventListener('pointermove', e => {
      const el = e.target.closest('.menu-item');
      if (el && Number(el.dataset.i) !== active) setActive(Number(el.dataset.i));
    });
    list.addEventListener('click', e => {
      const el = e.target.closest('.menu-item');
      if (el) choose(Number(el.dataset.i));
    });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scrolled, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', follow);
    setActive(Math.max(0, opts.findIndex(o => o.value === current)), true);
    list.focus({ preventScroll: true });
  }

  function close(refocus = true) {
    if (!list) return;
    const el = list;
    const hadFocus = el.contains(document.activeElement);
    list = null;
    cancelAnimationFrame(raf);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('scroll', scrolled, true);
    window.removeEventListener('blur', away);
    window.removeEventListener('resize', follow);
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-controls');
    // The old list stays for its fade-out; its ids go at once, so a menu opened again straight away is
    // the only one `aria-activedescendant` can point into.
    el.removeAttribute('id');
    el.removeAttribute('aria-activedescendant');
    el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('out');
    const gone = probe;
    probe = null;
    const remove = () => { el.remove(); gone?.remove(); };
    el.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 250);
    // Focus inside the list must not fall to <body> when the list goes away.
    if (refocus || hadFocus) btn.focus({ preventScroll: true });
  }

  function choose(i) {
    const o = opts[i];
    if (!o) return;
    const changed = o.value !== current;
    current = o.value;
    paint();
    close(true);
    if (changed) {
      onChange?.(current, o);
      btn.dispatchEvent(new Event('change'));
    }
  }

  function setOptions(next, keep = current) {
    close(false);
    opts = next.map(o => ({ ...o }));
    current = opts.some(o => o.value === keep) ? keep : opts[0]?.value ?? '';
    paint();
  }

  btn.addEventListener('click', () => (list ? close(true) : open()));
  btn.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    open();
  });
  Object.defineProperties(btn, {
    value: { get: () => current, set: v => { if (opts.some(o => o.value === v)) { current = v; paint(); } }, configurable: true },
    selectedOption: { get: selected, configurable: true },
    options: { get: () => opts, configurable: true },
  });
  btn.setOptions = setOptions;
  setOptions(options, value);
  return btn;
}

// ---------- device choice (feature 8) ----------

const deviceIcon = type => (/phone|tablet/i.test(type) ? 'phone' : /computer/i.test(type) ? 'computer' : /tv/i.test(type) ? 'video' : 'speaker');

// A sheet that asks which Spotify player to use. Resolves with { id, name, type }, or null when cancelled.
// Sheets look the same in the popup (slides up) and the full view (centred); see styles.css .sheet.
export function chooseDevice(devices) {
  return new Promise(resolve => {
    const back = document.activeElement;
    const inPopup = document.body.classList.contains('popup');
    const prevMin = document.body.style.minHeight;
    const titleId = `device-title-${++menuCount}`;
    let done = false;
    const scrim = h('div', { class: 'scrim' });
    const finish = device => {
      if (done) return;
      done = true;
      sheet.classList.remove('on');
      scrim.classList.remove('on');
      setTimeout(() => {
        sheet.remove();
        scrim.remove();
        if (inPopup) document.body.style.minHeight = prevMin;
      }, reducedMotion() ? 160 : 220);
      if (back?.isConnected) back.focus({ preventScroll: true });
      resolve(device);
    };
    const rows = devices.map(d => h('button', { class: 'device', onclick: () => finish(d) },
      h('span', { class: 'dev-icon' }, icon(deviceIcon(d.type), 18)),
      h('span', { class: 'dev-text' }, h('span', { class: 'title' }, d.name), d.type ? h('span', { class: 'sub' }, d.type) : null)));
    const sheet = h('section', { class: 'sheet device-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'sheet-head' },
        h('h2', { id: titleId }, 'Choose a Device'),
        h('button', { class: 'icon-btn', title: 'Close', 'aria-label': 'Close', onclick: () => finish(null) }, icon('close', 16))),
      h('p', { class: 'sheet-note' }, 'More than one Spotify player is available. Pick one and Dhaara remembers it.'),
      h('div', { class: 'devices' }, ...rows),
      h('div', { class: 'sheet-btns' }, h('button', { onclick: () => finish(null) }, 'Cancel')));
    scrim.onclick = () => finish(null);
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      } else if (e.key === 'Tab') {
        const stops = [...sheet.querySelectorAll('button')].filter(b => !b.disabled);
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.body.append(scrim, sheet);
    // The popup is only as tall as its content, so it must be tall enough for the sheet.
    if (inPopup) document.body.style.minHeight = `${Math.max(parseFloat(prevMin) || 0, sheet.offsetHeight + 72)}px`;
    void sheet.offsetWidth;
    scrim.classList.add('on');
    sheet.classList.add('on');
    rows[0]?.focus({ preventScroll: true });
  });
}

// A job that a keyboard shortcut started could not pick a device (several players, none chosen). The
// popup or full view that sees it asks now, remembers the answer and runs the same action again.
// run(action, uris) starts a job. Each such job is asked about once.
const askedJobs = new Set();
export async function resumeDeviceJob(job, run) {
  if (!job?.needsDevice || !job.viaShortcut || !job.retry || askedJobs.has(job.at)) return;
  askedJobs.add(job.at);
  const device = await chooseDevice(job.devices || []);
  const now = (await chrome.storage.session.get(JOB_KEY))[JOB_KEY];
  if (now?.at === job.at) await chrome.storage.session.set({ [JOB_KEY]: { ...now, needsDevice: false } });
  if (!device) return;
  await bg('setDevice', { id: device.id, name: device.name });
  run(job.retry.action, job.retry.uris);
}

// ---------- inline confirmation ----------

// A confirmation row in the app's own style, shown inside `slot` (an empty element) instead of
// window.confirm. Focus starts on Cancel; Escape cancels. Returns a function that closes it.
export function showConfirm(slot, { text, detail = '', action, onConfirm }) {
  const back = document.activeElement;
  const close = () => {
    slot.hidden = true;
    slot.replaceChildren();
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  const cancel = h('button', { class: 'small', onclick: close }, 'Cancel');
  const go = h('button', { class: 'small destructive', onclick: () => { slot.hidden = true; slot.replaceChildren(); onConfirm(); } }, action);
  slot.className = 'confirm';
  slot.setAttribute('role', 'group');
  slot.setAttribute('aria-label', text);
  slot.replaceChildren(
    h('div', { class: 'confirm-text' }, h('span', { class: 'q' }, text), detail ? h('span', { class: 'detail' }, detail) : null),
    cancel, go);
  slot.hidden = false;
  slot.onkeydown = e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  expand(slot);
  cancel.focus({ preventScroll: true });
  return close;
}

// ---------- linked playlists ----------

// "Linked to <playlist>, 3 new songs since you last saved": the playlist name links to it on Spotify.
export function linkLine(link, n) {
  return [
    'Linked to ',
    h('a', { href: `https://open.spotify.com/playlist/${link.playlistId}`, target: '_blank', rel: 'noopener', onclick: spotifyClick, title: 'Open the playlist in Spotify' }, link.name),
    `, ${n ? `${n} new ${n === 1 ? 'song' : 'songs'}` : 'no new songs'} since you last saved`,
  ];
}

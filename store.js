// Storage layout shared by the popup, the full view and the background worker.
// Match results are stored one key per song, so a write never rewrites a whole list:
//   yt2sp:m:<key>  written only by the background worker: { status, match, alts, error, at }
//   yt2sp:p:<key>  the Spotify track the user picked by hand; it wins over the match
// A key is yt:<videoId> or t:<title>|<channel>, so a pick made in one Mix applies in every other.

export const QUEUE_KEY = 'yt2sp:queue';      // local: the full view's list
export const JOB_KEY = 'yt2sp:job';          // session: the play/queue/save job that is running
export const CHECKS_KEY = 'yt2sp:checks';    // session: ticks the user changed in the popup
export const MORE_KEY = 'yt2sp:more';        // session: extra Mix songs fetched, per list id
export const LOGIN_KEY = 'yt2sp:login';      // session: why matching stopped (login needed)
export const MODE_KEY = 'yt2sp:mode';        // local: 'app' (official PKCE login) or 'web' (no-setup login), default 'app'
export const WEB_PROBLEM_KEY = 'yt2sp:webProblem'; // session: why the no-setup login last failed (a plain message)
export const LINKS_KEY = 'yt2sp:links';      // local: { [listId]: { playlistId, name, userId, mode, savedUris, savedAt } }, the playlist a Mix is saved to
export const DEVICE_KEY = 'yt2sp:device';    // local: { id, name }, the Spotify device the user chose for play and queue
export const OPEN_KEY = 'yt2sp:openIn';      // local: 'auto' (default), 'app' or 'web': where "Open in Spotify" goes (decision 18)
export const DESKTOP_KEY = 'yt2sp:desktopSeen'; // local: timestamp, the last time Spotify's device list showed the desktop app
export const EXCLUSIVE_KEY = 'yt2sp:exclusive'; // local: boolean (default true): when YouTube or Spotify starts, pause the other (decision 19)

export const matchKey = key => `yt2sp:m:${key}`;
export const pickKey = key => `yt2sp:p:${key}`;

export function trackKey(t) {
  return t.videoId ? `yt:${t.videoId}` : `t:${t.title}|${t.channel}`;
}

function view(m, pick) {
  if (pick) return { ...(m || {}), status: 'picked', match: pick };
  return m || { status: 'pending' };
}

export async function readMatches(keys) {
  const got = await chrome.storage.local.get(keys.flatMap(k => [matchKey(k), pickKey(k)]));
  return Object.fromEntries(keys.map(k => [k, view(got[matchKey(k)], got[pickKey(k)])]));
}

// Calls onChange(keys) with the songs whose match or pick changed.
export function watchMatches(onChange) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = Object.keys(changes).map(n => n.match(/^yt2sp:[mp]:(.*)$/)?.[1]).filter(Boolean);
    if (keys.length) onChange([...new Set(keys)]);
  });
}

export const savePick = (key, track) => chrome.storage.local.set({ [pickKey(key)]: track });

// ---------- linked playlists (decision 3) ----------
// A Mix that was saved to a new playlist is linked to it, so saving it again adds only the new songs.
// Saving only ever adds: YouTube keeps refilling a Mix, so songs are never removed from the playlist.

export async function readLinks() {
  return (await chrome.storage.local.get(LINKS_KEY))[LINKS_KEY] || {};
}

// The link for a list, only when it belongs to the Spotify account and sign-in mode in use now.
export function linkFor(links, listId, user, mode) {
  const link = listId ? links?.[listId] : null;
  return link && user && link.userId === user.id && link.mode === mode ? link : null;
}

// The songs among `uris` that this link has not saved before.
export function newSongs(link, uris) {
  const saved = new Set(link?.savedUris || []);
  return uris.filter(u => !saved.has(u));
}

// Only sure matches and hand picks start ticked; "check" and "unsure" wait for the user, so a
// doubtful song is never added silently (decision 5 in docs/decisions.md).
export function isTicked(v, override) {
  if (!v?.match) return false;
  return override ?? ['high', 'picked'].includes(v.status);
}

// Long work runs in the background worker so it survives the popup closing.
export async function bg(type, data = {}) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: `yt2sp:${type}`, ...data });
  } catch (err) {
    // The worker was stopped while it was still answering (a login that waits in its own tab can take
    // longer than a worker lives). What it was doing may well have finished: the caller checks the status.
    if (/message (port|channel) closed|Receiving end does not exist/i.test(err?.message || '')) {
      throw Object.assign(new Error('Dhaara’s background worker was stopped before it answered.'), { interrupted: true });
    }
    throw err;
  }
  if (res?.error) {
    const err = new Error(res.error);
    err.needsLogin = Boolean(res.needsLogin);
    // The no-setup login stopped working: the UI offers the official setup (decision 4).
    err.needsSetup = Boolean(res.needsSetup);
    // More than one Spotify player and none chosen yet: the UI shows a device choice and retries (feature 8).
    err.needsDevice = Boolean(res.needsDevice);
    err.devices = Array.isArray(res.devices) ? res.devices : [];
    throw err;
  }
  return res;
}

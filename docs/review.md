# Senior review: Dhaara 0.2.0

Reviewed 3 Nov 2026. I read the code as it stands, and I did not run it against a real Spotify account. Line numbers refer to the current files.

Severity: **P0** blocks use, **P1** likely bug or broken promise, **P2** minor or conditional.

**Totals:** 0 P0, 5 P1, 14 P2.

---

## P1

### 1. Setup saves the Client ID of whatever app page the user opens
- **Where:** `spotify-setup.js:134-141`, `background.js:495-511`
- **What happens:** while setup is active, any path matching `/dashboard/<32 hex>` is taken as the new Client ID. The extension saves it, ends setup and starts the login.
- **How it fails:**
  - Since Feb 2026, Spotify allows one Development-mode Client ID per developer.
  - A user who already has an app either cannot create a new one or clicks into an existing one from the list. Either way, that old app's ID is saved.
  - The old app does not have `https://<id>.chromiumapp.org/spotify` as a redirect URI, so the login fails with Spotify's `INVALID_CLIENT: Invalid redirect URI` page.
  - The user gets no hint about what went wrong.
  - The same happens if the user visits any other app page during the 30-minute window.
- **Fix:**
  - Accept an ID only after this tab has gone from `/dashboard/create` straight to `/dashboard/<id>`. Keep the "came from create" flag in the script.
  - Alternatively, open `/dashboard/<id>/settings` and check that the redirect URI is listed.
  - For an existing app, show "add this redirect URI to your app" with a Copy button, and do not log in until the URI is there.

### 2. The unofficial MAIN-world hook runs in every Spotify tab, for every user
- **Where:** `manifest.json:72-90`, `spotify-hook.js:21-24`, `spotify-hook.js:101-145`
- **What happens:**
  - `spotify-hook.js` (MAIN world) and `spotify-bridge.js` are static content scripts on `open.spotify.com/*`.
  - Every user gets Spotify's `fetch` and `XMLHttpRequest` wrapped and the session's `authorization` and `client-token` captured, including users who chose the official setup or never opted in.
  - The hook also sets a detectable `window.__yt2spHook`.
- **Promises this breaks:**
  - Decision 4 says the no-setup login is opt-in.
  - The README permissions table (line 121) says `open.spotify.com` is "No-setup login only".
  - PRIVACY talks about the tab session only "with the no-setup login".
- **Risk:** official-mode users carry the account risk of the unofficial path (Spotify can see the wrapper) without having chosen it.
- **Fix:**
  - Remove both scripts from the manifest.
  - Register them with `chrome.scripting.registerContentScripts` (`world: 'MAIN'` for the hook) when `setMode('web')` runs. Unregister them on a switch to `app` and on Disconnect.
  - Already-open Spotify tabs then need a reload; `findTab` already handles discarded tabs.

### 3. YouTube Music: "Play from here" plays the whole queue from the top
- **Where:**
  - `content.js:107-116`: queue rows always have `videoId: null`.
  - `content.js:153` and `content.js:156-162`: the current song carries the `v=` id.
  - `popup.js:42-45`, `popup.js:230-238`, `popup.js:348`
- **Why:** on `music.youtube.com`, queue rows get the key `t:<title>|<channel>` and the current song gets `yt:<videoId>`, so the two never match.
- **What the user sees:**
  - The playing song is searched twice: once for the card and once as its row.
  - The row never gets the "playing" mark.
  - In `playFromHere`, `findIndex` returns -1, so `after = list()`. Play on the card plays this song and then **every** ticked song in the queue, including the ones before it.
  - Decision 7 says "this song, then the ticked songs after it", so this breaks it on the site the README calls the best source.
- **Fix:**
  - In `fromMusicQueue`, read each row's video id (thumbnail URL or the row's play endpoint), or at least mark `ytmusic-player-queue-item[selected]` with the URL's `v`.
  - Failing that, match the current song to a row by normalised title and artist in `currentVideo`.

### 4. The Brave and normal-tab login fallback is lost when the service worker sleeps
- **Where:** `spotify.js:56-92` (`tabFlow`); the only top-level listeners are at `background.js:434` and `background.js:630-643`.
- **What happens:**
  - When `launchWebAuthFlow` fails, the login opens a normal tab.
  - It waits for the redirect with a `chrome.tabs.onUpdated` listener added inside a Promise in the service worker.
  - The PKCE verifier and `state` live only in that closure.
- **How it fails:**
  - While the user types a password or waits for a 2FA mail, no extension events fire.
  - After about 30 s idle the worker is stopped, and the listener, verifier and state go with it.
  - The redirect to `chromiumapp.org?code=…` is then never seen. The tab sits on an error page, and the full view's `bg('connect')` ends with "message port closed".
  - The popup has already closed when the tab opened.
  - There is also no timeout or cleanup if the tab goes somewhere else.
- **Fix:**
  - Keep `{ verifier, state, clientId, tabId }` in `chrome.storage.session`.
  - Register a **top-level** `chrome.tabs.onUpdated` listener that finishes the exchange whenever a tab reaches `redirectUri()`.
  - Have the UI watch `TOKEN_KEY` (the full view already does) instead of waiting on the message reply.

### 5. A changed web-player search shape becomes "Not found" for a week, in both modes
- **Where:** `spotify-web.js:548-549`, `spotify-web.js:517-520`, `background.js:92-93`, `background.js:117-119`
- **Why it is silent:**
  - `do_searchTracks` turns a missing `tracksV2`, or rows that `toTrack` cannot read, into `[]`.
  - It raises no `bad-shape` error, so the "offer the official setup" path never runs.
- **What the user sees:**
  - Every song is stored as `status: 'none'`.
  - `isDone` treats a `none` result as final for 7 days, and the cache is not tied to a provider.
  - After switching to the official login, the popup still shows "Not found on Spotify" for every song cached under web mode.
  - The popup has no re-match button; only the full view's "Find Matches Again" clears it.
- **Fix:**
  - Throw `setupError('bad-shape')` when `searchV2.tracksV2` is missing, or when `items` is non-empty but every row maps to `null`.
  - Store the provider in each match record and treat a `none` from another provider as not done. Alternatively, drop `none` records in `setMode`.

---

## P2

### 6. A guessed "nice to have" read can sign the user out of web mode, and opening the popup opens a Spotify tab
- **Where:** `spotify-web.js:67-88` (`hard`), `spotify-web.js:88`, `spotify-web.js:388-415`, `spotify-web.js:666-692`, `background.js:588-598`, `popup.js:241-251`
- **The guessed read:** `areSaved` calls `areEntitiesInLibrary`, whose variables the code itself says are "from memory … not checked on a live build".
- **What counts as harmless:** only `no-hash`, `bad-shape` and `stale` are treated as soft failures.
- **What logs the user out:**
  - A 400 becomes `setupError('http')`.
  - A 403 waits up to 20 s for a fresh token and then becomes `setupError('refused')`.
  - Either way, `hard()` writes `WEB_PROBLEM_KEY` and deletes `yt2sp:webUser`.
  - The background's `liked` handler swallows the error, so the user is quietly logged out on every popup open.
  - The same applies to `myPlaylists` and `playlistUris`, which the comment says are "handled".
- **The extra tab:** with no Spotify tab open, the heart check alone calls `ensureTab()`, which opens a background `open.spotify.com` tab even when every match is cached.
- **Fix:**
  - Wrap the read-only helpers (`areSaved`, `myPlaylists`, `playlistUris`) so that any setup error returns the fallback without calling `hard()`'s logout.
  - Skip `liked` in web mode unless a Spotify tab is already known (`tabId !== null`).

### 7. The popup's save sheet overrides the user's playlist choice once playlists load
- **Where:** `popup.js:782-796`, `popup.js:800-808`
- **What happens:**
  - `openSheet` awaits `bg('playlists')`, which in web mode means up to 10 `libraryV3` pages paced 200 ms apart.
  - It then calls `preselectLink()` without any check, which sets the select back to the linked playlist.
  - If the user chose "New Playlist" or another playlist in that window, the choice is silently reverted, and Save adds the songs to the linked playlist.
- **Fix:** copy the full view's `targetTouched` guard (`import.js:375-377`) into the popup. Set it in `$('target').onchange` and reset it in `openSheet`.

### 8. Pressing Save twice creates two playlists
- **Where:** `popup.js:845-861`, `popup.js:974`, `import.js:761-774`, `import.js:618-636`, `background.js:204`, `background.js:235-237`
- **Popup:** Enter in the name field calls `save()` directly and never checks `saveGo.disabled`.
- **Full view:** `createBtn` is disabled only after the `JOB_KEY` storage event comes back.
- **Background:** `runJob` has no guard against a second job while one is running.
- **Result:** a double Enter, or Enter then a click, runs `createPlaylist` twice with the same songs.
- **Fix:** keep an in-flight flag in each UI (return early from `save()` and `createPlaylist()`), and have `runJob` reject a `save` while another `save` is running.

### 9. The service worker can stop in the middle of a job
- **Where:** `spotify.js:191-195`, `spotify-web.js:395-399`, `background.js:205-207`, `background.js:289-311`, `popup.js:553`
- **What happens:**
  - On a 429, both providers sleep for up to 60 s with no extension API calls, so all three match workers can be idle for longer than the 30 s limit and the worker is stopped.
  - The play/queue/save job stays `running: true`, so the buttons stay disabled until `at` is 120 s old.
  - Rows stay "Searching Spotify…" in the open popup until it is reopened (`'matching'` is correctly treated as not done).
  - The badge stays "…", because its clear timer died with the worker.
- **Fix:**
  - During a long wait, touch storage every 20 s, or cap the sleep at 25 s and loop.
  - Store `deadline` on the job so the UI can tell it is stale.
  - Clear the busy badge at worker start (`runtime.onStartup` does not run on a plain wake).

### 10. The storage cache can outgrow the 10 MB quota, and a failed write kills the workers
- **Where:** `background.js:19-22`, `background.js:119`, `background.js:137-143`, `background.js:642-643`, `background.js:108-134`
- **How it grows:**
  - Each match stores the match plus up to 6 alternatives, about 2–3 KB, so 3000 entries come to roughly 7 MB.
  - `pruneMatches` runs only at browser start or update, so a browser left open for weeks goes past 3000.
  - Playlist links can hold 100 × 2000 URIs, around 8 MB at worst.
  - There is no `unlimitedStorage` permission.
- **How it fails:**
  - When `storage.local.set` throws, the worker's catch block writes again, which also throws.
  - The rejection escapes `worker()` unhandled, the remaining `todo` items keep their `inflight` entries, and `settledMatches` waits its full 120 s.
- **Fix:**
  - Store at most 3 alternatives, without `url`/`image` duplicates.
  - Prune on write (every N inserts).
  - Wrap the catch-block write in try/catch.
  - Consider `unlimitedStorage`.

### 11. Disconnect can leave data behind
- **Where:** `import.js:330-334`, `import.js:73-80`, `background.js:257`, `background.js:517-529`
- **Three ways data survives:**
  - The full view clears its 300 ms debounced `save()` timer only *after* `await bg('disconnect')`. A pending timer can rewrite `QUEUE_KEY` after the wipe.
  - A `save` job still running calls `rememberLink` after `wipePersonalData`, so the deleted link comes back.
  - An open popup rewrites `CHECKS_KEY` and `MORE_KEY` on its next action.
- **Promise affected:** PRIVACY.md:26 says Disconnect deletes all of these.
- **Fix:**
  - Call `clearTimeout(saveTimer)` before the message.
  - Have `rememberLink` and the job's `update` check `epoch`. Capture it at job start, as the match workers already do.
  - Broadcast a "wiped" session flag that open pages honour.

### 12. Queue to a player that is not playing ends in a raw 404 (official mode)
- **Where:** `background.js:161-174`, `background.js:213-221`, `spotify.js:216-225`, `spotify.js:330-335`
- **What happens:**
  - When nothing is playing, `pickDevice` still offers the device sheet for **queue**.
  - Spotify's queue endpoint needs an active playback session, so it answers 404 ("No active device found").
  - `friendlyError` rewrites only 403s, so the user sees "Spotify 404: …".
  - Web mode maps this case to a friendly message (`NOTHING_PLAYING`); official mode does not.
- **Fix:**
  - For `queue` with no active device, fail early with the web mode's "Nothing is playing yet" text.
  - Map 404 on `/me/player/*` in `friendlyError` to `NO_DEVICE`.

### 13. Web mode never notices that a linked playlist was deleted
- **Where:** `background.js:239-248`, `spotify-web.js:626-645`, `spotify-web.js:647-658`
- **What happens:**
  - The 404 branch that drops a dead link checks `err.status`, which the web provider never sets, and `do_playlistUris` turns errors into an empty set.
  - Saving a Mix whose playlist the user deleted fails with "Spotify would not add the songs (…)" or a setup error, every time.
  - The link stays, and the popup keeps preselecting the dead playlist.
- **Fix:** detect the deleted-playlist case in `fetchPlaylistContents` and `addToPlaylist` (a NotFound `__typename` or null `playlistV2`) and throw an error with `status: 404`.

### 14. The bridge channel: forged replies and a hijackable handshake (the token is not exposed)
- **Where:** `spotify-hook.js:255`, `spotify-hook.js:263-268`, `spotify-bridge.js:23-44`, `spotify-web.js:517-533`
- **What is sound:**
  - Nothing in the page can send messages *to* the extension.
  - Header values never leave the hook's closure.
  - Requests go only to fixed Spotify hosts.
- **Gap 1, forged replies:**
  - `reply` calls the live `window.postMessage`. Any page script, or another extension's MAIN-world script, can patch it and read the channel from the first reply.
  - That script can then post forged `res` messages: fake search results, device ids, playlist URIs, or `image` URLs that load as tracking pixels in the extension pages.
- **Gap 2, handshake hijack:** "first init wins" lets another extension's document_start script bind the hook to its own channel. That only breaks web mode; it is not a takeover.
- **What limits the damage:**
  - The UI builds everything with `textContent`/`setAttribute`, so this is not script injection.
  - `toTrack` does not validate `d.id`, but `url` is always rebuilt on `open.spotify.com`.
- **Fix:**
  - Capture `window.postMessage`, `JSON` and `Object.hasOwn` at hook load.
  - Validate ids (`/^[A-Za-z0-9]{22}$/`) and image hosts (`i.scdn.co`, `*.spotifycdn.com`) in `toTrack`.

### 15. Permission and privacy claims do not match the manifest
- **Where:** `manifest.json:31-40`, `README.md:114-124`, `README.md:15`, `README.md:143`, `PRIVACY.md:16-20`, `background.js:438-449`, `background.js:487-493`
- **developer.spotify.com is not separate:** it is not its own permission. It is covered by `https://*.spotify.com/*`, which is granted to everyone for good. The README labels that wildcard "No-setup login only", but the official setup script needs it.
- **Undocumented:** `https://*.chromiumapp.org/*` is not explained.
- **"Removed when it ends":** after the 30-minute timer, the setup script is removed only lazily, on the next dashboard page load or at browser start. Its `setInterval` also keeps running in the tab.
- **PRIVACY gap:** it does not say that the background itself fetches `open.spotify.com` HTML and `open.spotifycdn.com` bundles, without cookies.
- **"Every song" on a watch page:** README line 15 says a playlist on a watch page gives every song. "Load Entire Playlist" is shown only on `/playlist` pages (`content.js:303`, `popup.js:512`).
- **Fix:**
  - Narrow the wildcard to `https://developer.spotify.com/*`, ideally as `optional_host_permissions` requested when Set Up is clicked.
  - Document `chromiumapp.org`.
  - Update both documents.

### 16. "Load More Songs" may not continue the Mix the user is actually seeing
- **Where:** `content.js:223-258`
- **What the code sends:**
  - The request to `/youtubei/v1/next` sends only `Content-Type` and cookies.
  - There is no `Authorization: SAPISIDHASH …` or `X-Goog-AuthUser`, which the page's own requests include for a signed-in user.
- **Why it matters:** YouTube is likely to answer as signed out. A personal Mix (`RDMM…`, `RDAMVM…`) then continues as a generic Mix, so "more songs" may not be the user's Mix. This is the README's main reason to use Dhaara.
- **Other weak points:**
  - When the config script is not found, it falls back to a hard-coded `clientVersion`.
  - Only the `twoColumnWatchNextResults` response shape is parsed.
- **Status and fix:** this needs a live check on a signed-in account. If it holds, build the SAPISIDHASH header from the `SAPISID` cookie the way the page does, or read the Mix through the page's own continuation in the MAIN world.

### 17. Alt+Shift+S ignores songs the user unticked
- **Where:** `background.js:382-391`, `store.js:67-70`, `popup.js:96-99`
- **What happens:**
  - The save-mix shortcut uses `isTicked(v)` without the popup's overrides in `CHECKS_KEY`.
  - A "sure" match that the user unticked in the popup, because it was the wrong song, is still saved by the shortcut.
  - README:89 documents "songs that start ticked", but users will read an untick as "not this one".
- **Fix:** read `CHECKS_KEY` in `saveMixShortcut` and pass the override to `isTicked`.

### 18. Accessibility: the playlist pop-up menu inside the save sheet
- **Where:** `ui.js:342-353`, `ui.js:364`, `ui.js:395-410`, `popup.html:52`
- **Hidden from screen readers:** the listbox is appended to `<body>`, outside `#saveSheet` (`role="dialog" aria-modal="true"`). Screen readers that honour `aria-modal` (VoiceOver with Chrome) hide everything outside the dialog, so the opened menu is not announced.
- **Invalid child:** `role="separator"` is not an allowed child of `listbox`.
- **Duplicate ids:**
  - `close()` keeps the old list in the DOM for up to 250 ms with the same ids (`menu-<uid>-<i>`).
  - Reopening quickly makes `aria-activedescendant` point at the stale, `aria-hidden` copy.
- **Lost focus:** `close(false)`, used on blur, scroll and outside clicks, removes the focused list without moving focus, so keyboard focus drops to `<body>`.
- **Fix:**
  - Append the menu inside the nearest `[role=dialog]`, or `<body>` when there is none. The fixed position still avoids clipping.
  - Use `role="presentation"` on the separators, or wrap options in `role="group"`.
  - Rename or remove the old list at once when closing.
  - Refocus the button when focus was inside the list.

### 19. Clicking Set Up twice shows a false error
- **Where:** `background.js:471-485`, `import.js:281-294`
- **What happens:**
  - Two quick clicks run two `startSetup` calls: both unregister, then both register.
  - The second fails with "Duplicate script ID 'yt2sp-setup'", which the full view shows as an error.
  - The first call has already opened the setup tab and works.
  - The full view's Set Up button is not disabled while this runs.
- **Fix:** disable the button while it runs, and in `startSetup` catch the duplicate-ID error or check `getRegisteredContentScripts`.

---

## Checked and fine
- **PKCE:** the S256 challenge, a 64-byte verifier and a 16-byte `state` are compared before the code exchange (`spotify.js:120-144`). Token refresh is serialised with a Web Lock.
- **Feb-2026 endpoints:** `/me/playlists` (GET/POST), `/playlists/{id}/items`, `PUT /me/library`, `GET /me/library/contains` and search `limit` ≤ 10 all match Spotify's [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
  - Player endpoints are unchanged.
  - `GET /playlists/{id}/items` works only for playlists the user owns or collaborates on, which matches the `myPlaylists` filter.
  - The guide does not give a URI cap for `/me/library`, so the 40 per call is a safe guess, and the query-then-body retry covers both forms.
- **Messages:** every async `onMessage` listener returns `true`, and message names and shapes match between `store.js` `bg()` and `background.js` handlers. The two providers export the same functions that `background.js` calls.
- **Storage access:** no content script touches `chrome.storage.session`.
- **HTML injection:** none from YouTube or Spotify strings. The UI uses `h()` with `textContent`/`setAttribute`, and the setup banner escapes its one remote string.
- **Setup messages:** `setupState` and `foundClientId` are restricted to the dashboard tab.
- **Listeners:** commands, `onMessage`, `onStartup` and `onInstalled` are registered at the top level. The exceptions are the login fallback (finding 4) and `injectWhenLoaded`, which is fine because it is short-lived.

Sources:
- [February 2026 Web API Dev Mode Changes, Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Spotify: Update on Developer Access and Platform Security (6 Feb 2026)](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
- [February 2026 changes reference](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)

---

## Resolution

Fix round of 3 Nov 2026. Every finding was checked against the code path before it was changed. Nothing was run against a real Spotify, YouTube or browser here: node syntax checks, the match test set (0 decoys high), and mocked-API runs of the Play and tab-login logic only. Line numbers above refer to the code before this round.

| # | Finding | Result |
|---|---|---|
| 1 | Setup saves the Client ID of any app page | **Fixed.** Setup now starts on the dashboard list and remembers which app IDs exist. An ID is taken only if (a) it is new (not in that list) and reached from the Create form in this run, or (b) the user clicked "Use my existing app" / "Use this app" for it. Either way the app's settings page is opened and the redirect URI must be listed on it (for an existing app the script opens Edit, adds the URI, outlines Save, and waits for Continue). `foundClientId` in the background accepts only the app the setup chose. The settings-page selectors (Edit button, Save button) are guesses: if they miss, the banner tells the user to add the URI by hand, and Settings > Set It Up by Hand still works |
| 2 | Unofficial hook runs for everyone | **Fixed.** Removed from `manifest.json`. `spotify-hook.js` (MAIN, document_start) and `spotify-bridge.js` are registered only while the mode is `web` (on mode switch, `connect`, install and browser start), unregistered on switch to `app` and on Disconnect, and injected into already-open Spotify tabs when switching to web. A tab that stays silent for 20 s without a session is reloaded once |
| 3 | YouTube Music "Play from here" | **Fixed.** `content.js` puts the URL's video id on the queue row that is playing (found by the row's `selected` mark, else by title and artist against the player bar), so the row and the card are one song. `playFromHere` also no longer falls back to the whole list when the song is not found: it plays just the song. The `selected` attribute is from memory of the page, not checked live |
| 4 | Brave login fallback lost when the worker sleeps | **Fixed.** The PKCE verifier and state live in `chrome.storage.session`; top-level `tabs.onUpdated` / `onRemoved` listeners in `background.js` finish the exchange (under a Web Lock, once). While the worker lives it also keeps itself awake. The popup and full view treat a closed message port as "finish in the Spotify tab" and pick the login up from the stored token |
| 5 | Changed search shape cached as "Not found" | **Fixed.** A missing `tracksV2`, or results where no row can be read, throw `bad-shape` (error plus the official-setup offer). A search with no results (`tracksV2` present, no items) is still "not found". Each match records which mode produced it, a `none` from another mode is searched again, and switching modes drops cached `none` entries |
| 6 | Guessed read signs the user out; popup opens a Spotify tab | **Fixed.** `areSaved`, `myPlaylists` and `playlistUris` return their fallback on any setup error instead of ending the web login; the heart is skipped in web mode when no Spotify tab is open |
| 7 | Save sheet overrides the user's playlist choice | **Fixed.** `targetTouched` guard in the popup, as in the full view |
| 8 | Double Save creates two playlists | **Fixed** in the popup, the full view and the background (a second `save` while one runs is refused) |
| 9 | Worker stops mid-job | **Fixed in part.** Rate-limit waits in both providers sleep in 20 s steps that touch an extension API; a stale "…" badge is cleared when a worker starts. Not done: a `deadline` on the job (the existing 120 s staleness check stays) |
| 10 | Cache can outgrow the quota | **Fixed in part.** At most 3 alternatives per match, pruning every 100 inserts, the catch-block write no longer throws out of the worker. Not done: `unlimitedStorage`, and the 8 MB worst case of 100 links x 2000 URIs |
| 11 | Disconnect can leave data behind | **Fixed in part.** The debounced list save is cleared before the wipe, and a job that was running when Disconnect happened no longer writes its status or its playlist link. Deferred: an open popup can still rewrite its ticks (`CHECKS_KEY`) on its next action |
| 12 | Queue with nothing playing ends in a raw 404 | **Fixed.** Queue retries once after moving playback to the device, then maps 404 on `/me/player/*` to a plain message (same text as web mode) |
| 13 | Web mode never notices a deleted playlist | **Fixed.** `fetchPlaylistContents` / `addToPlaylist` answers for a missing playlist throw an error with `status: 404`, so the link is dropped. The `NotFound` typename is from memory, not checked live |
| 14 | Bridge channel | **Fixed in part.** The hook captures `postMessage`, `JSON` and `Object.hasOwn` at load; `toTrack` accepts only 22-character ids and Spotify image hosts. Not fixed: the first-init-wins handshake (another extension's document_start script can still bind the hook; it only breaks web mode) |
| 15 | Permission and privacy claims | **Fixed.** `https://*.spotify.com/*` is now `https://developer.spotify.com/*`; README and PRIVACY document `chromiumapp.org`, the background's cookie-less fetches of `open.spotify.com` and `open.spotifycdn.com`, and the corrected "playlist on a watch page" row. The setup script now stops itself when setup is over. Deferred: making `developer.spotify.com` an optional permission requested on Set Up (it changes the setup flow) |
| 16 | "Load More Songs" may not continue the user's Mix | **Deferred.** Needs a live check on a signed-in account (SAPISIDHASH or a page-world read); not guessed at |
| 17 | Alt+Shift+S ignores unticked songs | **Fixed.** The shortcut reads the popup's ticks (`CHECKS_KEY`) |
| 18 | Pop-up menu accessibility | **Fixed**, with one correction to the suggested fix: the Save sheet is transformed and has a backdrop filter, which makes it the containing block of `position: fixed`, so a menu appended inside it would be misplaced. `popupMenu` now appends inside the nearest dialog and measures the real origin with a zero-size probe. Separators are `role="presentation"`, the old list loses its ids at once, and focus returns to the button when it was inside the list |
| 19 | Set Up twice shows a false error | **Fixed.** `startSetup` runs one at a time, and the buttons ignore a second click while it runs |

Sandbox issues: `withTransition` now catches `ready`, `finished` and `updateCallbackDone` and runs the update once; `popupMenu` is placed on open, then every frame until its button stops moving, and again on resize and scroll (the open-upward flip is kept).

Also built in this round, from owner requests: Play now moves Spotify to the chosen device and checks that the song really started (a desktop app that is not the active device used to accept the request and ignore it), "Open in Spotify" in the app or the web (decision 18), and one player at a time (decision 19).

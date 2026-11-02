# Feature ideas and review (3 Nov 2026)

What I reviewed: every file in the extension, against the Spotify Developer Policy and the Chrome docs. Nothing has run on a real account yet. Effort: S = up to half a day, M = 1 to 3 days.

**The daily loop:** you play a Mix on YouTube, hear a good song, and want it on Spotify. Today every catch needs the popup. Most of the value is in making it one key press, or automatic.

## Ranked features (value × effort)

1. **Keyboard shortcuts** (S). Alt+Shift+L likes the current song on Spotify, Alt+Shift+Q queues it, Alt+Shift+M adds the Mix to its linked playlist (#2).
   - How: `commands` allows 4 suggested shortcuts, each with Ctrl or Alt. A command can also work while Chrome is in the background (global), but then only Ctrl+Shift+0–9. The worker asks the tab for `current`, reuses the cached match and runs the existing `like`/`queue` job. The icon badge (`setBadgeText`) shows the result. A match below "high" is never liked unseen: the badge shows "?".
2. **Linked playlist per Mix** (S–M). Shows "Add 12 new to <playlist>".
   - Why: a Mix keeps growing as you listen, and today you repeat Save and pick the playlist each time.
   - How: after a save, store `listId → { playlistId, savedKeys }`, and reuse the `playlistUris` duplicate check. It only adds, because YouTube keeps refilling an `RD…` Mix.
3. **Listening journal** (M). An optional switch: each song that plays for 30 s or more goes to one rolling playlist if its match is high. Doubtful matches wait in an inbox in the full view.
   - How: watch `yt-navigate-finish` and the video's `timeupdate`, keep the playlist's URIs locally, then `POST /playlists/{id}/items`. Each song costs 1–3 searches and 1 write, well inside the limits.
   - Risk: it stops silently when the login dies after 6 months. Show "!" on the badge and remind you at 5½ months.
4. **Hindi/Punjabi matching and a golden test set** (M). Matching quality is the product.
   - Today a Devanagari title ("तुम से तुम तक") shares no tokens with Spotify's Latin track names, so its name score is 0.
   - Titles that name only actors and the film get no artist hit. The 0.59 cap then leaves them unticked.
   - Fixes:
     - Transliterate Devanagari and Gurmukhi to Latin, for both search and scoring.
     - Add Hinglish spelling rules on top of `squash`: ee→i, oo→u, w→v, main/mein.
     - Count album = film name as artist evidence.
     - Collect 150–200 real titles with the right Spotify track for each, run them under node, and track how precise "high" is.
5. **Button next to YouTube's player** (M). A small shadow-DOM chip under the title: ♡ Spotify · Queue · Change. It reuses the worker's handlers.
   - Risk: YouTube changes its page layout often. This feature is also the closest to Spotify's ban on apps "integrated with streams or content from another service". Keep Spotify cover art off YouTube's page.
6. **"Not on Spotify yet" watchlist** (M).
   - Why: some indie and film songs reach Spotify after YouTube. Today a `none` result is cached forever, because `enqueue` treats it as done.
   - How: once a day, `chrome.alarms` searches again for up to 50 missing songs. `chrome.notifications` tells you when one turns up, and a high match goes into the linked playlist.
7. **History and undo** (S–M). Log every job and keep the last 200.
   - Undoing a save calls `DELETE /playlists/{id}/items`. Undoing a like calls `DELETE /me/library` (check it works).
   - Play and queue cannot be undone, because the API cannot remove songs from the queue. The UI should say so.
8. **Device picker** (S). `pickDevice` takes the first device that is not restricted, which could be the living-room TV. When there is more than one, ask which, and remember the answer.
9. **Right-click menu on thumbnails** (S–M). `contextMenus` with `targetUrlPatterns` for `/watch` and `/shorts` links adds "Like" and "Queue on Spotify". On `list=RD` links it also adds "Save this Mix", which uses InnerTube `/next`. The title comes from the right-clicked card.
10. **Continue on Spotify** (S). Pause the YouTube video, play the match, then queue the rest of the Mix. The video must be paused first: Spotify forbids syncing its recordings with video.
11. **Small extras** (S each):
    - Sync hand picks as `videoId → trackId` in `storage.sync` (about 2,000 fit). Each device keeps its own login.
    - "Copy as message" for friends outside the 5-user limit: a list of links ready for WhatsApp. Never share your Client ID.
    - Export to JSON or CSV.

## Improvements to existing flows

- **P0, login refresh:** several refreshes can run at once in `accessToken()`. When the token expires, 3 workers refresh with the same token. If Spotify replaces the old refresh token, the other two fail, and `catch { disconnect() }` logs you out. A network blip during a refresh logs you out too. Fix: share one refresh promise, and disconnect only on `invalid_grant`.
- **Liked state:** the popup's `liked` is kept in memory, so ♡ never shows songs you liked earlier. Ask Spotify's library "contains" endpoint instead.
- **Disconnect:** also clear the cache, hand picks and list. Spotify's policy requires deleting a user's personal data when they disconnect.
- **Link back:** popup rows show Spotify names and cover art with no link to Spotify. Spotify's policy requires one.
- **Setup script:** it runs on every developer.spotify.com page, and while no Client ID is saved it grabs the ID of any app page you open. Register it only during setup.
- **Spotify host permissions:** test whether `api` and `accounts.spotify.com` are needed at all; both send CORS headers.
- **Fonts:** bundle Hind and Kalam (both under the OFL licence) instead of loading them from Google Fonts. Opening the popup then sends no request to Google, and it works offline.
- **Load more:** the request sends cookies but not YouTube's SAPISIDHASH sign-in header, so the extra songs may not be your personal ones. Check them on the real account.

## Top risks

1. **Never tried on a real account.** The first test should cover a Premium owner, logging in on Brave, rate-limit (429) errors on a 50-song Mix, and how `/me/library` takes the song IDs (in the URL or in the body).
2. **Spotify's policy:** it bans products integrated with another service's content. A personal import tool carries little risk; the in-page button and public promotion raise it.
3. **YouTube's terms** ban automated access. Reading its internal API (InnerTube) can break or be blocked at any time.
4. **Narrow open-source audience:** every user needs Premium to own a Spotify app. If Spotify changes its form, the setup auto-fill breaks.
5. **Branding and the store:** the name uses both trademarks. A Chrome Web Store install gets a different extension ID, so its redirect URI changes. There are also no tests, no LICENSE and no privacy note yet.

## Questions for the owner

1. Where should songs end up: a playlist per Mix, one rolling playlist, or Liked Songs?
2. Can high-confidence matches be added without review?
3. Who is the open-source release for: up to 5 friends, or strangers who each set up their own Spotify app (Premium only)? Chrome Web Store, or GitHub only?
4. For slowed, reverb and remix uploads, should the match be the original song or the same version?
5. YouTube or YouTube Music: which do you use more, and do you watch the video or just listen?
6. Which Spotify device do you play on: desktop app, web player or phone?
7. Do you use more than one computer or browser?
8. Should Play replace what is playing, or start after the current song?
9. Is it OK to ship InnerTube "load more" in a public release?
10. Keep "YouTube" and "Spotify" in the name, or rebrand around the cassette theme?

# Chrome Web Store listing draft

Draft for the owner to paste into the Chrome Web Store developer dashboard. Nothing is submitted. Dhaara is not listed yet.

## Before you submit

- **One-time developer registration fee** (a small fee, paid once to Google). Do it from the owner's own account.
- **Trademark search first.** `docs/decisions.md` (decision 10) says to search USPTO and IP India, classes 9 and 42, before a store listing.
- **The store takes its summary from `manifest.json`.** The `description` field in the manifest becomes the short description in the store (132 characters at most). Today it reads "Let your YouTube Mixes flow into Spotify: play, queue, like or save the songs you find on YouTube." Consider replacing it with the summary below. That is a one-line edit to `manifest.json` that the owner makes; this draft does not touch it.
- **The pinned `key` in `manifest.json`.** The store assigns its own extension ID, which is why the README says a store install gets a different redirect URI. Check the dashboard's upload rules for the `key` field before you upload, and remove it from the upload copy if the dashboard complains. Official setup fills in the right redirect URI either way.
- **Expect a careful review.** The extension has broad host permissions and an optional mode that talks to the Spotify web player and adds scripts to `open.spotify.com`. Prepare the permission justifications below, and be ready to answer questions about that mode. If review pushes back, shipping the store build with the official setup only is the fallback.
- **Privacy policy URL:** `https://github.com/KushagraMehta/Dhaara/blob/main/PRIVACY.md`

## Title options

The brand rule: no "YouTube" or "Spotify" in the product name. Descriptive use is fine in the summary and description. Chrome's store policies also push against using other companies' names in an item title in a way that suggests a connection, so the safest title has none.

| # | Title | Notes |
|---|---|---|
| 1 | `Dhaara` | Cleanest and fully within the brand rule. Search relies on the summary and description. |
| 2 | `Dhaara: Mix and Playlist Importer` | **Recommended.** No third-party names, and it adds the words people search for (mix, playlist, import). 33 characters. |
| 3 | `Dhaara: Mix to Playlist Converter` | Same idea with "converter", which is the word many searchers use. |
| 4 | `Dhaara: YouTube Mix to Spotify` | Strongest for search, but it puts both names in the title. It breaks the owner's brand rule and invites a trademark complaint, so not recommended. (Existing extensions such as Youfy do use "YouTube to Spotify" in their names.) |

## Summary (132 characters at most)

```
Move the YouTube Mix, playlist or song you're watching to Spotify. Play, queue or save it. Free, open source, no server.
```

(120 characters.)

Alternative that leads with the audience: `Send YouTube Mixes and playlists to Spotify: play, queue, like or save. Tuned for Hindi titles. Free, open source.`

## Long description

Plain text, because the store does not render Markdown. Paste as is.

```
Dhaara is a free, open-source browser extension that moves the YouTube Mix, playlist or song you're watching to Spotify, so you can play, queue or save it there.

WHY IT EXISTS
Your personal YouTube Mixes are made on the fly for you, so there is no link that a web importer can follow. Dhaara reads the page you have open instead, and matches each video to a Spotify song.

WHAT IT READS
• Any YouTube video (it uses YouTube's own "Music in this video" credit when there is one)
• YouTube Mixes, including personal auto-generated ones. "Load More Songs" adds about 24 more each time, without playing them
• Playlists, Shorts, and YouTube Music queues, playlists and albums

SMART MATCHING
• Cleans messy video titles and runs up to 3 Spotify searches per video
• Built for Hindi, Punjabi and Bollywood titles: it reads Devanagari and Gurmukhi script, Hinglish spellings and film names
• Shows how sure each match is (Sure, Check, Unsure, Not found). Only sure matches start ticked, so nothing doubtful is added silently
• Fix a match once and it stays fixed in every Mix

PLAY, QUEUE, LIKE, SAVE
• Play from a song, queue it, add it to Liked Songs, or save the Mix to a new or existing playlist
• Linked playlists: save the same Mix again and only the new songs are added. Dhaara never removes a song
• Choose which Spotify device plays
• Keyboard shortcuts: Alt+Shift+L like, Alt+Shift+Q queue, Alt+Shift+S save the Mix
• One player at a time: starting Spotify pauses YouTube, and the other way round (you can turn it off)

PRIVATE BY DESIGN
• No server, no account of our own, no analytics. Everything stays in your browser
• Requests go only to YouTube and Spotify
• Official Spotify login (PKCE). "Disconnect" deletes what Dhaara saved

BEFORE YOU INSTALL
• Dhaara logs in through a Spotify developer app that you own. It fills in Spotify's form for you in about a minute
• Spotify requires the app's owner to have Premium, and playing and queueing also need Premium. One app can serve up to 5 people
• There is also an optional unofficial mode that uses your open Spotify web player tab. It can stop working whenever Spotify changes its web player

Open source (MIT): https://github.com/KushagraMehta/Dhaara
Website: https://kushagramehta.github.io/Dhaara/

Dhaara is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube, Google or Spotify. YouTube and Spotify are trademarks of their owners.
```

## Category

- **Recommended:** Lifestyle, then Entertainment.
- Fallback: Productivity, then Tools.

The dashboard's category list changes now and then, so pick the nearest "Entertainment" entry it shows today.

## Language

English. A Hindi listing (a second language) is a worthwhile later step, because the matching story is the point for that audience.

## Screenshots (up to 5, 1280 x 800)

Use the files described in `docs/site/assets/screenshots.md`. They must be real captures with no personal details.

1. `screenshot-popup-mix.png`: the popup on a Mix, with the Now Playing card and the tracklist.
2. `screenshot-matching.png`: Hindi and Punjabi film songs with match bars, a "Check" row and the Review button.
3. `screenshot-save-linked.png`: the Save sheet for a linked Mix, "Add 3 New Songs".
4. `screenshot-full-view.png`: the full view in dark mode with Settings and the shortcuts.
5. Optional: the first-run screen with the two ways to connect.

Caption each one in the dashboard in one plain line.

Also optional: a small promo tile (440 x 280), a marquee (1400 x 560), and a link to a short video (the demo GIF converted to a short MP4 on any host).

## Privacy practices tab

- **Single purpose:** "Find the song, Mix or playlist you are watching on YouTube on Spotify, so you can play, queue, like or save it."
- **Data use:** the extension stores a Spotify login token, the Spotify app's Client ID, match results and settings in the browser's own storage. It sends song titles and artists to Spotify to search, and the actions you ask for (play, queue, like, save). It does not sell or transfer data, and it has no server.
- **Remote code:** none. All scripts are in the package.

### Permission justifications

| Permission | Justification to paste |
|---|---|
| `youtube.com`, `music.youtube.com` | Reads the song list from the YouTube or YouTube Music page the user has open. |
| `accounts.spotify.com`, `api.spotify.com` | Spotify login (PKCE) and the Spotify Web API calls the user asks for. |
| `developer.spotify.com` | Only during setup: fills in Spotify's Create app form or the app's redirect URI after the user clicks Set Up Spotify. The script is added when setup starts and removed when it ends. |
| `open.spotify.com`, `open.spotifycdn.com` | Only for the optional no-setup login: talks to the user's own Spotify web player tab. |
| `*.chromiumapp.org` | The login's return address on the extension's own ID. |
| `identity` | Opens the Spotify login window. |
| `storage` | Keeps the Client ID, login, match cache, hand picks, playlist links and chosen device in the browser. |
| `scripting`, `activeTab` | Reads a YouTube tab that was open before install; adds the setup script during setup; adds the no-setup login's page scripts only while that login is on. |

These match the README's "Permissions, and why" table and `PRIVACY.md`.

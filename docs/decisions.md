# Decisions

Settled with the owner in grilling sessions. Newest last.

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Who is this for? | Anyone installing from GitHub, not just the owner and friends. | 3 Nov 2026 |
| 2 | Visual direction | Apple-like and polished. The cassette/oxide look is dropped. | 3 Nov 2026 |
| 3 | Where does a saved Mix go? | Its own linked playlist. Saving the same Mix again adds only the new songs. Single songs go to Liked Songs. | 3 Nov 2026 |
| 4 | Unofficial no-setup login? | Offered on first run as an opt-in, next to the official setup. If it fails for any reason (no Spotify tab, Spotify changed its web player, login lost), the user is told what went wrong and offered the official setup. | 3 Nov 2026 |
| 5 | Which matches start ticked? | Only sure matches (3 bars). "Check" and "unsure" start unticked; the "N to look at" button walks through them. (Owner: "do whatever feels best".) | 3 Nov 2026 |

## Settled on 3 Nov 2026

The owner answered 6, 7, 10 and 15 directly. For the rest they said "build the system in the best way" and will review the finished product, so the answers below stand.

| # | Question | Proposed answer | Why |
|---|---|---|---|
| 6 | Slowed, reverb or remix uploads | **Owner:** same version first; otherwise the original, marked "check" | You searched for that version on purpose |
| 7 | What does Play on the song card do? | **Owner:** play from here. In a Mix: this song, then the ticked songs after it. On a single video: just the song | Matches how music apps behave |
| 8 | Play vs Queue | Play replaces what is playing; Queue adds to the end | The usual meaning of the two words |
| 9 | Ship "Load more songs" (YouTube's internal API) publicly? | Yes, with a README note that it can break | Read-only, the same request the page itself makes, and it is the main reason to use this over link importers |
| 10 | Name | **Dhaara** (Hindi for "stream, flow"). Tagline: "Let your YouTube Mixes flow into Spotify." The owner asked for a unique, general name that covers all the features; an indirect name is fine. A naming subagent checked about 25 names. The top pick, Sangam, was dropped: it collides with the "Sangam Music" app and a Chrome extension called SANGAM. Dhaara had no music app or extension collisions. Before a Chrome Web Store listing, run a trademark search (USPTO / IP India, classes 9 and 42) | Avoids a trademark takedown, and fits Mixes flowing into Spotify |
| 11 | License | MIT, plus a THIRD_PARTY_NOTICES file for the MIT code borrowed for the no-setup login | Simple, and compatible with that code |
| 12 | Fonts | System font (SF on Mac, Segoe on Windows) with the Apple redesign, so nothing loads from Google | Apple-like, works offline, no privacy note needed |
| 13 | Full view style | Same Apple style as the popup | One product, one look |
| 14 | Film name | Show the film or album under the song title, and drop `(From "…")` from the title | Film songs are known by their film |
| 15 | Next features, in order | **Owner:** keyboard shortcuts first. Then: linked playlist per Mix (#3) → device picker → right-click "Send to Spotify" on thumbnails → history with undo. Later and opt-in: listening journal. Not doing: a button inside YouTube's page (closest to Spotify's ban on integrating with another service) | Biggest daily win first, lowest policy risk |
| 16 | Matching quality | Convert Hindi/Punjabi script to English letters, add Hinglish spelling rules and the film name as a clue, and keep a test set of about 150 real titles | Matching quality is the product |
| 18 | "Open in Spotify": app or web? | **Owner asked:** open in the app if the person has it, otherwise the web. A browser can't detect installed apps, so: **Automatic** (default) opens `spotify:track:…` in the app when Spotify's device list showed the desktop app (a "Computer" device that isn't a web player) in the last 14 days, otherwise open.spotify.com in a new tab. Settings: Open songs in: Automatic / Spotify app / Web player, for the installed-but-closed case. The first `spotify:` link shows the browser's "Open Spotify?" prompt, and ticking "Always allow" makes later ones instant | The device check needs no extra API calls; it reuses the play and queue requests |
| 19 | YouTube and Spotify playing at once | **Owner asked:** sync play/pause with Spotify and pause YouTube, because both playing is confusing. One player at a time (setting, on by default): Dhaara pauses YouTube before starting Spotify; when YouTube starts playing, Spotify is paused; the popup shows Spotify's live state (Pause/Resume on the card when Spotify plays that song, a slim row when it plays another). Spotify is read only while the popup is open (every 3 s) or once when YouTube starts, never polled in the background. As built: the setting is `yt2sp:exclusive`, "When One Starts, Pause the Other", in the full view's Settings; YouTube is paused in every open YouTube and YouTube Music tab before Play, play from here and Resume; the status line says "Paused Spotify because YouTube started playing." Play also moves playback to the chosen device first and says "Playing" only when Spotify confirmed the song started | Less confusing, follows Spotify's rule against playing alongside video, and keeps API use light |
| 20 | Website, or the GitHub repo only? | **Owner asked:** use GitHub Pages if it helps SEO. Yes: a one-page site on GitHub Pages from the same repo. It carries a search-targeted title, meta description, FAQ and structured data (FAQPage, SoftwareApplication), which a repo page can't. A GitHub Actions workflow deploys only `docs/site/`, so internal docs aren't published. The repo stays the main home | Free, nothing to host, and pages like this are what Google and AI answer engines tend to cite |
| 17 | Fixes for a public release | Link every Spotify song back to Spotify; Disconnect deletes the cache, picks and list; the setup script runs only during setup; songs "not on Spotify" are searched again after a week; the heart reads your real Liked Songs | Spotify's developer policy, privacy, and bugs found in the grill |

# Directories, awesome lists and existing threads

Research done 3 Nov 2026. Nothing has been submitted. Do these after the repository is public, the demo GIF and screenshots are in, and (for the store-style lists) the Chrome Web Store listing exists.

## 1. AlternativeTo

AlternativeTo is where people look for "alternatives to TuneMyMusic / Soundiiz / FreeYourMusic", and it ranks well in search.

- **Pages to be listed as an alternative to:**
  - Tune My Music: https://alternativeto.net/software/tune-my-music/
  - Soundiiz: https://alternativeto.net/software/soundiiz/
  - Free Your Music: https://alternativeto.net/software/stamp/ (its old name was STAMP, hence the address)
- **How to submit** (from AlternativeTo's FAQ, https://alternativeto.net/faq): make an account, open the user menu, choose **Suggest new application**, search to be sure Dhaara is not already there, then **Add a new application as a new alternative**. Fill in platforms, license, description and tags. Submissions are reviewed before they appear. If a page for Dhaara already exists later, the FAQ says to email support@alternativeto.net from your account to claim it.
- **Fields to use:**
  - Name: Dhaara
  - Platforms: Chrome and Brave if listed (the extension is Chromium MV3); else "Chrome"
  - License: Open Source, MIT. Price: Free
  - Website: https://kushagramehta.github.io/Dhaara/ and repository https://github.com/KushagraMehta/Dhaara
  - Short description (about one line): *Free, open-source extension that moves the YouTube Mix, playlist or song you're watching to Spotify, so you can play, queue or save it there.*
  - Longer description: the "Why Dhaara" section of the README. Be fair about the others: say they cover more services and need no install.
  - Tags: playlist converter, YouTube, Spotify, browser extension, open source, Hindi.
  - Mark as an alternative to: Tune My Music, Soundiiz, Free Your Music.
- **Disclose** that you are the developer, if the form or a comment asks.
- **When:** after the repository is public. A Chrome Web Store link makes the listing stronger but is not required.

## 2. Awesome lists (pull requests)

Rule for all of them: read the list's own rules the day you submit, send **one** small pull request per list, follow its exact format, and say in the PR that you are the author. Do not argue if it is declined. I could not find a dedicated "awesome Spotify tools" or "awesome YouTube Music" list that suits a playlist-transfer extension; the ones below are the best real matches.

| List | Fit | Rules (read from the repository) |
|---|---|---|
| **xyNNN/awesome-chrome**, https://github.com/xyNNN/awesome-chrome (127 stars, last push 2 Nov 2026) | Good. A curated list of Chrome extensions, by category (Fun, Productivity and others). | Its `CONTRIBUTING.md`: search earlier suggestions first; write a meaningful PR description; **one commit per suggestion**; entry format `* **Extension Name** - Short description.` with nested bullets `Website:` and `Chrome Web Store:` (a GitHub repository can stand in as the Website); only add URLs you have opened and that work (a store link must be a live listing); keep descriptions short and end them with a full stop; trim trailing whitespace. **Wait for the Chrome Web Store listing**, so the entry can carry a live store link. |
| **ciconia/awesome-music** (the same project now sits under `noteflakes/awesome-music`), https://github.com/ciconia/awesome-music (about 2,500 stars) | Weak. It is mostly audio libraries, DAWs and notation, though its "Audio Tools" section has a Spotify analytics tool. | `CONTRIBUTING.md`: format `[NAME](LINK) - DESCRIPTION.`, alphabetical, one link per PR. The **quality standard** asks for projects that are generally used, actively maintained, stable, documented and tested. A new project with few users will probably not pass the "generally used" test yet. Try again later. |
| **LarissaGuder/spotify-awesome-list**, https://github.com/LarissaGuder/spotify-awesome-list (41 stars, pushed Oct 2026) | Fair. A hand-curated list of Spotify-related tools. | It has a README only and no contribution guide, so open a small PR that follows the existing entry style (a bold name link, one or two sentences). Low reach, low effort. |
| **OshekharO/awesome-entertainment**, https://github.com/OshekharO/awesome-entertainment (256 stars) | Poor. Its "YouTube Music" section lists music players and clients, not extensions. | The README is generated from `data/listings.json` (edit that file, then run the generator). Skip unless it adds an extensions category. |

Not a fit: `hugo9655/awesome-spotify-stats` (listening statistics tools only).

**PR text to adapt** (disclosure first):

> Disclosure: I'm the author. Adding Dhaara, a free, open-source (MIT) Chrome/Brave extension that moves the YouTube Mix, playlist or song you're watching to Spotify. It's [published on the Chrome Web Store / loaded from GitHub]. Entry follows CONTRIBUTING.md.

**Entry draft for awesome-chrome** (check the category; "Fun" or "Productivity" are the nearest):

```
* **Dhaara** - Moves the YouTube Mix, playlist or song you're watching to Spotify, so you can play, queue or save it there.
  * Website: [github.com/KushagraMehta/Dhaara](https://github.com/KushagraMehta/Dhaara)
  * Chrome Web Store: [Chrome Web Store](https://chromewebstore.google.com/detail/EXTENSION_ID)
```

Once an awesome list includes the project, aggregators such as awesome.ecosyste.ms pick it up on their own, which adds links without more work.

## 3. Existing threads where a helpful, disclosed reply could fit

Be strict here. Reply only where the person is asking for exactly this, say that you are the author, give the plain facts (limits included) and a link, and never reply in bulk. A reply in someone else's project thread, or on a competitor's community, is usually unwelcome, so those are marked.

| Thread | Why it fits | Notes |
|---|---|---|
| Greasy Fork, "YouTube / Spotify Playlists Converter", discussion about a 404 on a YouTube Mix: https://greasyfork.org/en/scripts/486406-youtube-spotify-playlists-converter/discussions/297167 (script page: https://greasyfork.org/en/scripts/486406-youtube-spotify-playlists-converter) | A user hit an error on a YouTube Mix. The script's author said version 5.1 should handle Mixes, and a later commenter said it worked (May 2025). | I could not open the Greasy Fork pages from here (the page fetch returned 404), so confirm the thread exists and read it first. It is another developer's project page and the thread looks resolved, so **do not post an advert**. Only if someone there is still stuck on Mixes, add a short disclosed note that another option exists. |
| Spotify Community, "Import YouTube Music Library into Spotify": https://community.spotify.com/t5/Your-Library/Import-YouTube-Music-Library-into-Spotify/m-p/5617999/highlight/true | People asking how to move YouTube Music songs into Spotify. | Old thread. Read the Spotify Community guidelines on third-party tools before replying. A reply is fine only if it adds something to what is already there. |
| Spotify Community idea, "Import YouTube Playlists into Spotify": https://community.spotify.com/t5/Live-Ideas/Import-YouTube-Playlists-into-Spotify/idc-p/7109418/highlight/true | A feature request, from before Spotify added its own importer. | Probably stale now. Only reply if the thread is still active and asks for a workaround. |
| r/Soundiiz, a thread about "source not found" for auto-generated "Provided to YouTube" uploads (https://redlib.nohost.network/r/Soundiiz is a mirror of the subreddit) | The question is about matching a different kind of auto-generated upload, not about Mixes. | **Do not post there.** It is a competitor's own community. |

**How to find fresh threads.** Search these a few times in the first month, on Reddit and on Google, and answer only real questions you can actually help with:

- `youtube mix to spotify`
- `convert youtube playlist to spotify free`
- `transfer youtube music to spotify`
- `youtube to spotify chrome extension`
- `tunemymusic doesn't work youtube mix`
- `import youtube mix into spotify playlist`

**Reply template:**

> I'm the author of Dhaara, so take this with that in mind. It's a free, open-source Chrome/Brave extension that reads the Mix or playlist you have open and matches it to Spotify, which is why it can handle a personal Mix that link-based importers can't. Limits: you need your own Spotify developer app (Premium for its owner, Spotify's rule). https://github.com/KushagraMehta/Dhaara

## 4. Other places to list it

- **Microsoft Edge Add-ons.** The extension is a Chromium MV3 extension, so it can usually be submitted to the Edge store with little change. It brings a second store listing that search engines index.
- **Chrome Web Store.** See `chrome-web-store.md`. Brave users install from here, so this is the main one.
- **GitHub topics.** See `repo-settings.md`: `youtube-to-spotify` and `youtube-mix` have almost no competition.
- **Your own links.** Put the website and repository links in your GitHub profile, and in any personal site or bio. Links from pages that already have standing help new pages get indexed.

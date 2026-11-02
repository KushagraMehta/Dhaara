# GitHub repository settings for discoverability

Prepared 3 Nov 2026. These are texts and steps for the owner to apply by hand. Nothing here has been published.

## URLs used everywhere (search and replace in one place)

| What | URL |
|---|---|
| Repository | `https://github.com/KushagraMehta/Dhaara` |
| Website (GitHub Pages) | `https://kushagramehta.github.io/Dhaara/` |

They appear in `README.md`, `llms.txt`, `docs/site/llms.txt`, `docs/site/index.html` (canonical, Open Graph, Twitter, JSON-LD, links), `docs/site/sitemap.xml`, `docs/site/robots.txt`, `.github/workflows/pages.yml` (a comment) and in `docs/launch/`. If you ever rename the repository or change your username, run this from the repository root (macOS `sed`; on Linux drop the `''` after `-i`):

```bash
grep -rlE 'KushagraMehta/Dhaara|kushagramehta\.github\.io/Dhaara' . \
  | xargs sed -i '' -e 's#KushagraMehta/Dhaara#NEWUSER/NEWREPO#g' \
                    -e 's#kushagramehta\.github\.io/Dhaara#newuser.github.io/NEWREPO#g'
```

The JSON-LD author link (`https://github.com/KushagraMehta`) is not matched by that pattern; change it by hand if the username changes. Check with `git diff` before you commit.

## 1. Repository name

**Superseded: the owner created the repository as `Dhaara`, and that stays.** The note below is kept for the record.

*Original recommendation: `dhaara-youtube-to-spotify`.* Reasons:

- GitHub search and Google both weigh the repository name. People search for "youtube to spotify", not for "dhaara", which nobody knows yet. A name that carries the phrase is matched by the query itself.
- The product keeps its brand name, Dhaara. The brand rule (no "YouTube" or "Spotify" in the product name) is about the product; a repository slug that describes what it does is ordinary descriptive use.
- Shorter alternatives: `dhaara` (pure brand) or `dhaara-extension`. They are tidier but they do not carry the search phrase.

What to do instead, now that the name is `Dhaara`: the name no longer carries the phrase, so everything else must. That is already done in the README H1 ("Dhaara: YouTube Mix to Spotify extension for Chrome and Brave"), the one-sentence definition, and the description, topics and website below. If you ever do rename, do it **before** the first public posts: GitHub redirects old repository links but not the GitHub Pages address, so the website URL, the sitemap and every shared link would change.

## 2. About: description (under 350 characters)

Paste into the repository's **About** box (gear icon at the top right of the repository page):

```
Free, open-source Chrome and Brave extension that moves the YouTube Mix, playlist or song you're watching to Spotify. Play, queue, like or save it as a playlist. Reads personal Mixes (list=RD…), matches Hindi and Punjabi titles. No server.
```

(About 240 characters. The first 110 carry the search phrase, because GitHub shows a short preview in lists and search results.)

## 3. Topics (19)

Add in **About > Topics**. GitHub allows up to 20, lowercase letters, numbers and hyphens, 50 characters each. The counts are the number of public repositories carrying the topic on 3 Nov 2026. Small numbers are good here: you appear near the top of that topic's page.

| Topic | Repos | Why |
|---|---|---|
| `youtube-to-spotify` | 2 | The exact search phrase, almost no competition |
| `youtube-mix` | 3 | The niche that link importers can't serve |
| `youtube-playlist` | 348 | Playlist searchers |
| `youtube-music` | 1,341 | YouTube Music support |
| `spotify` | 11,831 | The broad topic everyone browses |
| `spotify-playlist` | 597 | The thing it creates |
| `spotify-web-api` | 1,655 | Developers and the API angle |
| `spotify-extension` | 15 | Small, relevant |
| `playlist-converter` | 38 | What searchers call it |
| `playlist-transfer` | 28 | Same |
| `playlist-importer` | 2 | Same |
| `chrome-extension` | 39,625 | The platform |
| `brave-browser` | 269 | The second browser it targets |
| `browser-extension` | 12,699 | Platform, broad |
| `manifest-v3` | 7,465 | Current extension standard |
| `bollywood` | 76 | Audience: Hindi film songs |
| `hindi` | 778 | Audience: Hindi titles |
| `pkce` | 598 | Developers: the official Spotify login |
| `javascript` | 711,103 | Language filter; no build step |

Not used on purpose: `awesome`, `open-source` and other generic tags (they add noise and no search value), and any YouTube or Spotify logo topics.

## 4. Website field

In the same **About** dialog, set **Website** to:

```
https://kushagramehta.github.io/Dhaara/
```

Leave "Releases" and "Packages" ticked only if you create a release (see section 7).

## 5. Social preview image

GitHub uses this image when the repository link is shared on Slack, Discord, X and similar.

1. Open the repository on GitHub, then **Settings > General**.
2. Scroll to **Social preview** and click **Edit > Upload an image**.
3. Upload `docs/site/assets/social-preview.png` (1280 x 640 pixels, well under the 1 MB limit; GitHub recommends 1280 x 640 and a minimum of 640 x 320).
4. To check it, paste the repository link in a private Slack or Discord message and look at the unfurl. If you change the image later, platforms may cache the old one for a while.

The landing page has its own Open Graph and Twitter tags that point to `assets/social-preview.png`, so the same image shows when the website link is shared. That one needs no upload.

## 6. Switch on the website (GitHub Pages)

The workflow `.github/workflows/pages.yml` publishes **only** `docs/site/`. The rest of `docs/` (decisions, reviews, design notes, this folder) is not published.

1. Push the repository to GitHub (branch `main`).
2. Open **Settings > Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**. (This is a one-time switch. Do not pick "Deploy from a branch".)
3. Run the site build: either push any change under `docs/site/`, or open the **Actions** tab, choose **Deploy site to GitHub Pages** and click **Run workflow**.
4. When it is green, the site is at `https://kushagramehta.github.io/Dhaara/`. Open it and check: the page, `/llms.txt`, `/sitemap.xml`, and `/assets/social-preview.png`.
5. Make sure `docs/site/assets/demo.gif` has been added first, or the hero shows a broken image.

If the first run fails with a "Pages not enabled" or environment error, step 2 was not done. If it says `github-pages` environment protection rules block `main`, open **Settings > Environments > github-pages** and allow the `main` branch.

Two limits to know about, both because this is a project site under `/Dhaara/` and not a user site at the root of `kushagramehta.github.io`:

- Crawlers read `robots.txt` only at a host's root, so `docs/site/robots.txt` is mostly documentation. Nothing is blocked either way. Submit the sitemap by hand instead (next section).
- Tools that look for `/llms.txt` at the root of the host will not find it at `/Dhaara/llms.txt`. The copy at the repository root (`llms.txt`) and the link from the README and the page footer are what can be found. Treat `llms.txt` as a cheap extra, not a lever: Google says it does not affect Search, and server logs show most `llms.txt` files get no requests from AI crawlers.

## 7. Other settings that help

- **Release v0.2.0.** Create a release with a zip of the extension folder (`dhaara-0.2.0.zip`). Releases are indexed, give people a download without cloning, and a download link is a good thing to put in posts. Say in the notes that it is loaded with Load unpacked.
- **Issues on, Discussions on.** Use Discussions for "does it match this song?" and show-and-tell. Add an issue template named "Bad match" with fields for the YouTube title, the YouTube link and the right Spotify link (`CONTRIBUTING.md` already describes it).
- **Pin the repository** on your profile, and add the same description to your profile README if you have one.
- **Community profile** (Insights > Community Standards): README, LICENSE (MIT) and CONTRIBUTING are in place. Adding a short code of conduct and a security policy finishes the checklist.
- **Search consoles.** After the first deploy, add `https://kushagramehta.github.io/Dhaara/` as a URL-prefix property in Google Search Console, submit `sitemap.xml`, and import the site into Bing Webmaster Tools. Bing's index is widely reported to feed ChatGPT search and some other answer engines (not confirmed by those vendors), so this is cheap insurance.
- **Keep the README the source of truth.** The landing page FAQ mirrors the README FAQ. When you change an answer in one, change the other (and the JSON-LD block in `docs/site/index.html`).

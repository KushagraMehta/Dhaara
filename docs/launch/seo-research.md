# Search phrases, AI-answer guidance and sources (3 Nov 2026)

A short research note behind the README, landing page and listing texts. It is a working document: what was found, how sure it is, and where each point came from. Many of the sources are marketing and SEO blogs, so figures from them are marked as unverified.

## Phrases people use

No keyword-volume tool was available, so these come from the titles of pages that rank for the queries I searched, from forum thread titles, and from the names of competing tools. They show the wording, not the volume.

| Phrase | Where it showed up |
|---|---|
| `youtube mix to spotify` | The Greasy Fork userscript thread about a 404 on a YouTube Mix (the only result that deals with Mixes directly) |
| `convert youtube playlist to spotify (free)` | Converter guides; Spotlistr, FreeYourMusic, TuneMyMusic, Soundiiz |
| `transfer youtube music to spotify` | FreeYourMusic's own page title; many how-to articles |
| `youtube to spotify converter` and `youtube to spotify chrome extension` | Chrome Web Store listings (Youfy, Paradify, Tubify, Spotube) |
| `how to get songs from youtube to spotify`, `add youtube song to spotify`, `convert a youtube video to spotify playlist` | How-to articles |
| `import youtube playlist(s) into spotify`, `import youtube music library into spotify` | Spotify Community threads |
| `tunemymusic alternative`, `soundiiz alternative`, `freeyourmusic alternative` | AlternativeTo and comparison pages |
| "source not found", "only imports and exports" | An r/Soundiiz thread about auto-generated uploads (not about Mixes) |

**Hindi and Hinglish.** I found no measured Hinglish queries. The Hinglish search I ran returned generic English-language converter pages. Plausible phrasings (guesses, unverified) are: "youtube playlist ko spotify mein kaise daale", "youtube se spotify mein song kaise add kare", "youtube mix spotify par kaise le", and in Devanagari "यूट्यूब प्लेलिस्ट स्पॉटिफाई में कैसे ट्रांसफर करें". Do not stuff these into the pages. If you want to test demand, write one honest Hinglish answer (for a Hindi-language post or a Hindi listing) and watch whether it gets any search impressions in Search Console.

**Reddit.** Reddit blocked direct reads, so the exact wording of Reddit questions could not be collected. Search the phrases above on Reddit by hand after launch and add the real wording to the FAQ.

## What the pages target

Top five phrases used in the H1, definition, FAQ questions and descriptions: `youtube mix to spotify`, `convert youtube playlist to spotify`, `transfer youtube music to spotify`, `youtube to spotify chrome extension`, `youtube playlist to spotify free`. The FAQ questions are written the way people ask them, and each answer stands on its own in 2 or 3 sentences so that an answer engine can quote it without the rest of the page.

## Getting cited by AI answer engines (2025 to 2026)

- **llms.txt.** Proposed by Jeremy Howard on 3 Sep 2024: a Markdown file with an H1 name, a blockquote summary, optional paragraphs, and H2 sections of links. It is not a ratified standard. Evidence that it helps is weak: Google has said it neither helps nor hurts Search visibility, and one server-log study (Ahrefs, May 2026, reported by ppc.land) found 97% of llms.txt files got zero requests. Adoption figures conflict by study. So `llms.txt` here is a cheap, low-expectation extra, and the real work is in the pages. Sources: https://dev.to/searchless_ai/llmstxt-adoption-in-2026-only-586-of-top-sites-use-it-but-early-data-reveals-a-clear-signal-39na, https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/, https://codersera.com/blog/llms-txt-complete-guide-2026/
- **Structured data.** Google's guidance, as reported by several SEO sources, says AI Overviews need no special markup; a page must be indexed and eligible to show a snippet. Standard schema.org markup is still good practice for understanding the page. One source reports that FAQ rich results no longer show in Google Search (it is a deprecation; sources disagree on dates). So the FAQPage and SoftwareApplication JSON-LD is there for clarity for crawlers and answer engines, not for a rich result. Sources: https://dev.to/searchless_ai/googles-official-ai-search-optimization-guide-debunks-half-the-geo-industry-3ap5, https://www.writtenlyhub.com/news/google-aeo-geo-still-seo-official-guide
- **Answer style.** Most guides agree: answer-first paragraphs, question-style headings, self-contained answers, and clear, factual statements; different engines cite different sources (one study found only about 11% overlap in cited domains between ChatGPT and Perplexity), and Perplexity can cite a fresh, well-structured page without strong Google rankings. All of this is from vendor and agency blogs, not from OpenAI, Perplexity or Google, so treat the numbers as unverified. Sources: https://dev.to/dageno_963435178f0fc9478d/how-to-get-cited-by-ai-earning-citations-from-chatgpt-perplexity-and-google-ai-overviews-3ic3, https://dev.to/searchless_ai/how-to-get-cited-by-ai-the-complete-cross-platform-methodology-for-2026-4pll, https://fixaeo.com/blogs/perplexity-citations-playbook/
- **Applied here:** the one-sentence definition appears word for word in the README, the page, `llms.txt` and the JSON-LD; comparison claims are marked "Unknown" where unverified (answer engines prefer, and users trust, a fair comparison); the FAQ is mirrored between README and page; the site is a fast static page with no scripts.
- **Not in our control:** being cited also depends on third-party mentions (Reddit threads, AlternativeTo, awesome lists, articles). That is why `directories.md` and `posts.md` matter as much as the site.

## GitHub discoverability

- **Topics:** up to 20, lowercase letters, numbers and hyphens, 50 characters each; they feed topic pages and GitHub search. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
- **Social preview:** 1280 x 640 pixels is the best size, 640 x 320 the minimum, PNG, JPG or GIF, under 1 MB; set under Settings > Social preview. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview
- **Description:** the About description can hold up to 350 characters; put the search phrase first. Guides also advise a short README with a clear purpose, a screenshot or GIF near the top, and standard sections. Sources (third-party guides, not official): https://dmtools.lab.epam.com/docs/references/workflows/github-repository-discoverability-playbook/, https://tiny.write.as/paoloamoroso/how-to-make-your-github-repos-stand-out
- **Competition on topics** (counted with the GitHub search API on 3 Nov 2026): `youtube-to-spotify` 2 repositories, `youtube-mix` 3, `playlist-converter` 38, `playlist-transfer` 28. A repository with these topics is near the top of those pages from day one.

## Competitor facts used in the comparison table

| Claim | Source |
|---|---|
| Spotify's "Import your music" (Nov 2025) opens TuneMyMusic inside the app | https://www.fonearena.com/blog/?p=469362, https://engadget.com/apps/spotify-now-includes-a-built-in-tool-for-importing-your-playlists-from-other-services-175100343.html, https://9to5google.com/2025/11/20/spotify-import-playlists-other-music-platforms/ |
| Youfy: Chrome extension, playlists capped at 50 videos, last update May 2023 (third-party directory), paid features flagged by a directory | https://chromewebstore.google.com/detail/youfy-youtube-to-spotify/bkdmpkmdoncbkipfnmhhmhklcchbjeon, https://extscope.org/extension/bkdmpkmdoncbkipfnmhhmhklcchbjeon |
| Spotlistr: original repo archived and says the site was rewritten; Apache-2.0 | https://github.com/BobNisco/Spotlistr |
| TuneMyMusic and Soundiiz free tiers have limits; no mention of Mix support found | https://alternativeto.net/software/tune-my-music/, https://alternativeto.net/software/soundiiz/ |
| Mix ids start with `RD`; other tools treat them as a special case | https://gitdab.com/w/youtube-dl/commit/652cdaa269725dfbf9effdc18a8fd0b369100399 |

The statement that link importers "usually can't" import a personal Mix is an inference from how the YouTube API works plus the owner's own testing. It has not been re-checked against each tool, which is why the table and the FAQ say so. A direct test (paste a `list=RD…` link into each importer) would settle it and is worth doing before launch.

# Launch post drafts

Drafts for the owner to review, edit and post by hand. Nothing has been posted.

## Ground rules for every post

1. **Say you are the author**, in the first lines. Every draft below does.
2. **Be honest about the limits** (Premium for the app owner, the 5-person cap, not on the Chrome Web Store yet, Chrome and Brave only). People find out anyway, and saying it first earns trust.
3. **Never ask for upvotes**, and do not ask friends to vote or comment. Hacker News and Product Hunt both forbid it, and Reddit treats it as vote manipulation.
4. **Read each community's current rules the day you post.** I could not read Reddit's rules pages from here (Reddit blocks automated reads), so every Reddit note below says what to check, not what the rules say. If a rule is unclear, message the moderators first.
5. **One community at a time, a day or more apart.** Do not paste the same text everywhere. Reply to every comment, especially bad-match reports.
6. **Before the first post:** the repository is public, `docs/site/assets/demo.gif` and the screenshots exist, a release (`dhaara-0.2.0.zip`) is up, the website is live, and you have run the whole flow once on a clean browser profile.
7. **Best order:** a quiet first week of friends and testers, then r/chrome_extensions and Show HN, then the music subreddits, then Product Hunt once the Chrome Web Store listing is approved (people expect a one-click install there).

---

## 1. r/spotify

**Note on norms.** Big music subreddits often limit self-promotion, require a flair, or send tools to a thread or a wiki page. Read the sidebar and rules first. If promotion is not allowed, ask the moderators by modmail whether a free open-source tool post is OK, or ask to be added to the subreddit's apps wiki page instead (a mirror of an r/spotify wiki "apps" page showed up in search; open the real page and check how to request an addition).

**Title:** I made a free browser extension that gets a YouTube Mix into Spotify. Feedback welcome

**Body:**

> Disclosure: I'm the author. It's free and open source (MIT), with no server, no ads and no tracking.
>
> I listen to a lot of YouTube Mixes, the auto-generated ones. Link-based importers (TuneMyMusic, Spotify's own "Import your music") never worked for me on those, and as far as I can tell that is because a personal Mix is built for you on the fly and YouTube's API doesn't return it. So I built Dhaara, a Chrome/Brave extension that reads the Mix you have open, matches each video to a Spotify song, and lets you play, queue, like, or save it as a playlist. Save the same Mix again later and it adds only the new songs.
>
> Things to know before you try it: it logs in through a Spotify developer app that you own (it fills in the form for you), and Spotify requires that app's owner to have Premium. One app can serve up to 5 people. It's not on the Chrome Web Store yet, so you install it from GitHub with "Load unpacked".
>
> The matcher is built for messy titles, including Hindi and Punjabi film songs. Every match shows how sure it is, and only the sure ones start ticked.
>
> Repo and a short GIF: https://github.com/KushagraMehta/Dhaara
>
> If it picks the wrong song, I'd really like to see it: open an issue with the YouTube title and the right Spotify link.

---

## 2. r/YouTubeMusic

**Note on norms.** Check the sidebar for the self-promotion rule, any required flair, and whether third-party tools are welcome. Lead with the problem, not the product. It reads the YouTube Music Up next queue, playlists and albums, which fits this audience.

**Title:** How do you get a YouTube Music queue or Mix into Spotify? I built a small tool for it

**Body:**

> Disclosure: I'm the author of the tool I mention below. It's free and open source.
>
> The usual playlist converters take a link to a saved playlist. That doesn't work for the Up next queue, or for a Mix that YouTube builds for you. I wanted to move those, so I wrote a Chrome/Brave extension, Dhaara, that reads the YouTube Music page you have open (Up next, playlists, albums), matches each song to Spotify, and lets you play, queue or save it.
>
> YouTube Music titles are clean, so those matches are the most accurate. Mixes from regular YouTube have messier titles, and it handles those too.
>
> Needs a Spotify developer app (Premium for the owner, Spotify's rule), and it's loaded from GitHub for now: https://github.com/KushagraMehta/Dhaara
>
> What would you want it to do that it doesn't? I'm also looking for songs it matches wrongly.

---

## 3. r/chrome_extensions

**Note on norms.** The subreddit has a "Self Promotion" flair, which suggests launch posts are expected there, but check the pinned rules for flair, disclosure and any link limits. Make it a developer-to-developer post and ask for specific feedback.

**Title:** [Self Promotion] Dhaara: an open-source MV3 extension that moves a YouTube Mix to Spotify

**Body:**

> I'm the author. Dhaara is a free, MIT-licensed MV3 extension for Chrome and Brave with no build step and no dependencies.
>
> What it does: reads the YouTube or YouTube Music page you have open (including personal `list=RD…` Mixes), matches each video to Spotify, and lets you play, queue, like or save it as a playlist.
>
> Parts that might interest this sub:
> - Spotify login is the official PKCE flow through `chrome.identity`, with a fallback tab for Brave, where the login window can fail.
> - Setup injects a content script into Spotify's developer dashboard to fill the Create app form for the user, but only during setup (registered when setup starts, removed when it ends or after 30 minutes).
> - Keyboard shortcuts via `commands`, with a toolbar badge for the result.
> - The matcher is plain JS that runs under Node, with a golden set of real titles (`node tests/run.mjs`).
>
> Feedback I'd like: is the permission set (see the README's "Permissions, and why") something you'd be comfortable with as a user, and is there anything in the setup flow that a Chrome Web Store reviewer would object to?
>
> https://github.com/KushagraMehta/Dhaara

---

## 4. Indian music subreddit

**Which one.** `r/BollywoodMusic` is the closest match by name. A data-aggregator page lists it at about 477,000 members; I could not verify that, or the rules. Confirm it exists, how active it is and what it allows. Other choices: a Hindi or Punjabi music subreddit, or `r/developersIndia` for the build story (check whether it has a weekly showcase thread).

**Note on norms.** A music-lovers' subreddit is likely to be strict about promotion. The friendliest framing is to ask for help, not to announce: ask for hard titles. Get the moderators' OK first if the rules mention self-promotion.

**Title:** Help me break a Hindi/Punjabi song matcher: which YouTube titles does Spotify search get wrong?

**Body:**

> Disclosure: I'm building a free, open-source browser extension (Dhaara) that matches YouTube songs to Spotify, and I'm trying to make it good at Hindi, Punjabi and Bollywood titles. Titles like "Chann | Udta Teer | Ayushmann Khurrana… | Sachin-Jigar, Arijit Singh", titles in Devanagari or Gurmukhi script, and Hinglish spellings (Kishor/Kishore, samajhna/samjhna) are the hard cases.
>
> It reads Devanagari and Gurmukhi script, uses the film name as a clue, and never ticks a same-name song by a different artist on its own. I test it on about 170 real titles, but I'm sure there are cases I haven't seen.
>
> If you have a YouTube link where Spotify matches the wrong song (or none), drop it here with the right Spotify link, and I'll add it to the test set. The project is free and MIT-licensed: https://github.com/KushagraMehta/Dhaara

---

## 5. Show HN

**Note on norms.** From the Show HN rules (https://news.ycombinator.com/showhn.html): it must be something people can run, be your own work, start with "Show HN", and you must not ask people to upvote or comment. Link to the repository, not the landing page, because a landing page alone does not count. Post on a weekday and stay around for the first few hours to answer. Be plain: no hype, no exclamation marks.

**Title (under 80 characters):** `Show HN: Dhaara – Move a YouTube Mix to Spotify from the browser`

**URL:** https://github.com/KushagraMehta/Dhaara

**First comment (post it right after submitting):**

> I'm the author. I wanted my YouTube Mixes in Spotify, and the playlist converters couldn't take them. A personal Mix (`list=RD…`) is generated for the viewer, and as far as I can tell the YouTube Data API doesn't return it, so a pasted link has nothing to read. Dhaara is a Chrome/Brave extension that reads the page you have open instead, matches each video to Spotify, and lets you play, queue, like or save it. A Mix saved to a playlist stays linked, and saving again adds only new songs.
>
> The part I spent the most time on is matching. Video titles are messy, especially Hindi and Punjabi film songs: Devanagari titles, Hinglish spellings, the film name in the title. The matcher cleans the title, transliterates Devanagari and Gurmukhi, runs up to 3 searches, and scores on name, artist and duration. It never ticks a same-name song by a different artist by itself. It runs under Node, and there's a golden set of real titles in `tests/` (the Spotify results in the set are simulated with decoys, so it measures the scoring, not live search).
>
> Limits, up front: you need a Spotify developer app of your own (the extension fills in the form), Spotify requires the app's owner to have Premium, and one app serves at most 5 people. "Load more songs" uses YouTube's own internal request and can break at any time. It isn't on the Chrome Web Store yet, so you load it unpacked. There's also an optional unofficial mode that uses your open Spotify web player tab; it's against Spotify's terms for the person using it, so I don't recommend it, and it's off unless you choose it.
>
> No server, no analytics, MIT. I'd like to hear about wrong matches, and about anything in the permission list that looks too broad.

**Questions to expect, with honest answers ready:** Why not the YouTube Data API? (It doesn't return personal Mixes.) Is reading YouTube's internal request allowed? (It's read-only and the same request the page makes, but YouTube's terms are strict about automated access and it can be blocked.) Why do I need Premium? (Spotify's rule for apps in Development mode since Feb 2026, not Dhaara's.) Why not Firefox? (Answer honestly: the repository targets Chrome and Brave only.)

---

## 6. Product Hunt

**Note on norms.** Launch from a personal account (company accounts are not allowed), you can submit your own product, and you must not ask people to upvote: invite them to visit and comment. Product Hunt visitors expect a one-click install, so launch **after** the Chrome Web Store listing is approved. Disclose in your first comment that you are the maker.

- **Name:** Dhaara
- **Tagline (60 characters at most):** `Move YouTube Mixes to Spotify`
- **Description (260 characters at most):** `Free, open-source Chrome and Brave extension that moves the YouTube Mix, playlist or song you're watching to Spotify. Play, queue, like or save it as a playlist that grows. Built for Hindi and Punjabi titles. No server.`
- **Topics:** Chrome Extensions, Music, Open Source, Productivity
- **Links:** website (https://kushagramehta.github.io/Dhaara/) and the repository
- **Gallery:** the demo GIF first, then the four screenshots, then the social preview image
- **Pricing:** Free, open source

**Maker's first comment:**

> Hi, I'm the maker. I built Dhaara because I wanted my personal YouTube Mixes in Spotify, and playlist converters can't read a Mix: it's generated for you, so there's no link to paste. The extension reads the page you're watching, matches each song to Spotify (with a matcher tuned for Hindi, Punjabi and Bollywood titles), and lets you play, queue, like or save it. Saving the same Mix again adds only the new songs.
>
> Honest limits: you need a Spotify developer app (the extension fills the form), Spotify requires its owner to have Premium, and it's Chrome and Brave only. It's free and MIT-licensed, with no server and no analytics. What would you want it to do next? Wrong matches are the bug I most want to hear about.

---

## 7. dev.to article outline

**Title:** How I moved my YouTube Mixes to Spotify (and why link importers can't)

**Front matter:**

```
---
title: How I moved my YouTube Mixes to Spotify (and why link importers can't)
published: false
description: A personal YouTube Mix has no link to paste. Here is how I built a browser extension that reads it, matches messy Hindi and Punjabi titles to Spotify, and saves a playlist that grows.
tags: javascript, webdev, opensource, chrome
cover_image: https://kushagramehta.github.io/Dhaara/assets/social-preview.png
---
```

(dev.to allows up to four tags. A canonical URL is only needed if the article is published somewhere else first.)

**Note on norms.** Write it as a teaching article, not an advert: the reader should learn something even if they never install it. Put a one-line disclosure near the top. Keep the repo link to the end and one mention in the intro.

**Outline:**

1. **Opening, with disclosure (about 100 words).** "I'm the author of the extension in this post." The problem: a YouTube Mix I liked, and no way to get it into Spotify. Show the failure of a link-based importer, in words (no competitor screenshots).
2. **Why a personal Mix has no link.**
   - A Mix is a playlist with an `RD…` id, built for the viewer on the fly.
   - What the YouTube Data API does and does not return for it.
   - Why that makes a pasted link useless, and why the answer is to read the page that is already open.
3. **Reading the page.**
   - A content script for the watch page and the Mix panel; the YouTube Music queue; the Short's song.
   - "Load more songs": using YouTube's own internal request, read-only, with a plain warning that it can break.
4. **Matching messy titles (the longest section).**
   - Clean the title: pipes, "(From "…")", official-video noise.
   - Transliterate Devanagari and Gurmukhi to Latin, and fold Hinglish spellings (ee/i, oo/u, w/v).
   - Use the film name as a clue, up to 3 searches per video, and score on name, artist and duration.
   - The rule that matters: a same-name song by a different artist is never ticked automatically.
   - Four short before and after examples from `tests/golden.json`.
5. **Testing it without Spotify.** The golden set of real titles, the decoys, the rule that a decoy must never score "high", the blind second set, and what the numbers do and do not prove (the candidates in the set are simulated).
6. **Logging in to Spotify from an extension.**
   - PKCE with `chrome.identity`, the Brave fallback tab, a developer app owned by the user.
   - Filling in the Create app form for the user, and why that script only runs during setup.
   - The honest constraints: the app owner needs Premium, 5 users per app, 10 search results.
7. **Saving a playlist that grows.** A linked playlist per Mix; why saving only ever adds; why that is the right trade for a Mix that refills as you listen.
8. **What I'd do differently, and what is left.** Not on the store yet, Chrome and Brave only, matching mistakes I still see.
9. **Try it / help me.** Link to the repo and `CONTRIBUTING.md`, and a request for wrong matches (the YouTube title and the right Spotify link).

**Length:** 1,200 to 1,800 words, 2 or 3 code snippets, one diagram of the flow (page, matcher, Spotify, playlist) drawn from the real design, and the demo GIF.

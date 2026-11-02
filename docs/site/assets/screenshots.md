# Screenshots and demo GIF the owner should capture

Nothing here is captured yet. The landing page and the README only show `demo.gif`; the four screenshots are kept in HTML comments until the files exist. To switch one on, save it under the exact name below, then remove the comment marks around its image in `README.md` (under the first three feature groups) and in `docs/site/index.html` (the commented block at the end of the Features section).

## Rules for every capture

- **Real product, real data only.** No mock-ups, no edited text, no invented songs or playlists.
- **No personal details.** Use a clean browser profile (no other extensions, bookmarks bar hidden, no personal tabs) and a throwaway or neutral Spotify display name. The account button, the "Playing on <device>" line and the device list can show your name, so rename the device or crop it out.
- **Do not use a personal Mix** if its songs say something private about you. A Mix seeded from a public song (`list=RD<videoId>`) is fine and is just as real. Use Hindi, Punjabi and English songs so the matching story shows.
- **No YouTube or Spotify logos** as decoration. The popup's own album art and the YouTube page that is really on screen are fine in a real capture. When in doubt, crop to the popup.
- Light mode for the GIF and screenshots 1 to 3; screenshot 4 in dark mode, to show both.

## The four screenshots

Sizes: capture a browser window of **1280 x 800** (the Chrome Web Store takes 1280 x 800 or 640 x 400, up to 5 screenshots, PNG or JPEG, no transparency). Save as PNG, at most about 400 KB each (run through `pngquant` or ImageOptim).

| File | What to show | README / site group |
|---|---|---|
| `screenshot-popup-mix.png` | The popup open over a YouTube Mix page. The address bar shows `list=RD…`. The Now Playing card is visible, with art, the matched Spotify song and its bars, and under it the tracklist with ticks and the bottom bar ("Play N Songs"). | Works on everything you watch |
| `screenshot-matching.png` | The tracklist of a Hindi/Punjabi Mix: some rows with 3 bars (ticked), one or two "Check" or "Unsure" rows showing the original Devanagari or Gurmukhi YouTube title, one "Not found on Spotify" row, and the **Review N** button. | Smart matching |
| `screenshot-save-linked.png` | The Save sheet for a Mix that is already linked: the line "Linked to <playlist>, 3 new songs since you last saved", the sheet titled "Add New Songs to <playlist>" and the button "Add 3 New Songs". To get it: save a Mix once, use **Load More Songs** or wait until the Mix refills, then reopen it. Name the playlist something neutral, such as "Dhaara demo". | Play, queue, like, save |
| `screenshot-full-view.png` | The full view (open icon in the popup) in dark mode: several Mixes combined into one list, **Select All** ticked, and Settings open showing the keyboard shortcuts and Disconnect. No account name visible. | Full view for big lists |

## The demo GIF

File: `docs/site/assets/demo.gif`. The README shows it as `docs/site/assets/demo.gif` and the landing page as `assets/demo.gif`.

- **Length and size:** 12 to 18 seconds, about **960 x 600** (the same 16:10 shape as the screenshots), 10 to 12 frames per second, under 5 MB.
- **Current file:** the first `demo.gif` is a 480 x 745 capture of the popup alone (2.5 MB). That works, and the landing page shows it at its natural size. A wider 960 x 600 capture of the browser window is optional and would suit social posts better.
- **What to show, in order:**
  1. A YouTube Mix playing (the `list=RD…` address is visible).
  2. Click the Dhaara icon. The list fills in and the bars appear.
  3. Click **Review N** and fix one match by picking a different song.
  4. Click **Save…**, choose a new playlist, click Save. The progress bar runs and the checkmark appears.
  5. Optional last second: click **Play** and show "Playing on <device>".
- **Pauses:** hold on the filled tracklist for about 2 seconds and on the success mark for about 1 second, so a reader can take it in.
- **How:** record the window with the system screen recorder (QuickTime on a Mac), then convert, for example:

```bash
ffmpeg -i demo.mov -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" -loop 0 docs/site/assets/demo.gif
```

(`gifski` gives a smaller, better GIF if you have it: `gifski --fps 12 --width 960 -o demo.gif frames/*.png`.)

## Other store images (only when you list on the Chrome Web Store)

- **Small promo tile**, 440 x 280 PNG or JPEG: the icon, "Dhaara" and the tagline, in the style of `social-preview.svg`.
- **Marquee**, 1400 x 560, optional.
- Reuse `social-preview.svg` as the starting point. It uses only the Dhaara icon and no third-party logos.

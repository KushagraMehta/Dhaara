# Contributing to Dhaara

Thanks for helping. Dhaara is plain JavaScript with no build step and no dependencies, so a change is usually a small edit and a reload.

## Load it unpacked

1. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. After you edit a file, click the reload arrow on Dhaara's card. For `content.js` changes, also reload the YouTube tab.

## Run the tests

You need Node. The tests are offline: no network, no Spotify.

```bash
node tests/run.mjs        # the golden set of real YouTube titles against match.js
node tests/folds.mjs      # Hindi/Punjabi transliteration and Hinglish spelling folds
node tests/run.mjs --file tests/holdout.json   # the second set
```

Both commands exit with code 1 on a failure. The rule that matters most: **a wrong song must never score "high"** (the runner prints `Decoys scoring high 0`, and it must stay 0). If you change `match.js`, run both commands and include the headline numbers in your pull request.

## Code style

- Plain JavaScript (ES modules), no framework, no bundler, no transpiler, no npm dependencies.
- `match.js` stays pure (no `chrome.*`, no network) so it runs under Node.
- No analytics, no remote code, no external fonts or scripts. Requests go only to YouTube and Spotify.
- UI follows `DESIGN.md`: system font, the colour tokens in `styles.css`, and a reduced-motion fallback for any animation.
- Keep user-facing text plain and short. Say what happened and what to do next.
- Do not add "YouTube" or "Spotify" to the product name. Describing what Dhaara does with them is fine.

## Report a bad match

A wrong or missing match is the most useful bug report. Open an issue and include:

1. **The YouTube title** exactly as YouTube shows it, and the video link (`https://www.youtube.com/watch?v=…`).
2. **The right Spotify link** (`https://open.spotify.com/track/…`).
3. What Dhaara picked instead, and how many bars it showed.
4. Optional: the channel, and whether it was a Mix, a playlist or YouTube Music.

If you can, add the title to `tests/golden.json` (same format as the other items: the real title, the expected song and artist, and the tags that fit) and open a pull request. A fix to the matcher should come with a golden item that fails before it and passes after it.

## Pull requests

- One change per pull request, with a short description of what it does and why.
- Say how you tried it (which browser, which kind of page) and paste the test summary if you touched `match.js`.
- Do not commit your Spotify Client ID, tokens or personal Mix content.

## Security and privacy issues

If you find a problem that could expose a user's data, please open a private security advisory on the repository instead of a public issue.

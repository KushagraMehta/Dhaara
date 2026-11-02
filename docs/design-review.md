# Design review: popup and full view (3 Nov 2026)

## Grilling

1. **Is the label card the one bold thing?** Not yet. Marigold shows up about 18 times above the fold (checkboxes, meters, Play 7, "to look at").
2. **Does the handwriting mean anything?** No. Unmatched YouTube titles are also set in Kalam. It should mean "found on Spotify".
3. **Does it render where it ships?** Not reliably. Fonts load from Google on every popup open; until then, or offline, `cursive` shows Apple Chancery or Comic Sans.
4. **Is the numbering earned?** Yes, a Mix plays in order. But the list does not show where you are in it, and "Play 7" reads as "play track 7".
5. **Does each state encode one thing?** No. `.prow.off` fades both "unticked" and "not found", so the row that needs action is the faintest (2.6:1).
6. **Can everyone fix a match in two clicks?** No. Rows are a mouse-only `div`; the card's fix is an unlabelled pencil even when doubtful.
7. **Is colour the only signal?** Nearly. Popup rows for "check" and "unsure" show no word, and unlit bars are 1.5:1, so 2 bars and 3 bars look alike.
8. **Is the motion earned?** No. Every pending row pulses, so 25 to 50 rows shimmer at once.
9. **Does each action keep its name?** No. "Save" means Liked Songs and a playlist, the result says "Added", and the full view renames all three actions.
10. **Is feedback where the action happened?** No. Results go to the bar, errors to a top toast. On a single video the bar is hidden, so a card Play confirms nothing.
11. **Is the Indian-music grounding more than skin?** Partly. Film songs are known by their film, but the film is buried in `(From "Saiyaara")`; `match.album` already has it.
12. **Does the full view match the popup?** Same tokens, but identical bordered cards, pills, comma-joined meta, and a toast over the header. DESIGN.md does not cover it.
13. **Which accessory goes?** The label's drop shadow. A floating label reads as a dialog.

## Changes, in priority order

1. **Keyboard-reachable row fix.** Add a real button (or `role=button`, `tabindex=0`, Enter/Space and `aria-expanded`). popup.js `row()`. M.
2. **Kalam only for the Spotify match name.** YouTube titles use Hind. popup.js `renderNow` else-branch. S.
3. **Quiet the sure state.** Checkbox with a dust outline and chalk tick; `.vu.l3` in dust, l2/l1 in marigold, l0 in rec; unlit bars as a dust outline. styles.css `input[type=checkbox]`, `.vu`. S.
4. **Fade only unticked rows.** Not-found rows stay at full contrast with a visible Search button. popup.js `row()`, styles.css `.prow.off`. S.
5. **Bundle the fonts.** Hind and Kalam woff2 (Latin and Devanagari), Google links removed, `--hand` falls back to `var(--sans)`. styles.css, popup.html, import.html. S.
6. **Mark the now-playing row.** `aria-current`, plus a playing mark in place of the number. popup.js `row()`. S.
7. **One feedback place.** Move `#job` out of `#bar` so it shows without the bar, and route toast errors into it. popup.html, popup.js `renderJob`/`run`. S.
8. **Pulse only while searching.** Pending meters stay still. Add "N still searching" to the popup meta. ui.js `meter()`, popup.js `renderMeta`. S.
9. **"N to look at" becomes a button.** It scrolls to the next doubtful row and opens it. popup.js `renderMeta`, import.js `renderStats`. S.
10. **"Not this song?" on doubtful cards.** A text button next to Queue. popup.js `renderNow`. S.
11. **Remove the label shadow.** styles.css `.label-card`. S.
12. **Move the footer links into the header.** "Open full view" becomes an open icon, Settings moves to the account chip, and `.pop-foot` goes. Frees 30px. popup.html, popup.js `init`. S.
13. **Tape-deck keys instead of pills.** Buttons get a 4px radius, and the bar becomes one joined row of keys. styles.css `button`, `.bar-btns`. S.
14. **Fix the save sheet.** Move focus in on open, Esc closes, focus returns to the trigger, and the bar hides while it is open. popup.js `openSheet`. S.
15. **Meter instead of % for alternatives.** ui.js `changePanel`. S.
16. **Full view clean-up.** Give duration its own spot (not ", 2:55") and put the copy result in `#result`, not a toast. import.js `youtubeCell`, `copyLinks`. S.
17. **Film or album on the card sub-line.** Strip `(From "X")` from the title when it matches (owner Q3). popup.js `renderNow`. M.
18. **Cassette mark in place of the play triangle.** icons/. M.

## Copy (before → after)

- Play 7 → Play 7 songs
- Save to Liked Songs / Saved to your Liked Songs. → Add to Liked Songs / Added to Liked Songs.
- Save to Spotify (sheet), Save to a playlist (+) → Save to playlist
- Added 7 songs. → Saved 7 songs to Mix – Tum Se Tum Tak.
- From YouTube: (card) / On YouTube: (row) → On YouTube: in both
- Not on Spotify. Click to search. → Not found on Spotify, plus a Search button
- Finding on Spotify… / Searching → Searching Spotify…
- Connect Spotify to find this song (on every row) → said once, on the login card
- Create playlist with 7 songs / Play now / Add to queue → Save 7 songs / Play / Queue
- Ctrl/Cmd+V → ⌘V on Mac, Ctrl+V elsewhere
- Spotify 403: … → Spotify refused this account. Add it under User Management in your Spotify app, then try again.
- Nothing selected → Tick at least one song first.
- Could not read the page: … → Could not read this YouTube page. Reload it, then click the icon again.
- Popup setup text: add "Your Spotify account needs Premium." Today only the full view says this.

## Accessibility

- The row fix is mouse-only (change 1).
- Controls need the song in their names: "Include", "Change" and "✕" repeat on every row, and "✕" is announced as "multiplication sign". Use `aria-label` names such as "Include Safar".
- `#toast`, `#job` and `#result` need `role="status"`.
- Contrast: `.from-yt` is 4.0:1 at 12px (ink at .7 gives 5.4:1). Faded rows are 2.1 to 2.6:1. Unlit bars are 1.4 to 1.5:1.
- Some information is hover-only: the row tooltip, the meter word, and the copy-links instructions.
- The heart has `aria-pressed` but cannot be unpressed.
- The focus ring and reduced-motion handling are good; keep them.

## Questions for the owner

1. Should the card's Play mean "play from here" (this song plus the ticked songs after it), not one song?
2. "Check this one" matches start ticked, but `isTicked` says a doubtful match is never added silently. Should they start unticked?
3. Show the film name on the label and strip `(From "…")` from titles?
4. Should the full view carry the cassette identity or stay a plain work surface?
5. May the icon become a cassette?
6. Is Play the main action in the popup and Save the main action in the full view on purpose?

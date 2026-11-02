# Apple-style redesign (3 Nov 2026)

Owner's verdict on the cassette design: "Current design is bad. Make the design like Apple and polished." Later: "Also add Apple-like animations."

This file replaces the direction in the old DESIGN.md. Decisions 1 to 17 in `docs/decisions.md` stand; this spec builds on them (play from here, film name, link back to Spotify, system fonts, one look for popup and full view, only sure matches start ticked, the no-setup login).

**Method:** the apple-design skill (Apple HIG pages pulled June to October 2026) plus a self-grill, because the owner was not available. Citations read `page.md › Heading` and refer to the HIG pages in that skill. Where no page covers a point, it says **judgement**.

**Direction in two sentences:** the popup behaves like a macOS menu bar popover: quiet grey chrome, white grouped content, system type, one blue accent, and colour that comes only from the album art. The one thing it is remembered by is the Now Playing card: big artwork with a soft glow drawn from the artwork itself, the Spotify match beside it, and a signal-strength glyph that says how sure the match is.

---

## 1. Context

| | |
|---|---|
| Platform | Chrome/Brave MV3 extension. The toolbar popup (max 800 × 600) and a full-page "full view" tab. Desktop, pointer and keyboard. Owner on macOS, public users also on Windows and Linux |
| Framework | Plain HTML, CSS and ES modules. HIG terms translate as in `cross-platform.md`: semantic colours become CSS custom properties, Dynamic Type becomes the browser font-size setting, SF Symbols become our own icon set |
| Single job | See the Spotify version of the song playing on YouTube, then play, queue, like or save it; then the same for the whole Mix. Fix a wrong match in two clicks |
| Thesis | "The song you hear, on Spotify, one click away" |
| What this cannot do | Real translucency over the desktop (the popup is opaque), the system accent colour (Chrome does not expose `AccentColor`), SF Symbols or a bundled SF font (licence) |

## 2. Grilling (self), with answers

Each question is the hard version; each answer is what the design does.

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | What is the popup, in Apple's terms? | A popover anchored to a toolbar item. It holds a few related tasks, closes when people click away, and never loses work when it does (ticks and picks already live in storage). It must not grow or jump in size: once a list is showing, the popup takes its full 600 px height, so rows arriving do not resize the window | `popovers.md › Best practices`: "Use a popover to expose a small amount of information or functionality", "Always save work when automatically closing a nonmodal popover", "Provide a smooth transition when changing the size of a popover" |
| 2 | Should the popup show the app name and logo? | Only when there is nothing more useful to say (first run, not a YouTube page): then the header reads "Dhaara" with the icon. Otherwise it carries a useful title ("Now Playing", then the Mix title once you scroll to it) and two controls. The full view's toolbar shows the brand at rest and the list name once you scroll past it | `toolbars.md › Titles`: "Don't title windows with your app name." `branding.md`: "Resist the temptation to display your logo throughout your app" |
| 3 | Where does colour come from? | From the content. Chrome is neutral grey and white; the album art and its glow carry the colour. One accent (blue) marks what you can press and the one primary action | `branding.md`: "To express your brand through color, consider moving it into the content layer." `color.md › Liquid Glass color`: brand colour as accent works "in apps with primarily monochromatic content or backgrounds" |
| 4 | Which accent, and how much? | Blue, tuned for contrast in both appearances (table 3.1). Not Spotify green (borrows their brand) and not YouTube red (reads as an error). At most one filled prominent button per view; a second primary on screen uses the tinted style | `buttons.md › Style`: "Keep the number of prominent buttons to one or two per view." `color.md › Best practices`: "Avoid using the same color to mean different things" |
| 5 | Light and dark? | Both, from `prefers-color-scheme`, with no in-app switch. Dark uses the "elevated" greys because a popover sits in front of other windows | `dark-mode.md › Best practices`: "Avoid offering an app-specific appearance setting." `dark-mode.md › Mobile`: popovers use elevated backgrounds |
| 6 | How much contrast? | 4.5:1 minimum for all text, including secondary text and placeholders; 3:1 for control borders and glyphs that carry meaning. Every token in 3.1 shows its number | `accessibility.md › Vision` (contrast table); `dark-mode.md`: "no lower than 4.5:1 … strive for … 7:1, especially in small text" |
| 7 | Which typeface? | The system stack: SF on macOS, Segoe UI on Windows, the distro font on Linux. Hind and Kalam (Google Fonts) are removed, so nothing loads from Google. Devanagari falls back to Kohinoor Devanagari or Nirmala UI | `typography.md › Using system fonts`; developer note: "don't embed system fonts" |
| 8 | What sizes? | The macOS text styles, 13 px body, 11 px floor (macOS minimum is 10). No light or thin weights. Ramp in 3.2 | `typography.md › Specifications` (macOS built-in text styles); "In general, avoid light font weights" |
| 9 | Does text scale? | Yes. Type sizes are in `rem`, and the popup width is `24rem`, so Chrome's font-size setting scales the whole popup (384 px at the default, up to 576 px at "Very large"). Titles wrap to two lines before they truncate | `accessibility.md › Vision`: "give people the option to enlarge text by at least 200 percent"; `typography.md › Supporting Dynamic Type`: "Keep text truncation to a minimum" |
| 10 | Where can blur go? | Only on the functional layer: the sticky header, the bottom bar and the save sheet. Never on the card or rows. Bars are clear at rest and pick up the material and a hairline only when content scrolls beneath them (a scroll edge effect). Reduced transparency and increased contrast get opaque bars | `materials.md › Liquid Glass`: "Don't use Liquid Glass in the content layer." `layout.md › Visual hierarchy`: "use a scroll edge effect". `liquid-glass.md › Tauri and Electron` for the CSS values |
| 11 | What is the list? | An inset grouped list: a section header outside a rounded white group, text-first rows, separators inset to the text. Numbering stays because a Mix plays in order | `lists-and-tables.md › Best practices`: "Prefer displaying text in a list or table"; `layout.md`: "Group related items", "use indentation to convey hierarchy" |
| 12 | How does a row say how sure the match is, without relying on colour? | A signal-strength glyph (3 ascending bars, like Wi-Fi or cellular bars): 3 filled = sure, 2 = check, 1 = unsure, none + text = not found. Sure is quiet grey; doubtful rows add the word ("Check", "Unsure") and the YouTube title underneath. Unfilled bars are outlined at 3:1, so 2 and 3 bars never look alike | `accessibility.md › Vision`: "Convey information with more than color alone"; `gauges.md › macOS`: discrete level indicator segments "fill completely — never partially" |
| 13 | Checkbox or switch, and how is "all" handled? | Checkboxes (an editable checklist), drawn to look like macOS ones: filled accent with a white tick when on. "Tick all / Untick all" becomes one checkbox in the section header with a mixed state | `toggles.md › Checkboxes`: "In an editable checklist, a checkbox can appear without a title", "show a mixed state when the subordinate checkboxes have different states" |
| 14 | Which action is primary? | Popup: "Play N Songs" in the bottom bar (the daily loop is listening). Full view: "Save N Songs" (it is the work surface for playlists). The primary sits on the trailing side | `toolbars.md › Actions`: "Only specify one primary action, and put it on the trailing side of the toolbar." **Judgement** on which one, given decisions 3 and 7 |
| 15 | Where do the full view's actions go? | Top toolbar, not a bottom bar: a browser window's bottom edge is often off-screen. The popup keeps its bottom bar because the browser always shows the whole popup | `layout.md › macOS`: "Avoid placing controls or critical information at the bottom of a window." **Judgement** for the popup exception |
| 16 | Popup and full view: one look? | Yes (decision 13). Same tokens, row anatomy, signal glyph and copy. The full view adds columns, not a new style | `toolbars.md › Item groupings`: "Keep consistent groupings and placement across platforms" |
| 17 | Where does feedback appear? | In one status line (`#job`, `role=status`) pinned at the bottom of the popup, above the bar when there is one, and under the toolbar in the full view. It stays until the next action (no 4-second toasts). Errors say what to do next | `feedback.md › Best practices`: "Consider integrating status feedback into your interface"; `accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements"; `writing.md`: "Write clear error messages" |
| 18 | How does the save sheet behave? | One sheet at a time, sliding up over a dimmed popup. Title, a labelled "Playlist" pop-up (native select) defaulting to "New Playlist", a name field, "Make Public", then Cancel and "Save N Songs" (primary, responds to Return). Esc and Cancel close it; focus goes in on open and back to the trigger on close | `sheets.md › Desktop`: "The parent window is dimmed while the sheet is onscreen"; `sheets.md`: "Provide an alternative to the Done button"; `buttons.md › Role`: primary "responds to the Return key"; `pop-up-buttons.md`: "Provide a useful default selection", "an introductory label" |
| 19 | How do people find a different song? | Inside the row, a disclosure opens an inline search field prefilled with the cleaned title. It searches as you type (300 ms debounce), shows up to 10 results as mini rows with the signal glyph, and marks the current match with a checkmark | `search-fields.md › Best practices`: "start search immediately when a person types"; `search-fields.md › Search as an inline field` |
| 20 | How are searching and loading shown? | A small spinner only on rows actively searching; waiting rows stay still. The popup shows a skeleton card if reading the page takes longer than 250 ms | `progress-indicators.md › macOS`: "Prefer an activity indicator (spinner) … when space is constrained", "Avoid labeling a spinning progress indicator"; `loading.md`: "Show something as soon as possible" |
| 21 | Which icons? | Our own outline set on a 20 px grid with a 1.5 px stroke (the weight of 13 px regular text), round caps. Familiar metaphors: play, queue, heart, plus, swap, magnifier, chevrons, close, expand, checkmark. Every icon-only control has an `aria-label` and a tooltip | `icons.md › Best practices`: "Maintain visual consistency", "match the weights of interface icons and adjacent text", "Provide alternative text labels" |
| 22 | The toolbar icon? | The product is now **Dhaara** ("stream, flow"). A blue squircle with one white ribbon that starts as a fine point and widens as it flows up and out to the right. No text, no play triangle in a rounded rectangle (YouTube's mark), no circle with arcs or green (Spotify's). The 16 and 32 px versions are full bleed so the wave still reads in the toolbar | `app-icons.md › Design`: "Embrace simplicity", "Include text only when it's essential"; `branding.md`: trademark rules |
| 23 | Spotify attribution and link back (decision 17)? | Every Spotify song has a visible way to open it on Spotify: the card's title and artwork, the row's artwork and the title in the open panel, each alternative's art, and the full view's title. The card also carries an "Open in Spotify" link. No Spotify logo asset and no Spotify green | **Judgement**, from Spotify's developer policy as summarised in `docs/feature-ideas.md` |
| 24 | How much motion? | One orchestrated entrance, springs on the sheet and disclosures, small confirmations on success, a determinate bar for the queue. Nothing loops except an in-progress spinner. Reduced motion keeps cross-fades only. Section 3.7 | `motion.md › Best practices`: "Add motion purposefully", "Make motion optional"; `motion.md › Providing feedback`: "Aim for brevity and precision", "generally avoid adding motion to UI interactions that occur frequently", "Let people cancel motion" |
| 25 | Where are Settings? | In the full view, reached from the account button in both surfaces. It shows the sign-in mode (official app or the no-setup Spotify tab) and lets you switch | `designing-for-macos.md`; **judgement** (an extension has no app menu) |
| 26 | Remove one accessory? | Removed: the brand header, the bottom links row, the dashed "load more" button, the label's drop shadow, percentage scores, and the "→" column in the full view | Skill step "Remove one accessory" |

## 3. Design system

### 3.1 Colour tokens

Values are ours, set close to the familiar Apple greys; they are not system colours (a web page cannot read those). Contrast is WCAG, computed from the hex values.

**Light**

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--bg` | `#F2F2F7` | Window background (behind groups) | |
| `--group` | `#FFFFFF` | Grouped content: card, list group, sheet | |
| `--label` | `#1D1D1F` | Primary text | 16.8 on group, 15.1 on bg |
| `--label-2` | `#6A6A70` | Secondary text, placeholders | 5.4 on group, 4.8 on bg |
| `--label-3` | `#8E8E93` | Unfilled glyph outlines, checkbox border, disabled | 3.3 on group (non-text) |
| `--separator` | `rgba(60,60,67,.16)` | Hairlines (decorative) | |
| `--fill` | `rgba(120,120,128,.12)` | Secondary button, search field, art placeholder | |
| `--fill-2` | `rgba(120,120,128,.08)` | Row hover, skeleton | |
| `--press` | `rgba(0,0,0,.06)` | Pressed overlay | |
| `--accent` | `#0066CC` | Filled primary, checkbox on, focus ring | white on it 5.6 |
| `--accent-text` | `#0066CC` | Text buttons, links, "playing" glyph | 5.6 on group, 5.0 on bg |
| `--accent-tint` | `rgba(0,102,204,.12)` | Tinted button background | accent text on it 4.7 |
| `--warn` | `#A35200` | "Check" / "Unsure" word and bars | 5.6 on group |
| `--danger` | `#D70015` | Not found, errors | 5.4 on group |
| `--scrim` | `rgba(0,0,0,.2)` | Behind the sheet | |
| `--bar` | `rgba(242,242,247,.8)` | Material fill for header, bar, sheet | |

**Dark** (elevated, because the popup floats in front)

| Token | Value | Contrast |
|---|---|---|
| `--bg` | `#1C1C1E` | |
| `--group` | `#2C2C2E` | |
| `--label` | `#F5F5F7` | 12.8 on group |
| `--label-2` | `#A1A1A6` | 5.4 on group, 6.6 on bg |
| `--label-3` | `#8E8E93` | 4.3 on group (non-text) |
| `--separator` | `rgba(255,255,255,.1)` | |
| `--fill` | `rgba(120,120,128,.24)` | |
| `--fill-2` | `rgba(120,120,128,.14)` | |
| `--press` | `rgba(255,255,255,.08)` | |
| `--accent` | `#0A6CFF` | white on it 4.6; 3.05 against group (non-text) |
| `--accent-text` | `#4DA3FF` | 5.3 on group, 6.5 on bg |
| `--accent-tint` | `rgba(77,163,255,.16)` | accent text on it 4.7 |
| `--warn` | `#FFB340` | 7.8 on group |
| `--danger` | `#FF6961` | 4.9 on group |
| `--scrim` | `rgba(0,0,0,.4)` | |
| `--bar` | `rgba(28,28,30,.78)` | |

**Increased contrast** (`prefers-contrast: more`): `--label-2` becomes `#4C4C51` light (7.7) and `#C7C7CC` dark (8.3); separators double their alpha; control borders use `--label-2`; bars and sheet become opaque. **Forced colours** (Windows High Contrast): system colours, borders on every button, the signal glyph in `CanvasText`.

Alternative if the owner keeps the old marigold (owner question 1): `--accent` `#FFB020` with a `#1D1D1F` label (9.2), `--accent-text` `#9A5C00` light (5.4) and `#FFB020` dark (7.6).

### 3.2 Type ramp

Stack: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "Noto Sans", "Helvetica Neue", Arial, "Kohinoor Devanagari", "Nirmala UI", sans-serif`. Numbers that line up (durations, indexes, counts) use `font-variant-numeric: tabular-nums`. Sizes are in rem in CSS (px below at the default 16 px root).

| Style | Size / line | Weight | Used for |
|---|---|---|---|
| Large Title | 26 / 32 | 700 | Full view page title |
| Title 2 | 17 / 22 | 600, −0.2 px | Now Playing song title, first-run title |
| Title 3 | 15 / 20 | 600 | Header title, section titles, sheet title |
| Body | 13 / 18 | 400 | Paragraphs, buttons (500) |
| Row title | 13 / 16 | 500 | List row title |
| Callout | 12 / 16 | 400 | Artists and album, meta lines, feedback line |
| Caption | 11 / 14 | 500 | Index numbers, status words, durations, column headings |

Semibold (600) on Segoe UI exists; 500 falls back to 400 there, which is fine.

### 3.3 Corner radii

| Radius | Where |
|---|---|
| 4 px | Row artwork 40 px, alternative artwork 32 px, checkbox |
| 6 px | Card artwork 76 px |
| 8 px | Row hover and open highlight (inset 4 px in a 12 px group, so concentric), search field, pop-up |
| 12 px | Groups (list, setup card, settings) |
| 16 px | Now Playing card, sheet top corners |
| capsule | All push buttons |

Concentric rule: an inner shape's radius = outer radius − the inset between them (`toolbars.md`: corner radii "concentric with bar corners").

### 3.4 Spacing and sizes

4 px grid: 4, 8, 12, 16, 20, 24, 32. Popup margins 12; group padding 12; row padding 6 vertical, 8 horizontal. Controls: icon buttons 28 × 28 (macOS default), push buttons 28 tall in the card and 32 tall in bars, checkbox 16 inside a 28 × 28 hit area. 8 px minimum between adjacent controls (`accessibility.md › Mobility`: "Consider spacing between controls as important as size"). Popup: `24rem` wide, at most 600 px tall.

### 3.5 Materials

| Surface | Material | Fallbacks |
|---|---|---|
| Popup header, popup bottom bar, full-view toolbar | `--bar` fill + `backdrop-filter: blur(20px) saturate(1.8)`, with a hairline that appears only while content is underneath | Opaque `--bg` under `prefers-reduced-transparency: reduce` or `prefers-contrast: more` |
| Save sheet | `--group` at 92% + blur 30 px, over `--scrim` | Opaque |
| Card, rows, groups | Opaque. No blur in content | |
| Artwork glow | A second copy of the cover, blurred 18 px, 50% opacity, scaled 0.9 and nudged down 6 px, behind the cover only | Owner question 2; a neutral shadow if declined |
| Artwork | Unaltered, with a 0.5 px inner hairline so white covers keep an edge on a white card (`dark-mode.md`: icons "might need a subtle dark outline") | |

### 3.6 Iconography

20 × 20 viewBox, 1.5 px stroke, round caps and joins, drawn at 16 px next to 13 px text. Filled only where the filled shape is the meaning: play, heart (liked), checkmark circle (success), the signal bars. Set: `play`, `queue` (three lines with a small play head at the end), `heart` / `heartFill`, `plus`, `swap` (two opposed arrows: choose a different song), `search`, `chevronDown`, `close`, `expand` (open full view), `open` (arrow out of a box: Open in Spotify), `check`, `checkCircle`, `warn` (exclamation in a circle), `speaker` (now playing), `more`, `person`.

Signal glyph: three bars 3 px wide, 2 px apart, 5 / 8 / 11 px tall, radius 1.5. Filled bars use the state colour (sure `--label-2`, check and unsure `--warn`); unfilled bars are a 1 px `--label-3` outline.

### 3.7 Motion

`motion.md` asks for motion that is purposeful, brief and optional. Every animation below answers a click or a state change, runs 150 to 350 ms, and only the in-progress spinner loops.

**Easing tokens.** Springs written with CSS `linear()` (Chrome 113+), sampled from a damped spring that settles inside its duration; each has a `cubic-bezier` fallback declared first and overridden under `@supports (transition-timing-function: linear(0, 1))`.

| Token | Feel | `linear()` (damping) | Fallback | Duration |
|---|---|---|---|---|
| `--ease-smooth` | No overshoot, for sizes and fades | ζ = 1.0, 21 points | `cubic-bezier(.32,.72,0,1)` | `--dur-2` 250 ms |
| `--ease-snappy` | 2% overshoot, for the sheet and the entrance | ζ = 0.78, 29 points | `cubic-bezier(.25,1.1,.5,1)` | `--dur-3` 350 ms |
| `--ease-bouncy` | 9% overshoot, only for success marks | ζ = 0.6, 37 points | `cubic-bezier(.34,1.56,.64,1)` | `--dur-3` 350 ms |
| `--ease-out` | Colour and opacity changes | | `cubic-bezier(.2,0,0,1)` | `--dur-1` 150 ms |

**Moments.**

| Moment | What moves | Spec |
|---|---|---|
| First paint of the popup | One entrance for the content, not per element | When the page has been read, `#main` fades in and rises 6 px, then the list group follows 60 ms later; 350 ms `--ease-snappy`. Rows inside do not stagger. The header never moves |
| Save sheet | Sheet slides up; the popup behind dims | Sheet `translateY(100%) → 0`, 350 ms `--ease-snappy`; scrim opacity 0 → 1, 250 ms. Closing: 200 ms `--ease-smooth`, then `hidden` |
| Row search panel | Height expands and collapses | Web Animations on `height` 0 → measured and back, 250 ms `--ease-smooth`, opacity with it. The row the user clicked never moves; only rows below it shift |
| Button press | Small scale-down | `:active { transform: scale(.97) }`, 100 ms in, 150 ms out. Icon buttons scale .92 |
| Checkbox tick | Box fills, tick draws | Fill colour 150 ms; the tick reveals left to right (`clip-path` inset) 200 ms `--ease-smooth` |
| Now Playing card changes song or match | Artwork and title cross-fade | Same-document View Transition with `view-transition-name: np-art` and `np-text`, 300 ms; skipped when the API is missing |
| "Load more" rows | New rows settle in | Each new row fades in and rises 8 px with a 30 ms stagger, capped at 10 rows (the rest appear with the tenth). Transform only, so nothing above them moves |
| Match indicator | Bars fill once the search finishes | Bars grow from the baseline one after another (`scaleY` .3 → 1, 40 ms stagger, 250 ms `--ease-snappy`) only on the render where the status changes from searching to a result |
| Queue progress | Determinate bar in the status line | 2 px bar under the message, `transform: scaleX(done / total)` with a 200 ms `--ease-smooth` transition |
| Success | Mark confirms | On a finished job the status glyph becomes a checkmark that draws in (stroke-dashoffset, 300 ms) and scales from .6 with `--ease-bouncy`. Like: the heart fills and pops once to 1.15 |
| Header title | Swaps when the Mix header scrolls under it | Cross-fade 150 ms ("Now Playing" → Mix title) |
| In progress | Spinner | 12 px spinner, 0.8 s per turn, the only loop |

**Reduced motion** (`prefers-reduced-motion: reduce`): no transforms or height animation. The sheet, entrance, rows and success marks only cross-fade (150 ms); the panel appears instantly; the spinner becomes a static "…" glyph; View Transitions keep their default cross-fade only. **Never** animate something that moves the control the user is about to click: no motion on hover, no layout animation above the pointer, and the entrance finishes before the first click is likely (350 ms).

## 4. Components

### 4.1 Popup header (toolbar)

Sticky, 44 px. Leading: title (Title 3), "Now Playing" when a song is open, the source type otherwise; it cross-fades to the Mix title when the Mix header scrolls under it. Trailing: `expand` icon button ("Open Full View") and the account button (24 px avatar in a 28 px hit area; tooltip and label "Spotify account: <name>. Settings"). Clear at rest; material and hairline when scrolled.

### 4.2 Now Playing card

```
┌ card 16r, padding 12 ───────────────────────────────┐
│ ┌──────┐  Tum Se Tum Tak                ← Title 2,   │
│ │ art  │  Niyam, Shreya Ghoshal            2 lines   │
│ │ 76px │  Saiyaara                       ← album/film│
│ └──────┘  ▂▄▆ Sure match · 3:38   Open in Spotify ↗  │
│ [▶ Play] [Queue]                    [♡] [+] [⇄]      │
│ On YouTube: Tum Se Tum Tak | Saiyaara | …  ← only    │
└──────────────────────────────────────────────────────┘     when doubtful
```

- Artwork and title link to Spotify (decision 17); the art has the glow (3.5).
- Title: `displayTitle()` drops a trailing ` (From "X")` or ` - From "X"`. The sub-line is the artists; the album or film is its own line when it differs from the song name (decision 14).
- Status line: signal glyph, the word ("Sure match", "Picked by you", "Check this match", "Unsure match") in `--label-2` or `--warn`, the duration, and a trailing "Open in Spotify" text link.
- Actions: "Play" plays from here (decision 7): the song, then the ticked songs after it. It is filled when there is no bottom bar, tinted when there is one. "Queue" secondary. Then icon buttons: heart (Add to Liked Songs / In Liked Songs, reads the real state via `bg('liked')`), plus (Save to Playlist…), swap (Choose a Different Song…). On a doubtful match the swap button gains the text "Change…" so it is visible.
- Not matched yet: YouTube thumbnail, the YouTube title, and the status ("Searching Spotify…" with spinner, "Not found on Spotify" in `--danger` with a "Search Spotify…" button, or the error with "Try Again").
- The change panel opens inside the card under a hairline.

### 4.3 List section and rows

Section header (outside the group): select-all checkbox (mixed state), the Mix title (Title 3), and a meta line: "24 songs · 22 on Spotify", then "Review 2" (accent text button: takes you to the next doubtful row and opens it), then "3 searching".

Row grid: `28px 20px 40px 1fr auto 28px` = checkbox, index, art, text, trailing (duration over signal), disclosure.

| State | Treatment |
|---|---|
| Ticked | Normal |
| Unticked (matched) | Art at 50% opacity; text stays at full contrast |
| Doubtful (check, low) | Signal in `--warn`, the word "Check" or "Unsure" as a small capsule tag, "On YouTube: …" line |
| Not found | YouTube thumb, YouTube title, "Not found on Spotify" in `--danger`, checkbox disabled, a "Search…" button in place of the disclosure |
| Error | As not found with the error text and "Try Again" |
| Searching | "Searching Spotify…", spinner in place of the signal |
| Waiting | "Waiting…", empty outlined bars, still |
| Now playing | `speaker` glyph in `--accent-text` in place of the index, `aria-current="true"` |
| Hover | `--fill-2` highlight, 8 px radius, inset 4 px |
| Open | `--fill-2` stays; chevron turns up; panel below indented to the text column |
| Focus | 2 px `--accent` ring, 2 px offset, on the focused control |

Row text is a button (`.rowbtn`) that opens the panel; the artwork is a link to Spotify. Separators run from the text column to the trailing edge. The list ends with a full-width "Load More Songs" row button inside the group, and a footnote under the group: "Song details and artwork from Spotify."

### 4.4 Bottom bar

Sticky, material, padding 12: `[Queue] [Save…]` secondary capsules leading, `[▶ Play 22 Songs]` filled trailing, all 32 px. Disabled at 0 ticked, with "Play" alone. The status line sits directly above it.

### 4.5 Status line (`#job`)

One line, Callout, `--label`. A leading 16 px glyph: spinner (running), check circle (done), warning (error, `--danger` text). Trailing link "Open in Spotify" when the job has one. A 2 px progress bar under it while a queue job reports `done / total`. `role="status"`.

### 4.6 Save sheet

```
┌ sheet (16r top) ─────────────────────────────┐
│ Save to Playlist                        (✕)  │
│ Playlist   [ New Playlist            ⌃⌄ ]    │
│ Name       [ Mix – Tum Se Tum Tak       ]    │
│            [☐] Make Public                   │
│                       [Cancel] [Save 22 Songs]│
└──────────────────────────────────────────────┘
```

### 4.7 First-run and sign-in card

Group card, 12 r. Title 2 "Find This Music on Spotify", one paragraph, then two choices (decision 4):

1. **Set Up Spotify…** (filled, recommended): "One-time setup, about a minute. The extension fills in Spotify's app form; you tick the terms box and click Save. Needs Spotify Premium."
2. **Use My Spotify Tab** (secondary): "No setup. Unofficial: it uses Spotify's web player in your browser and can stop working at any time."

Other states: official app saved but signed out → "Connect Spotify…"; no-setup mode failing, or any `needsSetup` error → the message in `--danger`, "Try Again", and "Set Up Spotify…".

### 4.8 Empty and error states (popup)

Centred in the popup: a 28 px outline glyph in `--label-3`, a Title 3 line and one Body line in `--label-2`. "Nothing to Match Here" / "Play a song, Mix or playlist on YouTube or YouTube Music, then open this again." Read failure: "Can't Read This Page" / "Reload the YouTube tab, then open this again." with a "Reload Page" button.

### 4.9 Full view

```
┌ toolbar (sticky, material) ──────────────────────────────────────────────────────────────┐
│ Mix – Tum Se Tum Tak             [Copy Links] [Queue] [▶ Play]  [Save 45 Songs]   (◉)    │
├ status line ─────────────────────────────────────────────────────────────────────────────┤
│ ✓ Saved 45 songs to Mix – Tum Se Tum Tak.  Open in Spotify ↗                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
  Mix – Tum Se Tum Tak                                  ← Large Title
  From Mix – Tum Se Tum Tak on YouTube
  48 songs · 45 on Spotify · Review 3 · 2 searching          Find Matches Again   Clear List…
  Save to [New Playlist ⌃⌄]  Name [Mix – Tum Se Tum Tak ]  [☐] Make Public

  ┌ group 12r ────────────────────────────────────────────────────────────────────────────┐
  │ [☐-]  #   YouTube                         Spotify                       Match   Time  │
  │ [☑]   1   [thumb] Tum Se Tum Tak | Sai…   [art] Tum Se Tum Tak ↗        ▂▄▆     3:38 ⌄ ✕│
  │             Saregama Music                      Niyam · Saiyaara                       │
  │ [☐]   2   [thumb] Safar (Lyrics)          [art] Safar ↗                 ▂▄  Check 4:12 ⌄ ✕│
  │ …                                                                                      │
  │ ＋ Add a Song…                                                                          │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

Alternating row backgrounds (`lists-and-tables.md › macOS`: "Consider using alternating row colors in a multicolumn table"). Settings is a grouped form card under the toolbar when open. Under 760 px the YouTube column stacks under the Spotify one.

## 5. Popup wireframes

```
 Signed in, Mix                         First run                        Not on YouTube
┌──────────────────────────────┐      ┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Now Playing          ⤢  (◉)  │      │                         ⤢    │ │                         ⤢    │
│ ┌──────────────────────────┐ │      │ ┌──────────────────────────┐ │ │                              │
│ │[art] Tum Se Tum Tak      │ │      │ │ Find This Music on       │ │ │            ▷                 │
│ │      Niyam, Shreya…      │ │      │ │ Spotify                  │ │ │   Nothing to Match Here      │
│ │      Saiyaara            │ │      │ │ One-time setup, about a  │ │ │  Play a song, Mix or play-   │
│ │      ▂▄▆ Sure · 3:38  ↗  │ │      │ │ minute…                  │ │ │  list on YouTube or YouTube  │
│ │[▶ Play][Queue]  ♡  +  ⇄  │ │      │ │ [   Set Up Spotify…    ] │ │ │  Music, then open this again │
│ └──────────────────────────┘ │      │ │ [  Use My Spotify Tab  ] │ │ │                              │
│ ☑ Mix – Tum Se Tum Tak       │      │ │ Unofficial: uses Spotify…│ │ └──────────────────────────────┘
│   24 songs · 22 on Spotify   │      │ └──────────────────────────┘ │
│   Review 2                   │      │ ┌ card: YouTube title ─────┐ │
│ ┌──────────────────────────┐ │      │ └──────────────────────────┘ │
│ │☑ 🔈[a] Tum Se Tum Tak 3:38│ │      │ Mix – Tum Se Tum Tak         │
│ │        Niyam      ▂▄▆  ⌄ │ │      │ ┌ rows without status ─────┐ │
│ │☐ 2 [a] Safar  Check  4:12│ │      └──────────────────────────────┘
│ │        Arijit     ▂▄   ⌄ │ │
│ │        On YouTube: Safar…│ │
│ │☐ 3 [t] Ishq Hai          │ │
│ │        Not found  [Search…]│
│ │   Load More Songs        │ │
│ └──────────────────────────┘ │
│ ✓ Queued 22 songs on Mac.    │
│ [Queue] [Save…] [▶ Play 22 Songs]
└──────────────────────────────┘
```

## 6. Copy

Buttons, menu items, titles and column headings use title-style capitalisation; body text, status lines and tooltips use sentence case (`buttons.md › Content`, `writing.md › Best practices`). An ellipsis marks a control that asks for more input or opens another window (`buttons.md › macOS`).

| Before | After |
|---|---|
| Mix to Spotify (header) | Now Playing / the Mix title |
| Play 7 songs | Play 7 Songs |
| Save (bar) | Save… |
| Save to playlist (sheet title) | Save to Playlist |
| New playlist / Public playlist | New Playlist / Make Public |
| Save (sheet button) | Save 7 Songs, next to Cancel |
| Tick all / Untick all | Select-all checkbox, label "Select All Songs" |
| 7 of 8 found on Spotify · 2 to look at · 3 still searching | 8 songs · 7 on Spotify · Review 2 · 3 searching |
| Load more songs from this Mix / Load the whole playlist | Load More Songs / Load Entire Playlist |
| Not this song? / Wrong song? Pick another | Change… / Choose a Different Song… |
| Search Spotify (button) | Search Spotify… |
| Search failed | Couldn't search Spotify. + Try Again |
| Check this one / Unsure | Check this match / Unsure match (card); Check / Unsure (row tag) |
| Not on Spotify | Not found on Spotify |
| Find these songs on Spotify | Find This Music on Spotify |
| Set up Spotify / Connect Spotify | Set Up Spotify… / Connect Spotify… |
| Opening Spotify login… | Waiting for Spotify… |
| Open a song, Mix or playlist… then click the icon again. | Nothing to Match Here / Play a song, Mix or playlist on YouTube or YouTube Music, then open this again. |
| Could not read this YouTube page… | Can't Read This Page / Reload the YouTube tab, then open this again. + Reload Page |
| Open full view (tooltip) | Open Full View |
| Re-match all / Clear list | Find Matches Again / Clear List… |
| Change / Close (full view row) | chevron button, label "Change Match for X" / "Hide Search for X" |
| Copy Spotify links | Copy Links |
| Add any song / Song and artist | Add a Song… / Search Spotify for a song |
| Spotify account (settings) | Spotify Account |

## 7. Owner questions

Most open questions were settled in `docs/decisions.md`, and the name (Dhaara) and the ribbon icon were set during phase 2. Blue now has a reason beyond familiarity: it is the colour of the stream in the name. Two questions remain; phase 2 ships the recommended answer for each.

1. **Accent colour.** Blue for the accent and the icon (shipped, recommended), or the old marigold (values in 3.1)?
2. **Artwork glow.** The Now Playing cover sits on a blurred copy of itself, the way Apple's players do. The cover itself is never altered. Ship it (shipped, recommended), or use a neutral shadow to stay well clear of Spotify's artwork rules? Removing it is one line: the `.glow` image in `popup.js` `renderNow()`.

## 8. Implementation plan (phase 2)

Order: accessibility and tokens first, then structure, then craft, then motion.

| File | Change |
|---|---|
| `styles.css` | Full rewrite. `:root` tokens (3.1) with dark, increased-contrast, reduced-transparency, forced-colours and reduced-motion overrides; easing tokens with `@supports linear()`. Base (`body`, system stack, rem sizes). Controls: `button` (secondary capsule), `.primary`, `.tinted`, `.plain` (text), `.icon-btn`, `select`, `input`, `.search`, custom `input[type=checkbox]` (checked, indeterminate, disabled, tick reveal). `.signal` glyph (replaces `.vu`), `.spinner`. Popup: `body.popup`, `.pop-head`, `.np-*` card, `.section-head`, `.group`, `.prow` grid and states, `.prow-change`, `.more-btn`, `.feedback` (`#job`), `.bar`, `.sheet` and `.scrim`, `.login`, `.empty`, `.skeleton`. Full view: `body.page`, `.toolbar`, `.page-head`, `.settings`, `.table`, `.track` grid with alternating rows, `.th`, `.add-row`, `@media (max-width: 760px)` |
| `popup.html` | Remove Google Fonts. Header: `#headTitle` + `#fullBtn` + `#account`. `#login` card with two choices. `#mixHead` with `#tickAll` checkbox. `#rows` in a `.group`; `#moreBtn` inside it; attribution footnote. `#job` above `#bar`. `#scrim` and the restyled `#saveSheet` with labels, Cancel and Make Public. Empty state markup in `#status` |
| `popup.js` | `renderHead()` (new) and an IntersectionObserver for the title swap and scroll edges; `renderAccount()` avatar button; `renderLogin()` with the two choices, `needsSetup` and web-mode problems; `onError()` (new) routes `needsSetup`, `needsLogin` and the rest; `renderNow()` new card, Play from here, liked state via `bg('liked')`, View Transition when the match changes; `row()` new anatomy, art link, states, fill-in animation flag; `renderMeta()` copy and "Review N"; `tickAll()` and the mixed checkbox; `renderBar()` labels and order; `renderJob()` glyphs, progress bar, success mark; `openSheet()`/`closeSheet()` with scrim and motion; `loadMore()` stagger and copy; `init()` empty and read-failure states, entrance, full-height class |
| `ui.js` | New outline `PATHS` and `icon()`; `signal()` (replaces `meter()`, kept as an alias); `spinner()`; `displayTitle()`, `subLine()`; `trackCard()` with art link; `changePanel()` with a search field, search as you type through `bg('search')`, current-match checkmark, "Open in Spotify" link; motion helpers `EASE`, `reducedMotion()`, `expand()`, `collapse()`, `stagger()`, `withTransition()`; `toast()` writes to `#job` when there is no `#toast` |
| `import.html` | Remove Google Fonts. Sticky `.toolbar` with the actions and account button; `#job` status line; `.page-head` (title, sources, stats, list commands, save options); settings as a grouped form with the sign-in mode; table head; `#list` in a group; "Add a Song…" row; no footer |
| `import.js` | `renderAccount()`, `renderSettings()` (mode and switch, two choices), `renderToolbar()` (was `renderFooter()`), `trackRow()` columns and labels, `youtubeCell()`/`spotifyCell()`, `renderStats()`, `showResult()`/`renderJob()` with glyphs, `searchToAdd()` through `bg('search')`, `onError()` with `needsSetup` |
| `icons/` | New `icon.svg` (three bars on a blue rounded square) and PNGs at 16, 32, 48 and 128 |
| `DESIGN.md` | Rewritten as a one-page summary of this spec |

Not in scope here: `background.js`, `spotify*.js`, `store.js`, `manifest.json`, `README.md` (other builders own them). The UI assumes `bg('status')` returns `{ mode, webProblem }` with `mode` `'app'` or `'web'` (as `store.js` `MODE_KEY` documents), `bg('setMode', { mode })`, `bg('search', { q })` → `{ tracks }`, `bg('liked', { uris })` → `{ liked }` (optional: the heart falls back to what was liked in this popup), and `err.needsSetup` on errors from `bg()`.

**Status:** implemented in phase 2 (3 Nov 2026) in all the files above, and checked in a browser harness with a mocked `chrome` API in light, dark, narrow and wide layouts.

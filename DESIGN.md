# Dhaara design notes

Dhaara (Hindi for "stream, flow"): let your YouTube Mixes flow into Spotify.

The full spec, with the reasoning and Apple HIG citations, is `docs/apple-redesign.md`. This page is the short version to keep next to the code.

## Direction

The popup behaves like a macOS menu bar popover: quiet grey chrome, white grouped content, the system font, one blue accent, and colour that comes only from the album art. The one bold thing is the Now Playing card: big artwork with a soft glow drawn from the artwork itself, the Spotify match beside it, and a signal-strength glyph that says how sure the match is. The full view uses the same system as a wider table.

## Tokens (styles.css `:root`)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#F2F2F7` | `#1C1C1E` | Window background |
| `--group` | `#FFFFFF` | `#2C2C2E` | Card, list group, sheet |
| `--label` | `#1D1D1F` | `#F5F5F7` | Primary text (16.8 / 12.8 : 1) |
| `--label-2` | `#6A6A70` | `#A1A1A6` | Secondary text (5.4 / 5.4 : 1) |
| `--label-3` | `#8E8E93` | `#8E8E93` | Outlines, disabled (non-text, ≥ 3 : 1) |
| `--accent` | `#0066CC` | `#0A6CFF` | Filled primary, checkbox, focus ring (white on it 5.6 / 4.6 : 1) |
| `--accent-text` | `#0066CC` | `#4DA3FF` | Links and text buttons |
| `--warn` | `#A35200` | `#FFB340` | "Check" and "Unsure" |
| `--danger` | `#D70015` | `#FF6961` | Not found, errors |
| `--danger-tint` | 10% of danger | 16% of danger | Destructive button fill (Disconnect, Clear List) |
| `--shadow-menu` | soft 30 px drop | stronger in dark | Pop-up menu and the full view's centred dialog |

Increased contrast, reduced transparency, forced colours and reduced motion each have overrides at the end of `:root` and of styles.css.

**Type:** the system stack (SF on macOS, Segoe UI on Windows), nothing downloaded. Sizes in rem so the browser's font-size setting scales them: 26 large title, 17 song title, 15 section titles, 13 body, 12 secondary, 11 captions. Weights 400 to 700, never light.

**Shape:** 4 px grid; radii 4 (small art, checkbox), 6 (card art), 8 (fields, row highlight), 12 (groups), 16 (card, sheet), capsule buttons. Icons are our own outline set on a 20 px grid with a 1.5 px stroke (`ui.js` `PATHS`).

**Materials:** blur only on the sticky header, the bottom dock and the save sheet, and only while content is underneath. Content is opaque.

## Components

- **Header:** "Now Playing", swapping to the Mix title once you scroll to it; the brand only when there is nothing else to say. Trailing: Open Full View, account.
- **Now Playing card:** art (links to Spotify) with its glow, title without `(From "…")`, artists, the film or album, the signal glyph and word, "Open in Spotify". Play (plays from here), Queue, heart, Save to Playlist…, Choose a Different Song….
- **Match glyph:** three bars. 3 = sure (grey), 2 = check, 1 = unsure (both amber, with the word), none = "Not found on Spotify" in red. A spinner only while a song is being searched.
- **Rows:** checkbox, number (a speaker on the song playing), art (links to Spotify), title, artists · album, duration over the glyph, disclosure. Doubtful rows add a "Check" or "Unsure" tag and the YouTube title.
- **Bottom dock:** one status line (`#job`) with a glyph, a link and a progress bar for queueing; then Queue, Save… and the primary "Play N Songs" on the trailing side.
- **Save sheet:** slides up over a dimmed popup: Playlist pop-up, Name, Make Public, Cancel and "Save N Songs". For a Mix that is linked to a playlist it opens on that playlist, titled "Add New Songs to <name>", with "Add N New Songs".
- **Pop-up button and menu** (`ui.js` `popupMenu`, replaces `<select>`): a fill-coloured button with the chosen label and an up/down chevron; the menu is a floating listbox, placed with `position: fixed` inside the nearest dialog (else `<body>`) so a screen reader that treats the dialog as modal still reaches it, and it follows its button while that moves (the sheet slides in) and on resize and scroll (material, radius 10, 28 px items, check column, accent highlight with white text, a separator after New Playlist). It opens below or flips above, scales in from .97 in 150 ms and fades out; the focus ring is `:focus-visible` only.
- **Device sheet** (`ui.js` `chooseDevice`): same sheet as above, centred in the full view; one button per Spotify player, chosen once and remembered.
- **Inline confirmation** (`ui.js` `showConfirm`): a tinted row with the question, one muted detail line, Cancel and a destructive action; Esc cancels. Used by Disconnect and Clear List instead of `window.confirm`.
- **Playing on Spotify** (decision 19): when Spotify is on the card's song, the primary button becomes Pause or Resume and a line under the status reads "Playing on <device>" (or "Paused on") with a small equalizer glyph: three bars that rise and fall, still when paused or under reduced motion. When Spotify is on another song, a slim row above the list reads "Spotify: <song>, <artist>" with a small Pause or Resume. The popup reads the state every 3 s while it is open.
- **Link line:** under the Mix title, "Linked to <playlist>, 3 new songs since you last saved".
- **First run:** two choices, "Set Up Spotify…" (official, recommended) and "Use My Spotify Tab" (unofficial, no setup, can stop working).

## Motion

Springs written with CSS `linear()` (`--ease-smooth`, `--ease-snappy`, `--ease-bouncy`), cubic-bezier fallbacks, 150 to 350 ms. One entrance when the popup first fills, the sheet sliding up, panels expanding in height, a 0.97 press, the tick drawing in, a View Transition when the card's match changes, Load More rows settling in, the bars growing once a search finishes, the queue's progress bar and a drawn checkmark on success. Only the spinner and the equalizer glyph loop. Reduced motion keeps cross-fades only.

## Icon

`icons/icon.svg`: a squircle in blue with one white ribbon that widens as it flows to the right. No Spotify or YouTube marks or colours. PNGs at 16 and 32 are full bleed for the toolbar; 48 and 128 keep an 8/128 margin.

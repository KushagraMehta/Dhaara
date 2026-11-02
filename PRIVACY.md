# Privacy

Dhaara keeps everything in your browser. It has no server, no account of its own and no analytics.

## What is stored, and where

All of it lives in your browser's extension storage on your computer:

- **Your Spotify login** (a token) and, if you set up the official way, your Spotify app's Client ID. With the no-setup login, your Spotify display name and picture.
- **Match results and hand picks:** which Spotify song was found for each YouTube video you looked at, and the songs you picked by hand.
- **Your list** in the full view, which Mixes are linked to which of your Spotify playlists (with the songs saved to them), and the Spotify device you chose for playing.
- **Your settings:** where songs open (app or web), whether YouTube and Spotify pause each other, and when the Spotify desktop app was last seen in your device list (a date).
- **Short-lived state** (ticks, status messages, songs loaded from a Mix, an unfinished login's one-time code) that the browser clears when it closes.

## What is sent, and to whom

Requests go only to YouTube and Spotify:

- **YouTube** (`youtube.com`, `music.youtube.com`): Dhaara reads the page you have open. To load more songs of a Mix it makes the same request the page itself makes, with your normal YouTube cookies. It does not read your YouTube account.
- **Spotify** (`accounts.spotify.com`, `api.spotify.com`; with the no-setup login, your own `open.spotify.com` tab): the song titles and artists it searches for, and the actions you ask for (play, queue, like, save). With the no-setup login, requests are made from your Spotify tab with the session that tab already has; your password and cookies are never read.
- **Spotify's developer dashboard** (`developer.spotify.com`) is used only while you run the official setup. A script that fills in the Create app form or your app's redirect URI runs there for that time only.
- **With the no-setup login**, the extension's background also fetches `open.spotify.com`'s HTML and `open.spotifycdn.com`'s script files (without cookies) to find the web player's request hashes, and two scripts run on `open.spotify.com` pages. They are added only while that login is on, and removed when you choose the official setup or Disconnect.
- **The login's return address** (`<extension id>.chromiumapp.org`) is where Spotify sends the login result; the extension reads it from the login window or tab.
- **Playback state:** while the popup is open it asks Spotify what is playing every 3 seconds (to show Pause and Resume), and once when a YouTube video starts (to pause Spotify). Nothing reads it in the background otherwise.

Nothing is sent to the author of Dhaara or to any third party. Fonts are your system's; nothing is loaded from Google.

## Deleting your data

**Disconnect** (full view, Settings) asks first and then deletes the login, every saved match and hand pick, your list, the playlist links, the remembered device and the ticks. It keeps your Client ID and the way you connect, so you can sign in again. Removing the extension deletes everything it stored. Your Spotify playlists and Liked Songs are not touched by either: they are yours, on Spotify.

You can also revoke Dhaara's access from your Spotify account page (Apps).

## Contact

Questions: open an issue on the project's page.

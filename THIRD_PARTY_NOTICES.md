# Third-party notices

The optional "No-setup login" (`spotify-web.js`, `spotify-hook.js`, `spotify-bridge.js`) adapts ideas
and small pieces of code from the MIT-licensed projects below. They were rewritten in plain JavaScript for this extension.
Each project's copyright notice and licence text are reproduced here, as the MIT licence requires.

Nothing was taken from SpotAPI (GPL-3.0). It was read for reference only.

## spotify-full-experience

<https://github.com/fabrizio-ferrentino/spotify-full-experience>

Used for: capturing the web player's session headers with passive `fetch` / `XMLHttpRequest` wrappers; reading
the player's Spotify Connect device id and spclient host from its own requests; the Connect `play` and `add_to_queue`
command shapes and the active-device lookup; the persisted-query hash registry with a rescan on `PersistedQueryNotFound`;
finding operation hashes in the player's bundles.

```
MIT License

Copyright (c) 2026 Fabrizio Ferrentino

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## hearted.music (browser extension)

<https://github.com/fabiogaliano/hearted.music>

Used for: the `playlist/v2` calls that create a playlist and add it to the user's rootlist; the `addToPlaylist`,
`libraryV3`, `fetchPlaylistContents` and `profileAttributes` request variables and response shapes; the idea of
reading the hashes from the player's own traffic; request pacing (at least 200 ms apart).

```
MIT License

Copyright (c) 2026 fábio galiano (fabiogaliano.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## spogo

<https://github.com/openclaw/spogo>

Used for: reading the webpack chunk-file maps (chunk id to name and content hash) from the player's main bundle,
scanning the chunks for `"<operation>","query|mutation","<sha256>"`, and the `searchDesktop` request variables.
Ported from Go to JavaScript.

```
MIT License

Copyright (c) 2026 Peter Steinberger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

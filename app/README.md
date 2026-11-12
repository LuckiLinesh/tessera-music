# Tessera — a working, login-free music player

A rebuild of the captured `open.spotify.com` web player as a real, playable app.
No accounts, no sign-up, no paid tier, no paywall — every feature is on from the
first second.

## Run it

```bash
npm run build     # generates dist/ (one index.html per route)
npm start         # serves dist/ on http://localhost:4173
```

`dist/` is plain static files. Any static host works — no build step at runtime,
no server-side routing required, each route has its own `index.html`.

## What actually works

- **Real playback.** Press play and audio comes out. The player has play/pause,
  next, previous, shuffle, repeat (all / one), seek by dragging or arrow keys,
  volume, mute, and a queue drawer. Chart songs are 30 second clips in the
  catalog itself, so when one starts the player immediately looks for the same
  title in the keyless full-length catalogs (archive.org netlabels, public-domain
  78s, taper-approved live sets, Openverse, Audius). If it finds one it swaps the
  audio in place — same row, same queue, same like — and the player tag says
  `Full version`, `Full cover - <artist>` or `Full version - archive recording`.
  If nothing legal is out there, the tag says `30s preview - no full version`
  rather than pretending.
- **Real catalog, real artists.** Search by song or artist, artist pages,
  curated playlists and the current public top chart — all from the Deezer
  public catalog, so the names are acts people actually listen to.
- **A whole page of full-length songs, no key needed.** `/full` is built on the
  Internet Archive's netlabels collection (77,000+ Creative Commons releases),
  filtered by each release's own genre tags. Every row is a complete MP3 with
  real track titles, a real artist, and byte-range seeking — no preview cuts, no
  sign-in, no API key.
- **Full-length songs elsewhere too.** A "Live sets" row streams complete
  concert recordings from the Internet Archive's Live Music Archive (Grateful
  Dead, Goose, moe., Widespread Panic, Sigur Rós and more). The Great 78 Project
  adds public-domain 78rpm sides with real song titles ("House Of The Rising
  Sun"), and an Openverse row adds openly licensed studio tracks when that
  service is reachable.
- **Optional extra catalog.** Connect a free Jamendo client id in the app and
  that library joins search as well. Nothing requires it.
- **Your library, on your device.** Likes, playlists, volume and the last track
  are stored in `localStorage` and survive a reload. Saved items are re-fetched
  by id on load, so nothing disappears.
- **Keyboard.** `Space` play/pause, `←`/`→` seek 5s, `m` mute, `l` like,
  `s` shuffle, `r` repeat.
- **Installable.** Registers a service worker and manifest, so it can be added
  to the dock/home screen as an app.

## Routes

| Path | Page |
| --- | --- |
| `/` | Home — top songs, artists, genre charts, playlists, full-length tracks |
| `/download` | Install page (PWA install, not an `.exe`) |
| `/genre/podcasts-web` | Podcast categories and episodes |
| `/popular-in/om` | "Popular right now" chart |
| `/playlist/37i9dQZF1CLcTo7UzL0sYK` | "Top songs right now" |
| `/search?q=` | Search results |
| `/full` | Full songs — complete tracks by genre, no previews |
| `/liked` | Liked Songs |
| `/artist?id=` | Artist page |
| `/collection?type=playlist&id=` | Playlist / album |
| `/collection?type=local&id=` | A playlist created in this browser |

## Design

Colours, radii, the 812px minimum width and the sideways-scroll behaviour below
that width come from the original capture. Below 812px the page scrolls
horizontally instead of reflowing, exactly as the captured site does.

Branding is original (Tessera, four-tile mark, `#1ed760` accent) — no Spotify
logo, wordmark or long copy is reproduced.

## Where the music comes from

Songs, artists, artwork and chart positions come from the
[Deezer](https://www.deezer.com) public API (`api.deezer.com`). Deezer sends no
CORS headers, so the page talks to it over JSONP (a script tag with a callback),
which is why there is no backend and no API key. Audius
(`api.audius.co/v1`) still supplies the podcast route and a row of full-length
independent tracks. Full-length audio comes from the
[Internet Archive](https://archive.org): the netlabels collection
(`collection:netlabels`, filtered by `subject:"<genre>"`) for `/full` and the
home album row, the Great 78 Project (`collection:georgeblood`) for public-domain
78rpm sides, and the Live Music Archive (`collection:etree`) for whole concert
sets. `advancedsearch.php` plus per-item metadata returns real titles, and the
MP3 downloads answer with byte ranges and CORS, so seeking and cross-origin
playback both work without a key. [Openverse](https://api.openverse.org) is a
keyless, CORS-enabled index of Jamendo and Wikimedia audio and is used as an
extra row; it is best-effort, because its anonymous tier rate-limits hard and
can return a Cloudflare challenge, so the page degrades silently when it does.

That has two honest limits:

- **Mainstream tracks are 30 second previews.** The public catalog exposes a
  short clip, not the licensed master. Full-length major-label audio needs a
  licence and a login, which this app deliberately does not have. Previews are
  labelled `30s preview` in the player so nothing is misleading. The full-length
  rows are the way around it: the `/full` page and home rows stream complete
  Creative Commons releases and public-domain recordings straight from
  archive.org.
- **The chart is Deezer's public top chart**, which is not Oman-specific even
  though the captured route is `/popular-in/om`.

If a track's audio fails, the player says so and skips on rather than sitting
silent.

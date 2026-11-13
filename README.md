# Tessera Music

A universal, legally accessible global music search and player � plus a Windows
desktop app with a downloader for the licensed files the catalog surfaces.

No account, no subscription, no ads. Everything it plays is either published as
free audio by the rights holder or streamed through the platform that hosts it.

## What's in this repo

| Path | What it is |
| --- | --- |
| `catalog/` | Next.js catalog � one search across MusicBrainz, Deezer, Internet Archive, Audius, Jamendo and Spotify. Server routes keep API keys off the client. |
| `app/` | Static player build (plain HTML/CSS/JS, `npm run build` ? `app/dist/`). |
| `windows/` | Electron desktop app for Windows: NSIS installer, portable build, full-track downloader, auto-update. |

## Desktop app (Windows 10/11, x64)

Download the latest installer from
**[Releases](https://github.com/commerce-students/tessera-music/releases/latest)**:

- `TesseraMusic-0.2.0-Setup.exe` - installer (choose your install folder, desktop
  and Start menu shortcuts).
- `TesseraMusic-0.2.0-Portable.exe` - single portable executable, no install.

The builds are unsigned, so Windows SmartScreen may show a warning on first run:
choose **More info ? Run anyway**.

The app bundles the catalog server and starts it locally on launch � it works
offline-from-the-internet in the sense that no external Tessera service is
involved, though searching and streaming obviously need a connection.

### Full-length famous songs (one free key)

Out of the box Tessera plays every full-length track the rights holder publishes
for free (Audius, Internet Archive, Jamendo) and 30-second previews from Apple
and Deezer for the commercial catalogue.

To play real, full-length commercial songs - the actual masters from famous
artists - open **Settings** in the sidebar and paste a free **YouTube Data API
key**. Tessera then finds the official upload of each song and plays it in
YouTube's own embedded player: full length, ads included, nothing extracted,
proxied, or rehosted. `⋯` → *Open on YouTube* is always there as a fallback.

Getting a key takes about two minutes:

1. `console.cloud.google.com` → create a project.
2. **APIs & Services → Library** → enable *YouTube Data API v3*.
3. **Credentials → Create credentials → API key**.
4. Paste it into Settings and press **Save keys**.

The free tier gives 10,000 quota units a day and a search costs 100, so roughly
100 fresh searches daily - results are cached for 30 minutes, and repeated
searches do not spend quota. The key is stored in the app's own settings file on
your machine and handed to the local catalog server; it is never included in a
build and never leaves your PC except to Google.

Jamendo works the same way with a free client id if you want more full-length
CC music.

### Downloader

Open the `?` menu on any track that has licensed full-length audio and pick
**Download full track**. The file is streamed from its original public source
straight into your Downloads folder, with a progress event reported to the UI,
and a **Show in folder** action once it lands.

Only sources that publish the audio for free download are offered. Preview-only
tracks (30-second Deezer clips) and YouTube embeds are not downloadable, and
nothing here bypasses DRM, ads, or a subscription.

## Catalog

```bash
cd catalog
npm install
npm run dev     # http://localhost:3000
npm run build
npm start
```

Optional provider keys go in `catalog/.env.local` � copy `catalog/.env.example`.
Search works without keys (MusicBrainz + Deezer + Internet Archive); keys simply
add more sources. Spotify playback requires your own Client ID and a Premium
account, because Spotify only serves full audio to authenticated premium
sessions.

See `catalog/README.md` for the rights matrix and per-provider behaviour.

## Static player

```bash
cd app
npm install
npm run build   # writes app/dist
npm start       # serves the build on http://localhost:4173
```

Routes mirror the captured reference: `/`, `/download`, `/genre/podcasts-web`,
`/popular-in/om`, `/playlist/37i9dQZF1CLcTo7UzL0sYK`.

## Building the desktop app

```bash
cd windows
npm install
npm run dist
```

`npm run dist` first builds the catalog as a self-contained Next.js standalone
server (`scripts/prepare-catalog.mjs`), then packages Electron with
electron-builder. Artefacts land in `windows/release/`.

Auto-update is wired to GitHub Releases via `electron-updater`.

## Sources and legality

Tessera indexes metadata and links to audio that is published freely by the
rights holder or streamed from its host. It does not extract, rehost, or
redistribute copyrighted recordings, and it does not remove ads or bypass DRM,
geo-restrictions, or paid tiers.

## License

MIT � see [LICENSE](LICENSE).

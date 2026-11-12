# Tessera Catalog

A global music search engine: one query across the widest open metadata catalog
and every source that is licensed to stream what it lists.

The point is coverage without lying. MusicBrainz documents recordings from every
country, genre and decade. Playback is a separate question, answered per track
and labelled:

| Label | Meaning |
| --- | --- |
| **Full** | A complete authorised file streaming from the platform that publishes it |
| **YouTube** | The official embedded player, ads untouched |
| **30s** | An official promotional preview from Apple Music or Deezer |
| **No audio** | The recording is documented, but no free authorised stream exists |

Nothing is downloaded, extracted, proxied or rehosted. When a song cannot play,
the row links to the place its owner publishes it.

---

## Run it

```bash
cd catalog
npm install
cp .env.example .env.local   # optional: add keys
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Requires Node 20+ (Next 16).

---

## What is wired in

| Source | Role | Playback | Key | Limits |
| --- | --- | --- | --- | --- |
| **MusicBrainz** | Artists, recordings, release groups, areas, tags | none (metadata) | none | 1 request/second |
| **Cover Art Archive** | Artwork for MusicBrainz release groups | images | none | redirects to archive.org |
| **Apple Music / iTunes** | Metadata, artwork, official previews | 30s preview | none | ~20 req/min per IP |
| **Deezer** | International catalog, artwork, previews | 30s preview | none | no published number |
| **Audius** | Artist-uploaded independent music | full stream | none | public API |
| **Internet Archive** | Public-domain 78s, netlabel releases, taper-approved live sets | full stream | none | item-level rights |
| **Jamendo** | Creative Commons / Jamendo-licensed music | full stream | `JAMENDO_CLIENT_ID` | free tier |
| **YouTube** | Authorised video playback for commercial releases | official embed | `YOUTUBE_API_KEY` | 10,000 units/day; search = 100 |
| **Openverse** | Openly licensed audio index | full stream | `ENABLE_OPENVERSE=1` | anonymous, rate-limited |
| **Wikipedia** | Artist summaries | none | none | public REST endpoint |

Deezer sends no CORS headers, MusicBrainz needs a contact User-Agent and
serialised requests, and keyed APIs must not ship keys to the browser. All of
that is why this is a Next.js app with server routes rather than a static page.

---

## Rights reality

A free API key is not a music licence. The Sources page renders this matrix from
live config; the short version:

- **MusicBrainz data** is CC0 - free to use, including commercially. It contains
  no audio.
- **Apple / Deezer previews** are official promotional clips. Playable, labelled,
  and not for downloading or rehosting. Commercial use of their APIs needs their
  agreement.
- **Audius / Jamendo / Openverse** tracks carry the uploader's or platform's
  licence. Check the individual track before reuse.
- **Internet Archive** rights are per item. The `georgeblood` / `78rpm`
  collections are public domain; `netlabels` and `etree` depend on the item.
- **YouTube** playback happens only in YouTube's own player, with its ads. The
  Data API is used to find and verify embeddable videos, never to extract audio.

This app deliberately does not include scrapers, stream rippers, DRM circumvention
or ad bypasses.

---

## How a search works

1. `/api/search` fans out to every enabled source in parallel.
2. MusicBrainz holds the canonical metadata; Apple, Deezer, Audius, Archive,
   Jamendo, YouTube and Openverse contribute claims.
3. `lib/merge.js` groups claims by normalised title + artist (accents, edition
   words and leading articles removed), keeps the best metadata, keeps every
   confirming source, and prefers full audio > YouTube > preview > nothing.
4. Results are ranked by exact title match, artist match, playback quality and
   source confidence.
5. Responses are cached in-process (10 min search, 30 min playback, 1 h home) and
   carry a per-source status line the UI renders.

`/api/playback` is the honest resolver: pressing play on a metadata-only result
looks for the same song in Audius, Jamendo, the Internet Archive and Openverse,
then for an official YouTube video, and reports exactly what it found.

### Rate limits

- MusicBrainz calls go through a single queue with 1.1 s spacing and 503 backoff.
- YouTube is searched on page 1 only, cached for 30 minutes.
- Every upstream fetch has a timeout, a byte guard and bounded retries.
- The cache is per serverless instance; it is an optimisation, not a guarantee.

---

## Routes

| Route | What it does |
| --- | --- |
| `/` | Shelves of playable music plus entry points into the world |
| `/search?q=` | Unified songs / artists / albums, with country, genre and decade filters |
| `/explore` | Browse by place, genre and decade |
| `/artist?id=` or `?name=` | Artist page: releases, recordings, tags, Wikipedia summary |
| `/album?src=&id=` | Tracklist with per-track playback resolution |
| `/library` | Likes and playlists from `localStorage` |
| `/sources` | Live source status and the rights matrix |
| `/api/*` | Search, playback, artist, album, home, explore, status |

---

## Local data

Likes, playlists and volume live in `localStorage` under `tessera.catalog.*`.
There are no accounts and no server-side user data.

---

## Known limits

- Openverse is opt-in because its public endpoint can be Cloudflare-challenged.
- Without a `YOUTUBE_API_KEY`, commercial songs with no open audio show
  **No audio** and link out - that is the correct, honest state.
- Without a `JAMENDO_CLIENT_ID`, that source reports `needs key`.
- MusicBrainz occasionally returns 503 when busy; the client retries, and a
  failed source is shown as failed rather than silently returning nothing.
- Catalog coverage is the union of these sources, not a licensed Spotify/Apple
  catalog. It is the largest set that can be searched and played legally without
  a subscription.

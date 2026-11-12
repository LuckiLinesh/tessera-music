/* Audius: a keyless, artist-uploaded catalog with full-length streaming. It is
   the main source of complete independent music in search results. */

import { fetchJson } from '../http';
import { cleanName } from '../text';
import { config } from '../keys';

const AU = 'https://api.audius.co/v1';

const streamUrl = (id) =>
  `${AU}/tracks/${encodeURIComponent(id)}/stream?app_name=${encodeURIComponent(config.audiusApp)}`;

const fromTrack = (raw) => {
  const art = raw.artwork || {};
  return {
    source: 'audius',
    nativeId: String(raw.id),
    title: cleanName(raw.title),
    artist: cleanName(raw.user?.name),
    artistId: raw.user?.id ? `audius:${raw.user.id}` : '',
    album: cleanName(raw.album_backlink?.playlist_name || ''),
    albumId: raw.album_backlink?.playlist_id
      ? `audius:${raw.album_backlink.playlist_id}`
      : '',
    year: raw.release_date ? Number(String(raw.release_date).slice(0, 4)) || null : null,
    duration: raw.duration || 0,
    art: art['1000x1000'] || art['480x480'] || art['150x150'] || '',
    explicit: Boolean(raw.is_delete === false && raw.access?.stream === false),
    genre: cleanName(raw.genre || ''),
    playback:
      raw.is_streamable === false || raw.access?.stream === false
        ? null
        : {
            kind: 'audio',
            url: streamUrl(raw.id),
            label: 'Full track',
            provider: 'Audius',
            license: 'Uploaded by the artist to Audius',
          },
    links: raw.permalink
      ? [{ label: 'Audius', href: `https://audius.co${raw.permalink}` }]
      : [],
  };
};

export const searchTracks = async (term, { limit = 25, offset = 0 } = {}) => {
  const json = await fetchJson(
    `${AU}/tracks/search?query=${encodeURIComponent(term)}&limit=${limit}&offset=${offset}&app_name=${encodeURIComponent(config.audiusApp)}`,
    { timeout: 9000 },
  );
  const data = Array.isArray(json.data) ? json.data : [];
  return { items: data.filter((raw) => raw?.id).map(fromTrack), total: data.length };
};

export const trending = async ({ limit = 12 } = {}) => {
  const json = await fetchJson(
    `${AU}/tracks/trending?limit=${limit}&app_name=${encodeURIComponent(config.audiusApp)}`,
    { timeout: 9000 },
  );
  const data = Array.isArray(json.data) ? json.data : [];
  return data.filter((raw) => raw?.id).map(fromTrack);
};

export const lookupTrack = async (id) => {
  const json = await fetchJson(
    `${AU}/tracks/${encodeURIComponent(id)}?app_name=${encodeURIComponent(config.audiusApp)}`,
    { timeout: 9000 },
  );
  return json.data ? fromTrack(json.data) : null;
};

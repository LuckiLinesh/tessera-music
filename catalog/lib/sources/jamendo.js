/* Jamendo: a large catalog of Creative Commons and Jamendo-licensed music with
   full-length streaming. It needs a free client id from developer.jamendo.com.
   Without one the source is reported as "not configured" rather than failing. */

import { fetchJson } from '../http';
import { cleanName, yearOf } from '../text';
import { config, hasJamendo } from '../keys';

const JM = 'https://api.jamendo.com/v3.0';

const fromTrack = (raw) => ({
  source: 'jamendo',
  nativeId: String(raw.id),
  title: cleanName(raw.name),
  artist: cleanName(raw.artist_name),
  artistId: raw.artist_id ? `jamendo:${raw.artist_id}` : '',
  album: cleanName(raw.album_name || ''),
  albumId: raw.album_id ? `jamendo:${raw.album_id}` : '',
  year: yearOf(raw.releasedate),
  duration: Number(raw.duration) || 0,
  art: raw.album_image || raw.image || '',
  explicit: false,
  genre: cleanName(raw.musicinfo?.tags?.genres?.[0] || ''),
  playback: raw.audio
    ? {
        kind: 'audio',
        url: raw.audio,
        label: 'Full track',
        provider: 'Jamendo',
        license: raw.license_ccurl || 'Jamendo licence - check the track page',
      }
    : null,
  links: raw.shareurl
    ? [{ label: 'Jamendo', href: raw.shareurl }]
    : [{ label: 'Jamendo', href: `https://www.jamendo.com/track/${raw.id}` }],
});

export const isConfigured = hasJamendo;

export const searchTracks = async (term, { limit = 25, offset = 0 } = {}) => {
  if (!hasJamendo()) return { items: [], total: 0, unavailable: 'missing-key' };
  const url = `${JM}/tracks/?client_id=${encodeURIComponent(config.jamendoId)}&format=json&limit=${limit}&offset=${offset}&search=${encodeURIComponent(term)}&include=musicinfo&audioformat=mp32`;
  const json = await fetchJson(url, { timeout: 9000 });
  const results = json?.results || [];
  return { items: results.map(fromTrack), total: json?.headers?.results_count || results.length };
};

export const trending = async ({ limit = 12 } = {}) => {
  if (!hasJamendo()) return [];
  const url = `${JM}/tracks/?client_id=${encodeURIComponent(config.jamendoId)}&format=json&limit=${limit}&order=popularity_week&include=musicinfo&audioformat=mp32`;
  const json = await fetchJson(url, { timeout: 9000 });
  return (json?.results || []).map(fromTrack);
};

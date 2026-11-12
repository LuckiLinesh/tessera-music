/* Deezer public API: no key, strong international coverage, large artwork and
   30 second previews. Deezer sends no CORS headers, which is exactly why this
   runs on the server. Previews are labelled, never presented as full tracks. */

import { fetchJson } from '../http';
import { cleanName } from '../text';

const DZ = 'https://api.deezer.com';

export const searchTracks = async (term, { limit = 25, offset = 0 } = {}) => {
  const json = await fetchJson(
    `${DZ}/search?q=${encodeURIComponent(term)}&limit=${limit}&index=${offset}`,
    { timeout: 9000 },
  );
  const data = json.data || [];
  return {
    items: data
      .filter((item) => item.readable !== false)
      .map((item) => ({
        source: 'deezer',
        nativeId: String(item.id),
        title: cleanName(item.title),
        artist: cleanName(item.artist?.name),
        artistId: item.artist?.id ? `deezer:${item.artist.id}` : '',
        album: cleanName(item.album?.title || ''),
        albumId: item.album?.id ? `deezer:${item.album.id}` : '',
        year: null,
        duration: item.duration || 0,
        art: item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '',
        explicit: Boolean(item.explicit_lyrics),
        playback: item.preview
          ? {
              kind: 'preview',
              url: item.preview,
              label: '30-second preview',
              provider: 'Deezer',
              license: 'Promotional preview supplied by Deezer',
            }
          : null,
        links: [{ label: 'Deezer', href: item.link || `https://www.deezer.com/track/${item.id}` }],
      })),
    total: json.total || data.length,
  };
};

export const searchArtists = async (term, { limit = 25, offset = 0 } = {}) => {
  const json = await fetchJson(
    `${DZ}/search/artist?q=${encodeURIComponent(term)}&limit=${limit}&index=${offset}`,
    { timeout: 9000 },
  );
  return {
    items: (json.data || []).map((item) => ({
      source: 'deezer',
      nativeId: `deezer:${item.id}`,
      name: cleanName(item.name),
      type: 'Artist',
      country: '',
      area: '',
      art: item.picture_xl || item.picture_big || item.picture_medium || '',
      score: 0,
      links: [{ label: 'Deezer', href: item.link || `https://www.deezer.com/artist/${item.id}` }],
    })),
    total: json.total || 0,
  };
};

export const searchAlbums = async (term, { limit = 25, offset = 0 } = {}) => {
  const json = await fetchJson(
    `${DZ}/search/album?q=${encodeURIComponent(term)}&limit=${limit}&index=${offset}`,
    { timeout: 9000 },
  );
  return {
    items: (json.data || []).map((item) => ({
      source: 'deezer',
      nativeId: String(item.id),
      title: cleanName(item.title),
      artist: cleanName(item.artist?.name),
      artistId: item.artist?.id ? `deezer:${item.artist.id}` : '',
      year: null,
      type: 'Album',
      art: item.cover_xl || item.cover_big || item.cover_medium || '',
      trackCount: item.nb_tracks || 0,
      links: [{ label: 'Deezer', href: item.link || `https://www.deezer.com/album/${item.id}` }],
    })),
    total: json.total || 0,
  };
};

export const lookupAlbum = async (id) => {
  const json = await fetchJson(`${DZ}/album/${encodeURIComponent(id)}`, { timeout: 9000 });
  return json;
};

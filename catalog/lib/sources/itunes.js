/* iTunes Search API: no key, global storefronts, reliable 30 second previews and
   good artwork. Previews are official promotional clips, so they are always
   labelled as previews and never treated as the full song. */

import { fetchJson } from '../http';
import { cleanName, yearOf } from '../text';

const IT = 'https://itunes.apple.com';

const artwork = (url, size = 600) =>
  String(url || '')
    .replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`)
    .replace(/\/\d+x\d+\.(jpg|png)$/i, `/${size}x${size}bb.$1`);

export const searchTracks = async (term, { limit = 25, offset = 0, country = 'US' } = {}) => {
  const url = `${IT}/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&offset=${offset}&country=${country}`;
  const json = await fetchJson(url, { timeout: 9000 });
  const results = json.results || [];
  return {
    items: results
      .filter((item) => item.previewUrl || item.trackViewUrl)
      .map((item) => ({
        source: 'itunes',
        nativeId: String(item.trackId || item.collectionId || ''),
        title: cleanName(item.trackName || item.collectionName),
        artist: cleanName(item.artistName),
        artistId: item.artistId ? `itunes:${item.artistId}` : '',
        album: cleanName(item.collectionName || ''),
        albumId: item.collectionId ? `itunes:${item.collectionId}` : '',
        year: yearOf(item.releaseDate),
        duration: Math.round((item.trackTimeMillis || 0) / 1000),
        art: artwork(item.artworkUrl100, 600),
        explicit: item.collectionExplicitness === 'explicit' || item.trackExplicitness === 'explicit',
        playback: item.previewUrl
          ? {
              kind: 'preview',
              url: item.previewUrl,
              label: '30-second preview',
              provider: 'Apple Music',
              license: 'Promotional preview supplied by Apple',
            }
          : null,
        links: item.trackViewUrl
          ? [{ label: 'Apple Music', href: item.trackViewUrl }]
          : [],
      })),
    total: json.resultCount || results.length,
  };
};

export const searchArtists = async (term, { limit = 25, offset = 0, country = 'US' } = {}) => {
  const url = `${IT}/search?term=${encodeURIComponent(term)}&media=music&entity=musicArtist&limit=${limit}&offset=${offset}&country=${country}`;
  const json = await fetchJson(url, { timeout: 9000 });
  return {
    items: (json.results || []).map((item) => ({
      source: 'itunes',
      nativeId: String(item.artistId || ''),
      name: cleanName(item.artistName),
      type: 'Artist',
      country: '',
      area: '',
      score: 0,
      links: item.artistLinkUrl ? [{ label: 'Apple Music', href: item.artistLinkUrl }] : [],
    })),
    total: json.resultCount || 0,
  };
};

export const searchAlbums = async (term, { limit = 25, offset = 0, country = 'US' } = {}) => {
  const url = `${IT}/search?term=${encodeURIComponent(term)}&media=music&entity=album&limit=${limit}&offset=${offset}&country=${country}`;
  const json = await fetchJson(url, { timeout: 9000 });
  return {
    items: (json.results || []).map((item) => ({
      source: 'itunes',
      nativeId: String(item.collectionId || ''),
      title: cleanName(item.collectionName),
      artist: cleanName(item.artistName),
      artistId: item.artistId ? `itunes:${item.artistId}` : '',
      year: yearOf(item.releaseDate),
      type: 'Album',
      art: artwork(item.artworkUrl100, 600),
      trackCount: item.trackCount || 0,
      links: item.collectionViewUrl ? [{ label: 'Apple Music', href: item.collectionViewUrl }] : [],
    })),
    total: json.resultCount || 0,
  };
};

export const lookupAlbum = async (id, { country = 'US' } = {}) => {
  const url = `${IT}/lookup?id=${encodeURIComponent(id)}&entity=song&country=${country}`;
  const json = await fetchJson(url, { timeout: 9000 });
  const results = json.results || [];
  const album = results.find((item) => item.collectionId) || results[0] || null;
  const tracks = results
    .filter((item) => item.wrapperType === 'track')
    .map((item) => ({
      id: String(item.trackId),
      title: cleanName(item.trackName),
      artist: cleanName(item.artistName),
      artistId: String(item.artistId || ''),
      duration: Math.round((item.trackTimeMillis || 0) / 1000),
      number: item.trackNumber || '',
      previewUrl: item.previewUrl || '',
      art: artwork(item.artworkUrl100, 300),
    }));
  return { album, tracks };
};

/* Openverse indexes openly licensed audio from Wikimedia, FMA and others. The
   index is small and the public endpoint occasionally rate-limits, so this layer
   is opt-in (ENABLE_OPENVERSE=1) and always degrades to an empty list. */

import { fetchJson } from '../http';
import { cleanName } from '../text';

export const searchTracks = async (term, { limit = 10 } = {}) => {
  const json = await fetchJson(
    `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(term)}&page_size=${limit}`,
    { timeout: 9000, tries: 1 },
  );
  const results = json?.results || [];
  return {
    items: results
      .filter((item) => item.url)
      .map((item) => ({
        source: 'openverse',
        nativeId: item.id,
        title: cleanName(item.title),
        artist: cleanName(item.creator || 'Unknown artist'),
        artistId: '',
        album: '',
        albumId: '',
        year: null,
        duration: Math.round(item.duration || 0),
        art: item.thumbnail || '',
        explicit: false,
        playback: {
          kind: 'audio',
          url: item.url,
          label: 'Full track',
          provider: 'Openverse',
          license: item.license
            ? `${String(item.license).toUpperCase()} ${item.license_version || ''} - ${item.attribution || ''}`.trim()
            : 'Open licence - check the source page',
        },
        links: item.foreign_landing_url
          ? [{ label: 'Source', href: item.foreign_landing_url }]
          : [],
      })),
    total: json?.result_count || results.length,
  };
};

/* Search orchestration: fan out to every enabled catalog in parallel, collect a
   status line per source, then merge into one ranked list. */

import { cached } from './cache';
import { mergeAlbums, mergeArtists, mergeTracks } from './merge';
import { cleanName, safeQuery } from './text';
import { config, hasJamendo, hasYouTube } from './keys';

import * as mb from './sources/musicbrainz';
import * as itunes from './sources/itunes';
import * as deezer from './sources/deezer';
import * as audius from './sources/audius';
import * as archive from './sources/archive';
import * as jamendo from './sources/jamendo';
import * as youtube from './sources/youtube';
import * as openverse from './sources/openverse';

export const SOURCE_LABELS = {
  musicbrainz: 'MusicBrainz',
  itunes: 'Apple Music',
  deezer: 'Deezer',
  audius: 'Audius',
  archive: 'Internet Archive',
  jamendo: 'Jamendo',
  youtube: 'YouTube',
  openverse: 'Openverse',
  local: 'Your library',
};

const TTL = 10 * 60 * 1000;

const run = async (id, task, { skip = false, note = '' } = {}) => {
  if (skip) return { id, status: 'skipped', note, items: [], ms: 0 };
  const started = Date.now();
  try {
    const result = await task();
    const items = Array.isArray(result) ? result : result?.items || [];
    return {
      id,
      status: items.length ? 'ok' : 'empty',
      items,
      total: result?.total,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      id,
      status: 'error',
      note: error?.message || 'request failed',
      items: [],
      ms: Date.now() - started,
    };
  }
};

const sourceReport = (results) =>
  results.map((result) => ({
    id: result.id,
    label: SOURCE_LABELS[result.id] || result.id,
    status: result.status,
    note: result.note || '',
    count: result.items?.length || 0,
    ms: result.ms,
  }));

const enabled = (sources, id) => !sources?.length || sources.includes(id);

const filtersToMb = (country, genre, decade) => ({
  country: country || '',
  genre: genre || '',
  decade: decade || '',
});

/** Build the MusicBrainz query: free text or structured exploration. */
const mbQuery = (term, filters = {}, kind = 'track') => {
  const clean = safeQuery(term);
  const hasFilters = filters.country || filters.genre || filters.decade;
  if (!clean && !hasFilters) return '';
  if (!clean) {
    return mb.buildQuery('', kind, filters).replace(/^releasegroup:\(""\) AND /, '').replace(/^recording:\(""\) AND /, '').replace(/^artist:\(""\) AND /, '');
  }
  if (hasFilters) return mb.buildQuery(clean, kind, filters);
  return clean;
};

export const searchTracks = async ({
  q = '',
  page = 1,
  limit = 20,
  country = '',
  genre = '',
  decade = '',
  sources = [],
  includeVideo = true,
} = {}) => {
  const term = safeQuery(q);
  const filter = filtersToMb(country, genre, decade);
  const offset = (Math.max(1, page) - 1) * limit;
  if (!term && !country && !genre && !decade) {
    return { items: [], total: 0, page, perPage: limit, hasMore: false, sources: [], notes: [] };
  }

  const key = `tracks:${term}:${page}:${limit}:${country}:${genre}:${decade}:${sources.join(',')}:${includeVideo}`;
  return cached(key, TTL, async () => {
    const query = mbQuery(term, filter, 'track');
    const results = await Promise.all([
      run('musicbrainz', () =>
        query ? mb.searchTracks(query, { limit, offset }) : { items: [], total: 0 },
      ),
      run('itunes', () => itunes.searchTracks(term, { limit, offset }), {
        skip: !enabled(sources, 'itunes') || !term,
      }),
      run('deezer', () => deezer.searchTracks(term, { limit, offset }), {
        skip: !enabled(sources, 'deezer') || !term,
      }),
      run('audius', () => audius.searchTracks(term, { limit, offset }), {
        skip: !enabled(sources, 'audius') || !term,
      }),
      run('archive', () => archive.searchTracks(term, { limit: 6 }), {
        skip: !enabled(sources, 'archive') || !term,
      }),
      run('jamendo', () => jamendo.searchTracks(term, { limit, offset }), {
        skip: !enabled(sources, 'jamendo') || !term,
        note: hasJamendo() ? '' : 'set JAMENDO_CLIENT_ID to enable',
      }),
      run(
        'youtube',
        async () => {
          const video = await youtube.findVideo(term, '');
          return video ? [video] : [];
        },
        {
          skip:
            !enabled(sources, 'youtube') ||
            !hasYouTube() ||
            !term ||
            !includeVideo ||
            page > 1,
          note: hasYouTube() ? 'first page only (quota)' : 'set YOUTUBE_API_KEY to enable',
        },
      ),
      run('openverse', () => openverse.searchTracks(term, { limit: 8 }), {
        skip: !config.openverse || !enabled(sources, 'openverse') || !term,
        note: config.openverse ? '' : 'set ENABLE_OPENVERSE=1 to enable',
      }),
    ]);

    const claims = [];
    for (const result of results) {
      result.items.forEach((item, index) => {
        if (result.id === 'youtube') {
          claims.push({
            source: 'youtube',
            nativeId: item.videoId,
            position: index,
            title: cleanName(item.title),
            artist: cleanName(item.channel.replace(/\s*-\s*Topic$/i, '')),
            artistId: '',
            album: '',
            albumId: '',
            year: null,
            duration: 0,
            art: item.thumb,
            playback: youtube.asPlayback(item),
            links: [{ label: 'YouTube', href: `https://www.youtube.com/watch?v=${item.videoId}` }],
          });
        } else {
          claims.push({ ...item, position: index });
        }
      });
    }

    const items = mergeTracks(claims, { limit, query: term });
    const total = results.reduce((sum, result) => Math.max(sum, result.total || 0), items.length);
    const notes = [];
    if (!hasYouTube()) notes.push('YouTube full songs need a free API key - add one in Settings.');
    if (!hasJamendo()) notes.push('Jamendo full-length streaming needs a free client id (Settings).');
    if (page > 1 && hasYouTube()) notes.push('YouTube is searched on page 1 only to protect quota.');

    return {
      items,
      total,
      page,
      perPage: limit,
      hasMore: results.some((result) => (result.total || result.items.length) >= offset + limit),
      sources: sourceReport(results),
      notes,
    };
  });
};

export const searchArtists = async ({ q = '', page = 1, limit = 20, sources = [] } = {}) => {
  const term = safeQuery(q);
  if (!term) return { items: [], total: 0, page, perPage: limit, hasMore: false, sources: [], notes: [] };
  const offset = (page - 1) * limit;

  return cached(`artists:${term}:${page}:${limit}`, TTL, async () => {
    const results = await Promise.all([
      run('musicbrainz', () => mb.searchArtists(term, { limit, offset })),
      run('itunes', () => itunes.searchArtists(term, { limit, offset }), {
        skip: !enabled(sources, 'itunes'),
      }),
      run('deezer', () => deezer.searchArtists(term, { limit, offset }), {
        skip: !enabled(sources, 'deezer'),
      }),
    ]);
    const claims = results.flatMap((result) => result.items);
    const items = mergeArtists(claims, { limit, query: term });
    return {
      items,
      total: Math.max(...results.map((result) => result.total || 0), items.length),
      page,
      perPage: limit,
      hasMore: items.length >= limit,
      sources: sourceReport(results),
      notes: [],
    };
  });
};

export const searchAlbums = async ({ q = '', page = 1, limit = 20, sources = [] } = {}) => {
  const term = safeQuery(q);
  if (!term) return { items: [], total: 0, page, perPage: limit, hasMore: false, sources: [], notes: [] };
  const offset = (page - 1) * limit;

  return cached(`albums:${term}:${page}:${limit}`, TTL, async () => {
    const results = await Promise.all([
      run('musicbrainz', () => mb.searchAlbums(term, { limit, offset })),
      run('itunes', () => itunes.searchAlbums(term, { limit, offset }), {
        skip: !enabled(sources, 'itunes'),
      }),
      run('deezer', () => deezer.searchAlbums(term, { limit, offset }), {
        skip: !enabled(sources, 'deezer'),
      }),
    ]);
    const claims = results.flatMap((result) => result.items);
    const items = mergeAlbums(claims, { limit, query: term });
    return {
      items,
      total: Math.max(...results.map((result) => result.total || 0), items.length),
      page,
      perPage: limit,
      hasMore: items.length >= limit,
      sources: sourceReport(results),
      notes: [],
    };
  });
};

export const explore = async ({ country = '', genre = '', decade = '', page = 1, limit = 20 } = {}) => {
  const key = `explore:${country}:${genre}:${decade}:${page}:${limit}`;
  return cached(key, TTL, async () => {
    const query = mb.buildQuery('', 'track', { country, genre, decade })
      .replace(/^recording:\(""\) AND /, '');
    const results = await Promise.all([
      run('musicbrainz', () => mb.searchTracks(query, { limit, offset: (page - 1) * limit })),
    ]);
    const items = mergeTracks(results[0].items, { limit, query: '' });
    return {
      items,
      total: results[0].total || items.length,
      page,
      perPage: limit,
      hasMore: items.length >= limit,
      sources: sourceReport(results),
      notes: ['Metadata from MusicBrainz. Playback is resolved per track.'],
    };
  });
};

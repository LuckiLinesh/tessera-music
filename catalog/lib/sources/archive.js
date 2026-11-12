/* Internet Archive: public-domain 78rpm sides, netlabel releases and
   taper-approved live recordings. Item-level rights vary, so each result carries
   the rights statement the item itself declares, and nothing is rehosted - files
   stream from archive.org with byte-range seeking. */

import { fetchJson } from '../http';
import { cleanName, yearOf } from '../text';

const IA = 'https://archive.org';

const searchUrl = (query, rows, start = 0) => {
  const params = new URLSearchParams();
  params.set('q', query);
  for (const field of ['identifier', 'title', 'creator', 'date', 'downloads', 'licenseurl', 'collection']) {
    params.append('fl[]', field);
  }
  params.append('sort[]', 'downloads desc');
  params.set('rows', String(rows));
  params.set('start', String(start));
  params.set('output', 'json');
  return `${IA}/advancedsearch.php?${params.toString()}`;
};

export const searchItems = async (query, rows = 8, start = 0) => {
  const json = await fetchJson(searchUrl(query, rows, start), { timeout: 12000 });
  return json?.response?.docs || [];
};

export const itemMeta = async (identifier) => {
  const json = await fetchJson(`${IA}/metadata/${encodeURIComponent(identifier)}`, {
    timeout: 12000,
  });
  return json;
};

const parseLength = (value) => {
  if (typeof value === 'number') return Math.round(value);
  const text = String(value || '');
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const parts = text.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const mp3Files = (meta) =>
  (meta?.files || [])
    .filter(
      (file) =>
        /\.mp3$/i.test(file.name) &&
        !/_(64|128|32)kb\.mp3$/i.test(file.name) &&
        !/spectrogram|sample/i.test(file.name) &&
        Number(file.size || 0) > 150_000,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

const fileTitle = (file, fallback) => {
  const raw = file.title || file.name.replace(/\.mp3$/i, '');
  return cleanName(String(raw).replace(/^\d{1,3}[.)\-]\s*/, '')) || fallback;
};

const playlistNames = (meta) =>
  new Set(
    (meta?.metadata?.collection || [])
      .toString()
      .split(',')
      .map((value) => value.trim()),
  );

const rightsFor = (meta) => {
  const meta2 = meta?.metadata || {};
  const declared = cleanName(meta2.rights || meta2.licenseurl || '');
  const collections = playlistNames(meta);
  if (collections.has('georgeblood') || collections.has('78rpm')) {
    return {
      license: 'Public domain recording (Great 78 Project)',
      rights: 'https://archive.org/details/georgeblood',
    };
  }
  if (collections.has('netlabels')) {
    return {
      license: declared || 'Released by the netlabel; check the item page',
      rights: `https://archive.org/details/${meta2.identifier || ''}`,
    };
  }
  if (collections.has('etree')) {
    return {
      license: 'Taper-approved live recording (Live Music Archive)',
      rights: `https://archive.org/details/${meta2.identifier || ''}`,
    };
  }
  return {
    license: declared || 'Check the item page for the rights statement',
    rights: `https://archive.org/details/${meta2.identifier || ''}`,
  };
};

const trackFrom = (doc, meta, file, index) => {
  const title = fileTitle(file, cleanName(doc.title || file.name));
  const creator = meta?.metadata?.creator ?? doc.creator;
  const artist =
    cleanName(Array.isArray(creator) ? creator[0] : creator) ||
    cleanName(meta?.metadata?.artist) ||
    'Unknown artist';
  const rights = rightsFor(meta);
  return {
    source: 'archive',
    nativeId: `${doc.identifier}/${file.name}`,
    title,
    artist,
    artistId: `archive:${artist}`,
    album: cleanName(meta?.metadata?.title || doc.title || ''),
    albumId: `archive:${doc.identifier}`,
    year: yearOf(doc.date || meta?.metadata?.date),
    duration: parseLength(file.length),
    art: `${IA}/services/img/${encodeURIComponent(doc.identifier)}`,
    explicit: false,
    genre: cleanName(meta?.metadata?.genre || ''),
    playback: {
      kind: 'audio',
      url: `${IA}/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name)}`,
      label: 'Full track',
      provider: 'Internet Archive',
      license: rights.license,
    },
    links: [
      { label: 'Archive item', href: `https://archive.org/details/${doc.identifier}` },
      ...(rights.rights && rights.rights !== `https://archive.org/details/${doc.identifier}`
        ? [{ label: 'Rights', href: rights.rights }]
        : []),
    ],
  };
};

const buildFromItems = async (docs, perItem = 1) => {
  const built = await Promise.all(
    docs.map(async (doc) => {
      const meta = await itemMeta(doc.identifier).catch(() => null);
      const files = mp3Files(meta).slice(0, perItem);
      return files.map((file, index) => trackFrom(doc, meta, file, index));
    }),
  );
  return built.flat().filter((track) => track.duration > 20 || track.duration === 0);
};

/** Song-name search: only collections where the item title is the song title. */
export const searchTracks = async (term, { limit = 8 } = {}) => {
  const safe = String(term || '').replace(/["\\]/g, ' ').trim();
  if (!safe) return { items: [], total: 0 };
  const docs = await searchItems(
    `(collection:georgeblood OR collection:78rpm) AND mediatype:audio AND title:("${safe}")`,
    Math.min(limit, 10),
  );
  const items = await buildFromItems(docs, 1);
  return { items, total: docs.length };
};

/** Album shelves for the browse pages. */
export const netlabelAlbums = async (subject = '', { limit = 8, perItem = 4 } = {}) => {
  const query = `collection:netlabels AND mediatype:audio${
    subject ? ` AND subject:"${String(subject).replace(/["\\]/g, ' ')}"` : ''
  }`;
  const docs = await searchItems(query, limit);
  return buildFromItems(docs, perItem);
};

export const publicDomainTracks = async ({ limit = 12 } = {}) => {
  const docs = await searchItems('collection:georgeblood AND mediatype:audio', Math.min(limit, 20));
  return buildFromItems(docs, 1);
};

export const latestLive = async ({ limit = 8, perItem = 3 } = {}) => {
  const docs = await searchItems('collection:etree AND mediatype:etree', limit);
  return buildFromItems(docs, perItem);
};

/** Used by the playback resolver to look for a full recording of one song. */
export const findFullVersion = async (title, artist) => {
  const safe = String(title || '').replace(/["\\]/g, ' ').trim();
  if (!safe) return [];
  const scope =
    '(collection:netlabels OR collection:georgeblood OR collection:78rpm OR collection:etree)';
  const docs = await searchItems(
    `mediatype:audio AND title:("${safe}") AND ${scope}`,
    6,
  ).catch(() => []);
  const items = await buildFromItems(docs, 2).catch(() => []);
  return items
    .filter((track) => track.duration === 0 || track.duration > 60)
    .slice(0, 5);
};

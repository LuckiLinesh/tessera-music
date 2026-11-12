/* MusicBrainz: the widest open metadata catalog there is - artists, recordings,
   releases, release groups, areas and relationships. Data is CC0. The API allows
   one request per second per client, so every call goes through the shared queue
   in lib/http.js. Covers are served by the Cover Art Archive, which redirects to
   the image, so a plain <img> can use it directly. */

import { fetchJson, USER_AGENT } from '../http';
import { cleanName, seconds, yearOf } from '../text';

const MB = 'https://musicbrainz.org/ws/2';

const esc = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

const FIELD = {
  track: 'recording',
  artist: 'artist',
  album: 'releasegroup',
};

export const buildQuery = (term, kind = 'track', filters = {}) => {
  const parts = [];
  const clean = String(term || '').trim();
  if (clean) parts.push(`${FIELD[kind] || 'recording'}:("${esc(clean)}")`);
  if (filters.country) parts.push(`country:${filters.country}`);
  if (filters.genre) parts.push(`tag:"${esc(filters.genre)}"`);
  if (filters.decade) {
    const start = Number(filters.decade);
    parts.push(`date:[${start} TO ${start + 9}]`);
  }
  if (filters.artist) parts.push(`artist:("${esc(filters.artist)}")`);
  if (!parts.length) parts.push('*');
  return parts.join(' AND ');
};

const mb = (path) => {
  const url = `${MB}/${path}${path.includes('?') ? '&' : '?'}fmt=json`;
  return fetchJson(url, {
    headers: { 'user-agent': USER_AGENT },
    spacingMs: 1100,
    timeout: 12000,
    tries: 3,
  });
};

const artistCredit = (credit) => {
  if (!Array.isArray(credit) || !credit.length) return { name: '', id: '' };
  return {
    name: cleanName(credit.map((part) => `${part.name || ''}${part.joinphrase || ''}`).join('')),
    id: credit[0]?.artist?.id || '',
  };
};

const coverFor = (releaseGroupId) =>
  releaseGroupId ? `https://coverartarchive.org/release-group/${releaseGroupId}/front-250` : '';

const bestRelease = (releases) => {
  if (!Array.isArray(releases) || !releases.length) return null;
  return (
    releases.find((release) => release['release-group']?.['primary-type'] === 'Album') ||
    releases[0]
  );
};

const fromRecording = (recording) => {
  const credit = artistCredit(recording['artist-credit']);
  const release = bestRelease(recording.releases);
  const group = release?.['release-group'] || {};
  const year = yearOf(recording['first-release-date'] || release?.date || group['first-release-date']);
  return {
    source: 'musicbrainz',
    nativeId: recording.id,
    title: cleanName(recording.title),
    artist: credit.name,
    artistId: credit.id,
    album: cleanName(release?.title || ''),
    albumId: group.id || '',
    year,
    duration: seconds(recording.length),
    art: coverFor(group.id),
    score: recording.score || 0,
    explicit: false,
    links: [
      { label: 'MusicBrainz', href: `https://musicbrainz.org/recording/${recording.id}` },
    ],
    playback: null,
  };
};

export const searchTracks = async (query, { limit = 25, offset = 0 } = {}) => {
  const json = await mb(
    `recording?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&inc=releases`,
  );
  const recordings = json.recordings || [];
  return {
    items: recordings.map(fromRecording),
    total: json.count || recordings.length,
  };
};

export const searchArtists = async (query, { limit = 25, offset = 0 } = {}) => {
  const json = await mb(`artist?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  const artists = json.artists || [];
  return {
    items: artists.map((artist) => ({
      source: 'musicbrainz',
      nativeId: artist.id,
      name: cleanName(artist.name),
      sortName: cleanName(artist['sort-name'] || ''),
      type: artist.type || '',
      country: artist.country || '',
      area: cleanName(artist.area?.name || ''),
      disambiguation: cleanName(artist.disambiguation || ''),
      begin: artist['life-span']?.begin || '',
      end: artist['life-span']?.end || '',
      score: artist.score || 0,
      tags: (artist.tags || []).sort((a, b) => b.count - a.count).slice(0, 6).map((tag) => tag.name),
    })),
    total: json.count || artists.length,
  };
};

export const searchAlbums = async (query, { limit = 25, offset = 0 } = {}) => {
  const json = await mb(
    `release-group?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
  );
  const groups = json['release-groups'] || [];
  return {
    items: groups.map((group) => ({
      source: 'musicbrainz',
      nativeId: group.id,
      title: cleanName(group.title),
      artist: artistCredit(group['artist-credit']).name,
      artistId: artistCredit(group['artist-credit']).id,
      year: yearOf(group['first-release-date']),
      type: group['primary-type'] || 'Release',
      secondary: (group['secondary-types'] || []).join(', '),
      art: coverFor(group.id),
      score: group.score || 0,
    })),
    total: json.count || groups.length,
  };
};

const LINK_RANK = {
  wikipedia: 0,
  wikidata: 1,
  'official homepage': 2,
  discogs: 3,
  allmusic: 4,
  bandcamp: 5,
  youtube: 6,
  soundcloud: 7,
  instagram: 8,
  facebook: 9,
};

export const getArtist = async (id) => {
  const json = await mb(`artist/${encodeURIComponent(id)}?inc=url-rels+tags+genres`);
  const tags = [...(json.genres || []), ...(json.tags || [])]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 8)
    .map((tag) => tag.name);
  const links = (json.relations || [])
    .filter((relation) => relation.url?.resource && /^https?:/i.test(relation.url.resource))
    .map((relation) => ({
      type: relation.type || 'link',
      label: relation.type === 'official homepage' ? 'Official site' : relation.type,
      href: relation.url.resource,
    }))
    // Wikipedia must survive the cap: it is how the bio is found.
    .sort((a, b) => (LINK_RANK[a.type] ?? 50) - (LINK_RANK[b.type] ?? 50))
    .slice(0, 12);
  return {
    id: json.id,
    name: cleanName(json.name),
    sortName: cleanName(json['sort-name'] || ''),
    type: json.type || 'Artist',
    country: json.country || '',
    area: cleanName(json.area?.name || ''),
    begin: json['life-span']?.begin || '',
    end: json['life-span']?.end || '',
    ended: Boolean(json['life-span']?.ended),
    disambiguation: cleanName(json.disambiguation || ''),
    tags,
    links,
  };
};

export const getArtistAlbums = async (id, { limit = 24, offset = 0 } = {}) => {
  const json = await mb(
    `release-group?artist=${encodeURIComponent(id)}&type=album|ep|single&limit=${limit}&offset=${offset}&inc=artist-credits`,
  );
  const groups = json['release-groups'] || [];
  return {
    items: groups
      .map((group) => ({
        id: group.id,
        title: cleanName(group.title),
        year: yearOf(group['first-release-date']),
        type: group['primary-type'] || 'Release',
        secondary: (group['secondary-types'] || []).join(', '),
        art: coverFor(group.id),
        artist: cleanName(group['artist-credit']?.[0]?.name || ''),
      }))
      .sort((a, b) => (b.year || 0) - (a.year || 0)),
    total: json['release-group-count'] || groups.length,
  };
};

export const getArtistTracks = async (id, { limit = 10 } = {}) => {
  // `recording?artist=` is not a browse filter for recordings; the field query
  // `arid:` is the supported way to list an act's recordings.
  const json = await mb(
    `recording?query=${encodeURIComponent(`arid:${id}`)}&limit=${limit}&inc=releases`,
  );
  return (json.recordings || []).map(fromRecording);
};

export const getReleaseGroup = async (id) => {
  const json = await mb(
    `release-group/${encodeURIComponent(id)}?inc=artist-credits+releases+tags+genres`,
  );
  const releases = (json.releases || [])
    .map((release) => ({
      id: release.id,
      title: cleanName(release.title),
      date: release.date || '',
      country: release.country || '',
      status: release.status || '',
      tracks: release['track-count'] || 0,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    id: json.id,
    title: cleanName(json.title),
    artist: artistCredit(json['artist-credit']).name,
    artistId: artistCredit(json['artist-credit']).id,
    year: yearOf(json['first-release-date']),
    type: json['primary-type'] || 'Release',
    secondary: (json['secondary-types'] || []).join(', '),
    art: coverFor(json.id),
    tags: (json.tags || []).sort((a, b) => b.count - a.count).slice(0, 6).map((tag) => tag.name),
    releases,
  };
};

export const getRelease = async (id) => {
  const json = await mb(
    `release/${encodeURIComponent(id)}?inc=recordings+artist-credits+release-groups+labels`,
  );
  const tracks = [];
  for (const medium of json.media || []) {
    for (const track of medium.tracks || []) {
      tracks.push({
        id: track.recording?.id || track.id,
        title: cleanName(track.title),
        artist: artistCredit(track['artist-credit'] || json['artist-credit']).name,
        artistId: artistCredit(track['artist-credit'] || json['artist-credit']).id,
        duration: seconds(track.length || track.recording?.length),
        number: track.number || '',
        disc: medium.position || 1,
      });
    }
  }
  return {
    id: json.id,
    title: cleanName(json.title),
    artist: artistCredit(json['artist-credit']).name,
    artistId: artistCredit(json['artist-credit']).id,
    date: json.date || '',
    year: yearOf(json.date),
    country: json.country || '',
    label: cleanName(json['label-info']?.[0]?.label?.name || ''),
    groupId: json['release-group']?.id || '',
    art: coverFor(json['release-group']?.id),
    tracks,
  };
};

/** Convert a bare recording id into the same shape search returns. */
export const getRecording = async (id) => {
  const json = await mb(`recording/${encodeURIComponent(id)}?inc=releases+artist-credits`);
  return fromRecording(json);
};

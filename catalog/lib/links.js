const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const artistHref = (track) => {
  const id = track?.artistId || '';
  if (UUID.test(id)) return `/artist?id=${id}`;
  if (track?.artist) return `/search?q=${encodeURIComponent(track.artist)}`;
  return '/search';
};

export const albumHref = (track) => {
  const id = track?.albumId || '';
  if (UUID.test(id)) return `/album?src=musicbrainz&id=${id}`;
  if (id.startsWith('deezer:')) return `/album?src=deezer&id=${id.slice(7)}`;
  if (id.startsWith('itunes:')) return `/album?src=itunes&id=${id.slice(7)}`;
  if (track?.album) return `/search?q=${encodeURIComponent(`${track.album} ${track.artist || ''}`)}`;
  return '';
};

export const sourceLabel = (source) =>
  ({
    musicbrainz: 'MusicBrainz',
    itunes: 'Apple Music',
    deezer: 'Deezer',
    audius: 'Audius',
    archive: 'Internet Archive',
    jamendo: 'Jamendo',
    youtube: 'YouTube',
    openverse: 'Openverse',
  })[source] || source;

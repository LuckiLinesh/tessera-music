export const fmtTime = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const fmtCount = (value) => {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
};

export const tierLabel = (tier) =>
  tier === 'full' ? 'Full song' : tier === 'embed' ? 'YouTube' : tier === 'preview' ? 'Preview' : 'No audio';

export const tierClass = (tier) =>
  tier === 'full'
    ? 'badge badge--full'
    : tier === 'embed'
      ? 'badge badge--embed'
      : tier === 'preview'
        ? 'badge badge--preview'
        : 'badge badge--none';

export const initials = (value) =>
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

export const SOURCE_SHORT = {
  musicbrainz: 'MusicBrainz',
  itunes: 'Apple',
  deezer: 'Deezer',
  audius: 'Audius',
  archive: 'Archive',
  jamendo: 'Jamendo',
  youtube: 'YouTube',
  openverse: 'Openverse',
};

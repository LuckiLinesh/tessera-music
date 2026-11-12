/* Shared text helpers. Every source spells the same song differently, so all
   matching in this app goes through these functions instead of raw equality. */

const EDITION_WORDS =
  /\b(feat|ft|featuring|with|remaster|remastered|remasterizado|version|edit|radio edit|official|audio|video|lyric|lyrics|hd|hq|mono|stereo|live|deluxe|explicit|clean|bonus|single)\b/g;

export const stripAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Title as a listener hears it: no brackets, punctuation, accents or edition words. */
export const songKey = (value) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(EDITION_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Artist key with the leading article removed, so "The Beatles" == "Beatles". */
export const artistKey = (value) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const pairKey = (title, artist) => `${songKey(title)}|${artistKey(artist)}`;

export const titleWords = (value) =>
  songKey(value)
    .split(' ')
    .filter((word) => word.length > 2);

/** True when two names refer to the same act without one merely containing the other. */
export const sameArtist = (a, b) => {
  const left = artistKey(a);
  const right = artistKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const tokens = (key) =>
    key
      .split(' ')
      .filter((token) => token.length > 2);
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  const [short, long] =
    leftTokens.length <= rightTokens.length ? [leftTokens, rightTokens] : [rightTokens, leftTokens];
  const shared = short.filter((token) => long.includes(token));
  if (shared.length !== short.length) return false;
  const extra = long.length - short.length;
  // A one-word act is never the same as a longer collaboration: "Queen" is not
  // "Queen + Paul Rodgers", and "Queen" is not "Queen Latifah".
  if (short.length === 1) return extra === 0;
  // "Fela Kuti" and "Fela Anikulapo Kuti" are the same person; a longer suffix
  // with two or more extra words usually names a different act.
  return extra <= 1;
};

/** 0..1 similarity based on shared significant words. */
export const titleSimilarity = (a, b) => {
  const left = new Set(titleWords(a));
  const right = new Set(titleWords(b));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const word of left) if (right.has(word)) hits += 1;
  return hits / Math.max(left.size, right.size);
};

export const isSameSong = (aTitle, aArtist, bTitle, bArtist) =>
  titleSimilarity(aTitle, bTitle) >= 0.8 && (!artistKey(aArtist) || sameArtist(aArtist, bArtist));

export const first = (value) => (Array.isArray(value) ? value[0] : value);

export const yearOf = (date) => {
  const match = /^(\d{4})/.exec(String(date || ''));
  return match ? Number(match[1]) : null;
};

export const decodeEntities = (value) =>
  String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export const cleanName = (value) => decodeEntities(value).replace(/\s+/g, ' ').trim();

export const seconds = (milliseconds) => Math.round((Number(milliseconds) || 0) / 1000);

export const safeQuery = (value, max = 120) =>
  String(value || '')
    .replace(/["\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

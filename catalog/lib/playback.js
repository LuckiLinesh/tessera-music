/* The honest answer to "can I actually hear this?".
   A metadata catalog will happily describe a song it cannot play. When someone
   presses play on such a result, this looks for the same song in the catalogs
   that do hold authorised audio, and reports exactly what it found.

   A different act performing the same song counts as a cover, not as the
   original. It is still a legitimate listen, so it is returned - labelled. */

import { artistKey, isSameSong, songKey, titleSimilarity } from './text';
import { findFullVersion } from './sources/archive';
import { searchTracks as audiusSearch } from './sources/audius';
import { searchTracks as jamendoSearch } from './sources/jamendo';
import { searchTracks as openverseSearch } from './sources/openverse';
import { findVideo, asPlayback } from './sources/youtube';
import { config } from './keys';

/** True when both names clearly mean the same act. */
const matchesArtist = (candidate, artist) => {
  const a = artistKey(candidate);
  const b = artistKey(artist);
  if (!a || !b) return false;
  if (a === b) return true;
  const left = a.split(' ').filter((word) => word.length > 2);
  const right = b.split(' ').filter((word) => word.length > 2);
  return left.some((word) => right.includes(word));
};

const scoreCandidate = (candidate, title, artist) => {
  const exactTitle = songKey(candidate.title) === songKey(title);
  const sameSong = isSameSong(candidate.title, candidate.artist, title, artist);
  const similarTitle = titleSimilarity(candidate.title, title) >= 0.8;

  let score = 0;
  if (exactTitle) score += 50;
  else if (sameSong) score += 42;
  else if (similarTitle) score += 26; // probably a cover of the same song
  else return -1;

  if (matchesArtist(candidate.artist, artist)) score += 25;
  else if (candidate.artist && artist) score += 4;

  if ((candidate.duration || 0) > 90) score += 12;
  if (candidate.playback?.kind === 'audio') score += 10;
  return score;
};

const candidatesFor = async (title, artist) => {
  const query = `${title} ${artist || ''}`.trim();
  const jobs = [
    findFullVersion(title, artist).catch(() => []),
    audiusSearch(query, { limit: 10 })
      .then((result) => result.items || [])
      .catch(() => []),
    jamendoSearch(query, { limit: 10 })
      .then((result) => result.items || [])
      .catch(() => []),
    config.openverse
      ? openverseSearch(query, { limit: 10 })
          .then((result) => result.items || [])
          .catch(() => [])
      : Promise.resolve([]),
  ];
  const groups = await Promise.all(jobs);
  return groups.flat().filter((item) => item?.playback);
};

export const resolvePlayback = async ({ title, artist, video = true }) => {
  const [candidates, youtube] = await Promise.all([
    candidatesFor(title, artist),
    video ? findVideo(title, artist).catch(() => null) : Promise.resolve(null),
  ]);

  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, title, artist) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.candidate || null;
  const bestIsSameAct = Boolean(best && artist) && matchesArtist(best.artist, artist);

  // An official YouTube video of the exact song is the better listen for a
  // commercial original, but a full open audio copy of the same act wins over
  // an embed because it is the actual recording file. A cover never beats the
  // official video.
  if (youtube && (!best || !bestIsSameAct)) {
    return {
      kind: 'youtube',
      playback: asPlayback(youtube),
      track: null,
      alternatives: ranked.slice(0, 4).map((entry) => entry.candidate),
      observed: youtube.channel,
      cover: false,
    };
  }

  if (best) {
    const isCover = Boolean(artist) && !bestIsSameAct;
    const playback =
      best.playback.kind === 'audio' && isCover
        ? { ...best.playback, label: 'Full cover', cover: true }
        : best.playback;
    return {
      kind: best.playback.kind === 'audio' ? 'full' : 'preview',
      playback,
      track: best,
      alternatives: ranked.slice(1, 5).map((entry) => entry.candidate),
      observed: best.artist,
      cover: best.playback.kind === 'audio' && isCover,
    };
  }

  if (youtube) {
    return {
      kind: 'youtube',
      playback: asPlayback(youtube),
      track: null,
      alternatives: [],
      observed: youtube.channel,
      cover: false,
    };
  }

  return { kind: 'none', playback: null, track: null, alternatives: [], observed: '', cover: false };
};

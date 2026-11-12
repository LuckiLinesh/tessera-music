/* One result list from many catalogs. The rules are simple and testable:
   - group claims that name the same song by the same act,
   - keep the best metadata for display,
   - keep every source that confirmed it,
   - prefer real playback over previews over nothing. */

import { artistKey, isSameSong, pairKey, songKey, yearOf } from './text';

export const PLAYBACK_RANK = {
  audio: 5,
  youtube: 4,
  preview: 2,
  none: 0,
};

export const playbackTier = (playback) => {
  if (!playback) return 'none';
  if (playback.kind === 'audio') return 'full';
  if (playback.kind === 'youtube') return 'embed';
  if (playback.kind === 'preview') return 'preview';
  return 'none';
};

const SOURCE_ORDER = ['musicbrainz', 'deezer', 'itunes', 'audius', 'jamendo', 'archive', 'openverse'];

const sourceWeight = (source) => {
  const index = SOURCE_ORDER.indexOf(source);
  return index === -1 ? 0 : SOURCE_ORDER.length - index;
};

const betterPlayback = (a, b) => {
  const left = a ? PLAYBACK_RANK[a.kind] || 0 : 0;
  const right = b ? PLAYBACK_RANK[b.kind] || 0 : 0;
  return right > left ? b : a;
};

/* How strongly does each catalog itself rank this result? Deezer and Apple put
   the release people mean at the top of a search; MusicBrainz only orders by
   text relevance, so its first hit can easily be an obscure cover. Without
   this signal a query for a famous song returns twenty anonymous covers and
   never shows the original. */
const PROMINENCE = {
  deezer: [30, 5],
  itunes: [26, 5],
  musicbrainz: [8, 1.5],
  audius: [6, 1],
  jamendo: [6, 0.5],
  archive: [6, 0.5],
  openverse: [6, 0.5],
};

export const prominenceOf = (positions = {}) => {
  let best = 0;
  for (const [source, index] of Object.entries(positions)) {
    const [top, step] = PROMINENCE[source] || [0, 0];
    if (top) best = Math.max(best, Math.max(0, top - index * step));
  }
  return best;
};

const mergeInto = (target, claim) => {
  target.sources = [...new Set([...target.sources, claim.source])];
  if (!target.title && claim.title) target.title = claim.title;
  if (!target.artist && claim.artist) target.artist = claim.artist;
  if (!target.album && claim.album) target.album = claim.album;
  if (!target.albumId && claim.albumId) target.albumId = claim.albumId;
  if (!target.artistId && claim.artistId) target.artistId = claim.artistId;
  if (!target.year && claim.year) target.year = claim.year;
  if (!target.art && claim.art) target.art = claim.art;
  if (!target.explicit && claim.explicit) target.explicit = Boolean(claim.explicit);
  target.duration = Math.max(target.duration || 0, claim.duration || 0);
  target.playback = betterPlayback(target.playback, claim.playback);
  // Keep the best (i.e. lowest) rank this track reached in each catalog.
  if (claim.position !== undefined && claim.position !== null && claim.source) {
    const current = target.pos[claim.source];
    if (current === undefined || claim.position < current) {
      target.pos[claim.source] = claim.position;
    }
  }
  if (claim.links?.length) {
    for (const link of claim.links) {
      if (!target.links.some((existing) => existing.href === link.href)) target.links.push(link);
    }
  }
  if (claim.score) target.score = Math.max(target.score || 0, claim.score);
  if (!target.native?.musicbrainz && claim.source === 'musicbrainz') target.native.musicbrainz = claim.nativeId;
  if (!target.native?.deezer && claim.source === 'deezer') target.native.deezer = claim.nativeId;
  if (!target.native?.itunes && claim.source === 'itunes') target.native.itunes = claim.nativeId;
  return target;
};

const blank = (claim) => ({
  id: '',
  key: pairKey(claim.title, claim.artist),
  title: claim.title || '',
  artist: claim.artist || '',
  artistId: claim.artistId || '',
  album: claim.album || '',
  albumId: claim.albumId || '',
  year: claim.year || null,
  duration: claim.duration || 0,
  art: claim.art || '',
  explicit: Boolean(claim.explicit),
  genre: claim.genre || '',
  sources: [claim.source],
  playback: claim.playback || null,
  links: [...(claim.links || [])],
  native: { [claim.source]: claim.nativeId },
  pos: claim.position !== undefined && claim.position !== null ? { [claim.source]: claim.position } : {},
  score: claim.score || 0,
  tier: 'none',
});

const confidence = (track) => {
  let value = sourceWeight(track.sources[0]);
  value += (PLAYBACK_RANK[track.playback?.kind] || 0) * 3;
  value += track.sources.length * 2;
  if (track.art) value += 1;
  return value;
};

/** Turn raw claims into unified tracks, best first. */
export const mergeTracks = (claims, { limit = 25, query = '' } = {}) => {
  const groups = [];
  const exact = new Map();

  for (const claim of claims) {
    if (!claim?.title) continue;
    const key = pairKey(claim.title, claim.artist);
    let group = exact.get(key);

    if (!group) {
      // Only fall back to fuzzy matching when the exact key missed, and never
      // merge two different acts - "Summertime" belongs to many artists.
      group = groups.find(
        (candidate) =>
          candidate.artist &&
          claim.artist &&
          isSameSong(candidate.title, candidate.artist, claim.title, claim.artist),
      );
      if (group) {
        exact.set(key, group);
      }
    }

    if (group) {
      mergeInto(group, claim);
    } else {
      const created = blank(claim);
      groups.push(created);
      exact.set(key, created);
    }
  }

  const wantedTitle = songKey(query);
  const wantedArtist = artistKey(query);
  const queryWords = new Set(
    wantedArtist.split(' ').filter((word) => word.length > 1),
  );

  for (const track of groups) {
    track.tier = playbackTier(track.playback);
    track.id = `${track.native.musicbrainz ? 'mb' : track.playback?.provider?.toLowerCase() || 'x'}:${track.key}`;
    track.confidence = confidence(track);
    const trackTitle = songKey(track.title);
    // "michael jackson billie jean" is a song-plus-artist query, not a title.
    // Recognise the act inside the query so the exact recording still wins.
    const trackArtistWords = artistKey(track.artist)
      .split(' ')
      .filter((word) => word.length > 1);
    const artistInQuery =
      trackArtistWords.length > 0 && trackArtistWords.every((word) => queryWords.has(word));
    const titleHit =
      wantedTitle === trackTitle
        ? 26
        : artistInQuery && trackTitle.length >= 4 && wantedTitle.includes(trackTitle)
          ? 22
          : 0;
    const titleStart =
      wantedTitle && trackTitle.startsWith(wantedTitle) && !titleHit ? 10 : 0;
    const artistHit = artistInQuery ? 14 : 0;
    const playbackBoost = track.tier === 'full' ? 8 : track.tier === 'embed' ? 6 : track.tier === 'preview' ? 3 : 0;
    // A recording the canonical metadata catalog agrees exists should outrank an
    // unattributed cover of the same title, even when both can play in full.
    const canonical = track.sources.includes('musicbrainz') ? 8 : 0;
    // Being the first hit in a commercial catalog is the strongest available
    // signal of what a listener meant by an ambiguous two-word query.
    const topHit = Object.entries(track.pos).some(
      ([source, index]) => index === 0 && (source === 'deezer' || source === 'itunes'),
    )
      ? 14
      : 0;
    // Relevance and the catalog's own ranking come first; playback quality only
    // breaks ties. A full-length upload of an unknown cover must never outrank
    // the commercial original of the song the listener asked for.
    track.rank =
      titleHit +
      titleStart +
      artistHit +
      topHit +
      prominenceOf(track.pos) +
      playbackBoost +
      canonical +
      track.confidence +
      Math.min(track.score, 100) / 20;
  }

  groups.sort((a, b) => b.rank - a.rank || String(a.title).localeCompare(String(b.title)));

  // A second pass collapses anything that ended up adjacent and identical after
  // sorting (different keys, same performance, e.g. accented spellings).
  const deduped = [];
  for (const track of groups) {
    const twin = deduped.find((existing) => isSameSong(existing.title, existing.artist, track.title, track.artist));
    if (twin) {
      mergeInto(twin, {
        source: track.sources[0],
        nativeId: track.native[track.sources[0]],
        ...track,
        sources: track.sources,
      });
      twin.sources = [...new Set([...twin.sources, ...track.sources])];
      twin.playback = betterPlayback(twin.playback, track.playback);
      twin.confidence = confidence(twin);
      continue;
    }
    deduped.push(track);
  }

  return deduped.slice(0, limit);
};

export const mergeArtists = (claims, { limit = 25, query = '' } = {}) => {
  const seen = new Map();
  const wanted = artistKey(query);
  for (const claim of claims) {
    if (!claim?.name) continue;
    const key = artistKey(claim.name);
    const existing = seen.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, claim.source])];
      if (!existing.country && claim.country) existing.country = claim.country;
      if (!existing.art && claim.art) existing.art = claim.art;
    } else {
      seen.set(key, {
        ...claim,
        key,
        sources: [claim.source],
        rank:
          (claim.source === 'musicbrainz' ? 40 : 10) +
          (wanted && key === wanted ? 30 : 0) +
          Math.min(claim.score || 0, 100) / 10,
      });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit);
};

export const mergeAlbums = (claims, { limit = 25, query = '' } = {}) => {
  const seen = new Map();
  const wanted = songKey(query);
  for (const claim of claims) {
    if (!claim?.title) continue;
    const key = `${songKey(claim.title)}|${artistKey(claim.artist)}`;
    const existing = seen.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, claim.source])];
      if (!existing.art && claim.art) existing.art = claim.art;
      if (!existing.year && claim.year) existing.year = claim.year;
      if (!existing.trackCount && claim.trackCount) existing.trackCount = claim.trackCount;
    } else {
      seen.set(key, {
        ...claim,
        key,
        sources: [claim.source],
        rank:
          (claim.source === 'musicbrainz' ? 40 : 12) +
          (wanted && songKey(claim.title) === wanted ? 30 : 0) +
          (claim.year ? 2 : 0),
      });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.rank - a.rank || (b.year || 0) - (a.year || 0))
    .slice(0, limit);
};

export const normalizeYear = (value) => yearOf(value);

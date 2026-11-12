import { NextResponse } from 'next/server';
import { getArtist, getArtistAlbums, getArtistTracks } from '@/lib/sources/musicbrainz';
import { searchArtists, searchTracks } from '@/lib/search';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const wikiTitle = (href) => {
  try {
    const url = new URL(href);
    if (!/(^|\.)wikipedia\.org$/i.test(url.hostname)) return '';
    const match = /\/wiki\/(.+)$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
};

/** Wikipedia's public summary endpoint: no key, one request per artist page. */
const wikipediaSummary = async (title) => {
  if (!title) return null;
  return cached(`wiki:${title}`, 24 * 60 * 60 * 1000, async () => {
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        {
          headers: {
            accept: 'application/json',
            'user-agent': 'TesseraCatalog/1.0 ( https://github.com/tessera-catalog )',
          },
          signal: AbortSignal.timeout(7000),
        },
      );
      if (!response.ok) return null;
      const json = await response.json();
      return {
        extract: json.extract || '',
        description: json.description || '',
        href: json.content_urls?.desktop?.page || '',
        image: json.thumbnail?.source || '',
      };
    } catch {
      return null;
    }
  });
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || '';
  const name = (searchParams.get('name') || '').slice(0, 160);

  try {
    if (id) {
      const [artist, albums, tracks] = await Promise.all([
        getArtist(id),
        getArtistAlbums(id, { limit: 24 }).catch(() => ({ items: [] })),
        getArtistTracks(id, { limit: 8 }).catch(() => []),
      ]);
      const wikiLink = (artist.links || []).find((link) => link.type === 'wikipedia');
      const bio = await wikipediaSummary(wikiTitle(wikiLink?.href || '')).catch(() => null);
      return NextResponse.json(
        { artist: { ...artist, bio }, albums: albums.items || [], tracks },
        { headers: { 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' } },
      );
    }

    if (name) {
      // No MusicBrainz id: build the best page we can from search + playback.
      const found = await searchArtists({ q: name, limit: 1 });
      const artist = found.items?.[0];
      if (artist?.nativeId && artist.sources?.includes('musicbrainz')) {
        return NextResponse.redirect(
          new URL(`/api/artist?id=${encodeURIComponent(artist.nativeId)}`, request.url),
        );
      }
      const tracks = await searchTracks({ q: name, limit: 20 });
      return NextResponse.json({
        artist: {
          id: '',
          name,
          type: 'Artist',
          country: '',
          area: '',
          tags: [],
          links: [],
          bio: null,
        },
        albums: [],
        tracks: tracks.items || [],
        notes: ['No MusicBrainz match - showing catalog results for this name.'],
      });
    }

    return NextResponse.json({ error: 'id or name is required' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'lookup failed' }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { searchAlbums, searchArtists, searchTracks } from '@/lib/search';

export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

const clamp = (value, min, max, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') || 'track';
  const q = (searchParams.get('q') || '').slice(0, 160);
  const page = clamp(searchParams.get('page'), 1, 20, 1);
  const limit = clamp(searchParams.get('limit'), 5, 40, 20);
  const sources = (searchParams.get('sources') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const filters = {
    country: (searchParams.get('country') || '').slice(0, 3).toUpperCase(),
    genre: (searchParams.get('genre') || '').slice(0, 40),
    decade: (searchParams.get('decade') || '').slice(0, 4),
  };

  if (!q && !filters.country && !filters.genre && !filters.decade) {
    return NextResponse.json(
      { items: [], total: 0, page, perPage: limit, hasMore: false, sources: [], notes: [] },
      { headers: noStore },
    );
  }

  try {
    const data =
      kind === 'artist'
        ? await searchArtists({ q, page, limit, sources })
        : kind === 'album'
          ? await searchAlbums({ q, page, limit, sources })
          : await searchTracks({ q, ...filters, page, limit, sources });

    return NextResponse.json(data, {
      // Browsers must revalidate (max-age=0) so a deploy or a ranking fix is
      // visible immediately; CDNs may still absorb the load for ten minutes.
      headers: {
        'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'The search could not be completed.',
        detail: error?.message || 'unknown error',
        items: [],
        sources: [],
      },
      { status: 502, headers: noStore },
    );
  }
}

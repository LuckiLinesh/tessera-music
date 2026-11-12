import { NextResponse } from 'next/server';
import { explore } from '@/lib/search';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') || '').slice(0, 3).toUpperCase();
  const genre = (searchParams.get('genre') || '').slice(0, 40);
  const decade = (searchParams.get('decade') || '').slice(0, 4);
  const page = Math.max(1, Math.min(20, Number(searchParams.get('page')) || 1));

  if (!country && !genre && !decade) {
    return NextResponse.json({ error: 'choose a country, genre or decade' }, { status: 400 });
  }

  try {
    const data = await explore({ country, genre, decade, page, limit: 20 });
    return NextResponse.json(data, {
      headers: { 'cache-control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400' },
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'explore failed', items: [] }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { resolvePlayback } from '@/lib/playback';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').slice(0, 160);
  const artist = (searchParams.get('artist') || '').slice(0, 160);
  const video = searchParams.get('video') !== '0';

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const result = await cached(`playback:${title}:${artist}:${video}`, 30 * 60 * 1000, () =>
      resolvePlayback({ title, artist, video }),
    );
    return NextResponse.json(result, {
      headers: { 'cache-control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (error) {
    return NextResponse.json(
      { kind: 'none', playback: null, track: null, alternatives: [], error: error?.message },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}

import { NextResponse } from 'next/server';
import { publicDomainTracks, netlabelAlbums } from '@/lib/sources/archive';
import { trending as audiusTrending } from '@/lib/sources/audius';
import { trending as jamendoTrending } from '@/lib/sources/jamendo';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const settle = (promise) =>
  promise.then(
    (value) => value || [],
    () => [],
  );

export async function GET() {
  const data = await cached('home:shelves', 60 * 60 * 1000, async () => {
    const [classics, netlabels, audius, jamendo] = await Promise.all([
      settle(publicDomainTracks({ limit: 10 })),
      settle(netlabelAlbums('', { limit: 5, perItem: 4 })),
      settle(audiusTrending({ limit: 10 })),
      settle(jamendoTrending({ limit: 10 })),
    ]);

    return {
      shelves: [
        {
          id: 'classics',
          title: 'Public-domain recordings',
          note: 'Complete 78rpm sides from the Internet Archive. Free to hear, in full.',
          items: classics,
        },
        {
          id: 'audius',
          title: 'New independent releases',
          note: 'Full-length tracks uploaded by the artists themselves on Audius.',
          items: audius,
        },
        {
          id: 'netlabels',
          title: 'Netlabel catalog',
          note: 'Openly licensed albums published for free distribution.',
          items: netlabels,
        },
        {
          id: 'jamendo',
          title: 'Creative Commons on Jamendo',
          note: 'Full songs under Jamendo and Creative Commons licences.',
          items: jamendo,
        },
      ].filter((shelf) => shelf.items.length),
    };
  });

  return NextResponse.json(data, {
    headers: { 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
  });
}

import { NextResponse } from 'next/server';
import { hasJamendo, hasYouTube, config } from '@/lib/keys';
import { cacheStats } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      sources: [
        {
          id: 'musicbrainz',
          label: 'MusicBrainz',
          role: 'Metadata for artists, recordings and releases worldwide',
          playback: 'none',
          configured: true,
          key: 'none',
          note: 'CC0 data. One request per second; results are cached.',
        },
        {
          id: 'itunes',
          label: 'Apple Music / iTunes',
          role: 'Artwork, release data and official previews',
          playback: 'preview',
          configured: true,
          key: 'none',
          note: 'Public search API. Previews are 30 seconds and labelled.',
        },
        {
          id: 'deezer',
          label: 'Deezer',
          role: 'International catalog, artwork and official previews',
          playback: 'preview',
          configured: true,
          key: 'none',
          note: 'Called from this server because Deezer does not allow browser CORS.',
        },
        {
          id: 'audius',
          label: 'Audius',
          role: 'Artist-uploaded independent music',
          playback: 'full',
          configured: true,
          key: 'none',
          note: 'Full-length streams supplied by the platform.',
        },
        {
          id: 'archive',
          label: 'Internet Archive',
          role: 'Public-domain 78s, netlabel releases, taper-approved live sets',
          playback: 'full',
          configured: true,
          key: 'none',
          note: 'Rights vary per item; each result carries the item rights statement.',
        },
        {
          id: 'youtube',
          label: 'YouTube',
          role: 'Authorised video playback for commercial releases',
          playback: 'embed',
          configured: hasYouTube(),
          key: 'YOUTUBE_API_KEY',
          note: 'Embedded official player with ads. Search costs 100 quota units.',
        },
        {
          id: 'jamendo',
          label: 'Jamendo',
          role: 'Creative Commons and Jamendo-licensed full tracks',
          playback: 'full',
          configured: hasJamendo(),
          key: 'JAMENDO_CLIENT_ID',
          note: 'Free client id from developer.jamendo.com.',
        },
        {
          id: 'openverse',
          label: 'Openverse',
          role: 'Openly licensed audio index',
          playback: 'full',
          configured: config.openverse,
          key: 'ENABLE_OPENVERSE=1',
          note: 'Small index and occasionally rate-limited; off by default.',
        },
      ],
      cache: cacheStats(),
      limits: {
        youtubeDailyUnits: 10000,
        youtubeSearchUnits: 100,
        musicbrainzRequestsPerSecond: 1,
      },
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

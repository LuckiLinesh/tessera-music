import { NextResponse } from 'next/server';
import { getRelease, getReleaseGroup } from '@/lib/sources/musicbrainz';
import { lookupAlbum as lookupItunes } from '@/lib/sources/itunes';
import { lookupAlbum as lookupDeezer } from '@/lib/sources/deezer';

export const dynamic = 'force-dynamic';

const simplifyItunes = (album, tracks) => ({
  id: String(album?.collectionId || ''),
  title: album?.collectionName || 'Album',
  artist: album?.artistName || '',
  artistId: String(album?.artistId || ''),
  year: album?.releaseDate ? Number(String(album.releaseDate).slice(0, 4)) : null,
  type: 'Album',
  art: String(album?.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
  source: 'itunes',
  tracks: (tracks || []).map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    artistId: '',
    duration: track.duration,
    number: track.number,
    playback: track.previewUrl
      ? {
          kind: 'preview',
          url: track.previewUrl,
          label: '30-second preview',
          provider: 'Apple Music',
          license: 'Promotional preview supplied by Apple',
        }
      : null,
  })),
  links: album?.collectionViewUrl
    ? [{ label: 'Apple Music', href: album.collectionViewUrl }]
    : [],
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get('src') || 'musicbrainz';
  const id = searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    if (src === 'itunes') {
      const { album, tracks } = await lookupItunes(id);
      return NextResponse.json(simplifyItunes(album, tracks), {
        headers: { 'cache-control': 'public, max-age=0, s-maxage=86400' },
      });
    }

    if (src === 'deezer') {
      const raw = await lookupDeezer(id);
      return NextResponse.json(
        {
          id: String(raw.id),
          title: raw.title,
          artist: raw.artist?.name || '',
          artistId: raw.artist?.id ? `deezer:${raw.artist.id}` : '',
          year: raw.release_date ? Number(String(raw.release_date).slice(0, 4)) : null,
          type: 'Album',
          art: raw.cover_xl || raw.cover_big || raw.cover_medium || '',
          source: 'deezer',
          tracks: (raw.tracks?.data || []).map((track) => ({
            id: String(track.id),
            title: track.title,
            artist: track.artist?.name || raw.artist?.name || '',
            artistId: '',
            duration: track.duration || 0,
            number: track.track_position || '',
            playback: track.preview
              ? {
                  kind: 'preview',
                  url: track.preview,
                  label: '30-second preview',
                  provider: 'Deezer',
                  license: 'Promotional preview supplied by Deezer',
                }
              : null,
          })),
          links: raw.link ? [{ label: 'Deezer', href: raw.link }] : [],
        },
        { headers: { 'cache-control': 'public, max-age=0, s-maxage=86400' } },
      );
    }

    const group = await getReleaseGroup(id);
    const release = group.releases?.[0];
    let tracks = [];
    if (release) {
      const detail = await getRelease(release.id).catch(() => null);
      tracks = (detail?.tracks || []).map((track) => ({
        ...track,
        playback: null,
      }));
    }
    const { releases, ...album } = group;
    return NextResponse.json(
      {
        ...album,
        source: 'musicbrainz',
        ownerId: album.artistId,
        releases,
        releaseId: release?.id || '',
        tracks,
        links: [
          { label: 'MusicBrainz', href: `https://musicbrainz.org/release-group/${id}` },
        ],
      },
      { headers: { 'cache-control': 'public, max-age=0, s-maxage=3600' } },
    );
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'lookup failed' }, { status: 502 });
  }
}

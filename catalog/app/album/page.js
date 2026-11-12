'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrackList } from '../components/TrackList';
import { IconExternal, IconHeart, IconPlay } from '../components/Icons';
import { usePlayer } from '../components/PlayerProvider';
import { fmtTime, initials } from '@/lib/format';
import { artistHref, sourceLabel } from '@/lib/links';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AlbumView() {
  const params = useSearchParams();
  const src = params.get('src') || 'musicbrainz';
  const id = params.get('id') || '';
  const { playQueue } = usePlayer();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('No album chosen.');
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/album?src=${encodeURIComponent(src)}&id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) setError(payload.error);
        setAlbum(payload);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError('The album lookup failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [src, id]);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="state">
        <p>{error}</p>
        <Link href="/search" className="btn btn--ghost">
          Back to search
        </Link>
      </div>
    );
  }

  if (!album) return null;

  const tracks = album.tracks || [];
  const playable = tracks.filter((track) => track.playback);
  const artistId = album.artistId || album.ownerId || '';
  const artistUrl = UUID.test(artistId)
    ? `/artist?id=${artistId}`
    : album.artist
      ? `/search?q=${encodeURIComponent(album.artist)}`
      : '/search';

  const playAll = () => {
    if (!tracks.length) return;
    playQueue(tracks, 0);
  };

  return (
    <div>
      <header
        style={{
          display: 'flex',
          gap: 22,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          padding: '6px 0 8px',
        }}
      >
        <div className="card__art" style={{ width: 190, height: 190, flex: 'none', borderRadius: 10 }}>
          {album.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.art} alt="" />
          ) : (
            <span style={{ fontSize: 30 }}>{initials(album.title)}</span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="eyebrow">{[album.type, album.secondary].filter(Boolean).join(' · ') || 'Release'}</span>
          <h1 style={{ marginTop: 6 }}>{album.title}</h1>
          <div className="meta" style={{ marginTop: 10 }}>
            <Link href={artistUrl} style={{ color: '#e6e6ee', fontWeight: 600 }}>
              {album.artist || 'Unknown artist'}
            </Link>
            {album.year ? <span>{album.year}</span> : <span>{album.date || ''}</span>}
            {album.label ? <span>{album.label}</span> : null}
            {tracks.length ? <span>{tracks.length} tracks</span> : null}
          </div>
          <div className="source-line">
            <span className="pill">{sourceLabel(album.source || src)}</span>
            {album.ownerId ? <span className="pill">MusicBrainz id</span> : null}
            {playable.length ? (
              <span className="pill pill--ok">
                {playable.length} of {tracks.length} rows have a direct stream
              </span>
            ) : (
              <span className="pill pill--warn">Playback resolved per track</span>
            )}
            {(album.links || []).slice(0, 4).map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="pill">
                {link.label} <IconExternal style={{ width: 10, height: 10, display: 'inline' }} />
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn--primary" onClick={playAll} disabled={!tracks.length}>
              <IconPlay style={{ width: 14, height: 14 }} /> Play album
            </button>
            {album.releaseId ? (
              <a
                className="btn btn--ghost"
                href={`https://musicbrainz.org/release/${album.releaseId}`}
                target="_blank"
                rel="noreferrer"
              >
                Release <IconExternal style={{ width: 13, height: 13 }} />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="section">
        {tracks.length ? (
          <TrackList tracks={tracks} showAlbum={false} showArt={false} />
        ) : (
          <div className="state">
            <p>
              This release exists in the catalog, but no track listing came back from the source.
              Open it where it is published to see the full sequence.
            </p>
          </div>
        )}
      </section>

      {album.releases?.length > 1 ? (
        <section className="section">
          <div className="section__head">
            <h2>Other pressings</h2>
            <span className="section__note">Same release group, different editions</span>
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Release</th>
                  <th>Date</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th>Tracks</th>
                </tr>
              </thead>
              <tbody>
                {album.releases.map((release) => (
                  <tr key={release.id}>
                    <td>{release.title}</td>
                    <td>{release.date || '—'}</td>
                    <td>{release.country || '—'}</td>
                    <td>{release.status || '—'}</td>
                    <td>{release.tracks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function AlbumPage() {
  return (
    <Suspense fallback={<div className="state">Loading album...</div>}>
      <AlbumView />
    </Suspense>
  );
}

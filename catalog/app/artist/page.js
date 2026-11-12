'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SourcePills, TrackList } from '../components/TrackList';
import { IconExternal } from '../components/Icons';
import { initials } from '@/lib/format';

function AlbumGrid({ albums }) {
  if (!albums?.length) return null;
  return (
    <div className="grid-cards">
      {albums.map((album) => (
        <Link
          key={album.id}
          href={`/album?src=musicbrainz&id=${encodeURIComponent(album.id)}`}
          className="card"
        >
          <div className="card__art">
            {album.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={album.art} alt="" loading="lazy" />
            ) : (
              initials(album.title)
            )}
          </div>
          <div className="card__title" title={album.title}>
            {album.title}
          </div>
          <div className="card__sub">
            {[album.year, album.type, album.secondary].filter(Boolean).join(' · ')}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ArtistView() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const name = params.get('name') || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id && !name) {
      setError('No artist chosen.');
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = id ? `id=${encodeURIComponent(id)}` : `name=${encodeURIComponent(name)}`;
    fetch(`/api/artist?${query}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) setError(payload.error);
        setData(payload);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError('The artist lookup failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, name]);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 180 }} />
        <div className="skeleton" style={{ height: 24, width: 220 }} />
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
          Search for this artist instead
        </Link>
      </div>
    );
  }

  const artist = data?.artist || {};
  const albums = data?.albums || [];
  const tracks = data?.tracks || [];
  const notes = data?.notes || [];

  const life = [artist.begin, artist.end].filter(Boolean).join(' - ');

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
        <div
          className="card__art"
          style={{ width: 168, height: 168, borderRadius: 999, flex: 'none' }}
        >
          {artist.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.art} alt="" style={{ borderRadius: 999 }} />
          ) : (
            <span style={{ fontSize: 34 }}>{initials(artist.name || name)}</span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="eyebrow">Artist</span>
          <h1 style={{ marginTop: 6 }}>{artist.name || name}</h1>
          <div className="meta" style={{ marginTop: 10 }}>
            {artist.type ? <span>{artist.type}</span> : null}
            {artist.country ? <span>{artist.country}</span> : null}
            {artist.area && artist.area !== artist.country ? <span>{artist.area}</span> : null}
            {life ? <span>{life}</span> : null}
            {artist.disambiguation ? <span>{artist.disambiguation}</span> : null}
          </div>
          <div className="source-line">
            <SourcePills
              sources={[...new Set(tracks.flatMap((track) => track.sources || []))]}
              max={6}
            />
            {artist.id ? (
              <a
                className="pill"
                href={`https://musicbrainz.org/artist/${artist.id}`}
                target="_blank"
                rel="noreferrer"
              >
                MusicBrainz <IconExternal style={{ width: 10, height: 10, display: 'inline' }} />
              </a>
            ) : null}
          </div>
          {artist.tags?.length ? (
            <div className="chip-row" style={{ marginTop: 12 }}>
              {artist.tags.map((tag) => (
                <Link key={tag} href={`/explore?genre=${encodeURIComponent(tag)}`} className="chip">
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}
          {artist.links?.length ? (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {artist.links.slice(0, 6).map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="chip"
                >
                  {link.label} <IconExternal style={{ width: 11, height: 11 }} />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {artist.bio?.extract ? (
        <section className="section" style={{ marginTop: 22 }}>
          <p className="lede" style={{ maxWidth: '78ch' }}>
            {artist.bio.extract}
          </p>
          {artist.bio.href ? (
            <a
              href={artist.bio.href}
              target="_blank"
              rel="noreferrer"
              className="section__note"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}
            >
              Read more on Wikipedia <IconExternal style={{ width: 11, height: 11 }} />
            </a>
          ) : null}
        </section>
      ) : null}

      {notes.map((note) => (
        <div className="notice" style={{ marginTop: 16 }} key={note}>
          {note}
        </div>
      ))}

      {albums.length ? (
        <section className="section">
          <div className="section__head">
            <h2>Releases</h2>
            <span className="section__note">Albums, EPs and singles, newest first</span>
          </div>
          <AlbumGrid albums={albums} />
        </section>
      ) : null}

      {tracks.length ? (
        <section className="section">
          <div className="section__head">
            <h2>Recordings</h2>
            <span className="section__note">Press play - each row resolves its own rights</span>
          </div>
          <TrackList tracks={tracks} />
        </section>
      ) : null}

      {!albums.length && !tracks.length ? (
        <div className="state">
          <p>
            No recordings are listed for this artist in the connected catalogs yet. Try a search by
            name.
          </p>
          <Link href={`/search?q=${encodeURIComponent(artist.name || name)}`} className="btn btn--ghost">
            Search {artist.name || name}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function ArtistPage() {
  return (
    <Suspense fallback={<div className="state">Loading artist...</div>}>
      <ArtistView />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SourcePills, TrackList } from '../components/TrackList';
import { IconNext, IconPrev } from '../components/Icons';
import { initials } from '@/lib/format';
import { sourceLabel } from '@/lib/links';
import { COUNTRIES, DECADES, GENRES } from '@/lib/facets';

const TABS = [
  ['track', 'Songs'],
  ['artist', 'Artists'],
  ['album', 'Albums'],
];

function StatusLine({ sources = [], notes = [] }) {
  if (!sources.length) return null;
  return (
    <div className="source-line" style={{ marginTop: 0, marginBottom: 16 }}>
      {sources.map((source) => (
        <span
          key={source.id}
          className={`pill${source.status === 'ok' ? ' pill--ok' : source.status === 'error' ? ' pill--warn' : ' pill--off'}`}
          title={source.note || `${source.count} results in ${source.ms} ms`}
        >
          {source.label}
          {source.status === 'ok' ? ` ${source.count}` : source.status === 'error' ? ' failed' : source.status === 'skipped' ? ' off' : ' 0'}
        </span>
      ))}
      {notes.map((note) => (
        <span key={note} className="pill pill--off">
          {note}
        </span>
      ))}
    </div>
  );
}

function ArtistCards({ artists }) {
  return (
    <div className="grid-cards">
      {artists.map((artist) => {
        const href =
          artist.source === 'musicbrainz'
            ? `/artist?id=${artist.nativeId}`
            : `/artist?name=${encodeURIComponent(artist.name)}`;
        return (
          <Link key={`${artist.key}-${artist.nativeId}`} href={href} className="card">
            <div className="card__art" style={{ borderRadius: 999 }}>
              {artist.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artist.art} alt="" loading="lazy" style={{ borderRadius: 999 }} />
              ) : (
                initials(artist.name)
              )}
            </div>
            <div className="card__title">{artist.name}</div>
            <div className="card__sub">
              {[artist.type, artist.country || artist.area].filter(Boolean).join(' · ') || 'Artist'}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function AlbumCards({ albums }) {
  return (
    <div className="grid-cards">
      {albums.map((album) => {
        const src = album.source;
        const href =
          src === 'musicbrainz' || src === 'itunes' || src === 'deezer'
            ? `/album?src=${src}&id=${encodeURIComponent(album.nativeId)}`
            : `/search?q=${encodeURIComponent(`${album.title} ${album.artist}`)}`;
        return (
          <Link key={`${album.key}-${album.nativeId}`} href={href} className="card">
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
            <div className="card__sub">{album.artist}</div>
            <div className="card__sub" style={{ marginTop: 6 }}>
              {[album.year, album.type].filter(Boolean).join(' · ')}
            </div>
            <div className="source-line">
              <SourcePills sources={album.sources} max={2} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();

  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const country = params.get('country') || '';
  const genre = params.get('genre') || '';
  const decade = params.get('decade') || '';
  const [kind, setKind] = useState('track');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasQuery = Boolean(q || country || genre || decade);

  const queryString = useMemo(() => {
    const search = new URLSearchParams({ kind, page: String(page), limit: '20' });
    if (q) search.set('q', q);
    if (country) search.set('country', country);
    if (genre) search.set('genre', genre);
    if (decade) search.set('decade', decade);
    return search.toString();
  }, [kind, page, q, country, genre, decade]);

  useEffect(() => {
    if (!hasQuery) {
      setData(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/search?${queryString}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) setError(payload.detail || payload.error);
        setData(payload);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError('The search request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryString, hasQuery]);

  const push = useCallback(
    (changes) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/search?${next.toString()}`);
    },
    [params, router],
  );

  const items = data?.items || [];
  const canPrev = page > 1;
  const canNext = Boolean(data?.hasMore) && items.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Unified search</span>
          <h1 style={{ marginTop: 6 }}>
            {q ? `"${q}"` : country || genre || decade ? 'Explore' : 'Search everything'}
          </h1>
          <p className="lede">
            {q
              ? 'Matching recordings across every connected catalog, deduplicated by title and act.'
              : 'Filter the whole catalog by place, genre and decade, then resolve playback per track.'}
          </p>
        </div>
        {data?.total && kind !== 'track' ? (
          <span className="section__note">
            about {data.total.toLocaleString()} matches · page {page}
          </span>
        ) : items.length ? (
          <span className="section__note">
            {items.length} unique on this page · page {page}
          </span>
        ) : null}
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="chip-row">
          <select
            value={country}
            onChange={(event) => push({ country: event.target.value, page: '' })}
            className="chip"
            style={{ paddingRight: 22 }}
            aria-label="Filter by country"
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code || 'any'} value={code}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={genre}
            onChange={(event) => push({ genre: event.target.value, page: '' })}
            className="chip"
            style={{ paddingRight: 22, textTransform: 'capitalize' }}
            aria-label="Filter by genre"
          >
            {GENRES.map((value) => (
              <option key={value || 'any'} value={value}>
                {value ? value : 'Any genre'}
              </option>
            ))}
          </select>
          <select
            value={decade}
            onChange={(event) => push({ decade: event.target.value, page: '' })}
            className="chip"
            style={{ paddingRight: 22 }}
            aria-label="Filter by decade"
          >
            {DECADES.map((value) => (
              <option key={value || 'any'} value={value}>
                {value ? `${value}s` : 'Any decade'}
              </option>
            ))}
          </select>
          {(country || genre || decade) ? (
            <button type="button" className="chip" onClick={() => push({ country: '', genre: '', decade: '', page: '' })}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 22 }}>
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`tab${kind === value ? ' is-active' : ''}`}
            onClick={() => {
              setKind(value);
              setData(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <StatusLine sources={data?.sources} notes={data?.notes} />

      {!hasQuery ? (
        <div className="state">
          <p>Type a song, artist, album or genre in the box above - or pick a country, genre and decade.</p>
        </div>
      ) : loading && !items.length ? (
        <div className="stack">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="skeleton" />
          ))}
        </div>
      ) : error ? (
        <div className="state">
          <p>{error}</p>
          <button type="button" className="btn btn--ghost" onClick={() => router.refresh()}>
            Try again
          </button>
        </div>
      ) : !items.length ? (
        <div className="state">
          <p>
            No {kind === 'track' ? 'songs' : kind === 'artist' ? 'artists' : 'albums'} matched. Try a shorter
            query, or clear the filters.
          </p>
        </div>
      ) : kind === 'artist' ? (
        <ArtistCards artists={items} />
      ) : kind === 'album' ? (
        <AlbumCards albums={items} />
      ) : (
        <TrackList tracks={items} />
      )}

      {(canPrev || canNext) && !loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 26 }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!canPrev}
            onClick={() => push({ page: String(page - 1) })}
          >
            <IconPrev style={{ width: 14, height: 14 }} /> Previous
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!canNext}
            onClick={() => push({ page: String(page + 1) })}
          >
            Next <IconNext style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : null}

      {kind === 'track' && items.length ? (
        <p className="section__note" style={{ marginTop: 20 }}>
          Sources shown per row are the catalogs that confirmed that recording. {sourceLabel('musicbrainz')} supplies
          the canonical metadata; playback comes from whichever source is licensed to provide it.
        </p>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="state">Loading search...</div>}>
      <SearchView />
    </Suspense>
  );
}

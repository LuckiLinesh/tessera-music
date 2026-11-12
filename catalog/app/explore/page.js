'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TrackList } from '../components/TrackList';
import { IconNext, IconPrev } from '../components/Icons';
import { COUNTRIES, DECADES, GENRES, countryName } from '@/lib/facets';

const HIGHLIGHT_COUNTRIES = ['NG', 'BR', 'JP', 'IN', 'JM', 'ML', 'CU', 'KR', 'SN', 'MX', 'IS', 'SE'];
const HIGHLIGHT_GENRES = ['afrobeat', 'cumbia', 'city pop', 'highlife', 'bossa nova', 'amapiano', 'qawwali', 'fado', 'flamenco', 'gamelan', 'dub', 'salsa'];

function ExploreView() {
  const params = useSearchParams();
  const router = useRouter();

  const country = params.get('country') || '';
  const genre = params.get('genre') || '';
  const decade = params.get('decade') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const active = Boolean(country || genre || decade);

  const queryString = useMemo(() => {
    const search = new URLSearchParams({ page: String(page) });
    if (country) search.set('country', country);
    if (genre) search.set('genre', genre);
    if (decade) search.set('decade', decade);
    return search.toString();
  }, [country, genre, decade, page]);

  useEffect(() => {
    if (!active) {
      setData(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/explore?${queryString}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) setError(payload.error);
        setData(payload);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError('The explore request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryString, active]);

  const push = useCallback(
    (changes) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/explore?${next.toString()}`);
    },
    [params, router],
  );

  const items = data?.items || [];
  const title = [countryName(country) === 'Anywhere' ? '' : countryName(country), genre, decade ? `${decade}s` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <span className="eyebrow">Explore</span>
      <h1 style={{ marginTop: 6 }}>The whole world, one filter at a time</h1>
      <p className="lede">
        MusicBrainz records where an artist is from, when a release came out and which tags the
        community applies. Pick a place, a genre and a decade to walk the catalog. Playback is then
        resolved per track, so what you can hear is always honest.
      </p>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="section__head">
          <h2>Pick a place</h2>
          <Link href="/search" className="section__note">
            Or search directly
          </Link>
        </div>
        <div className="chip-row">
          {HIGHLIGHT_COUNTRIES.map((code) => (
            <button
              key={code}
              type="button"
              className={`chip${country === code ? ' is-active' : ''}`}
              onClick={() => push({ country: country === code ? '' : code, page: '' })}
            >
              {countryName(code)}
            </button>
          ))}
        </div>
        <div className="chip-row" style={{ marginTop: 10 }}>
          <select
            value={country}
            onChange={(event) => push({ country: event.target.value, page: '' })}
            className="chip"
            style={{ paddingRight: 22 }}
            aria-label="Any country"
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code || 'any'} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Pick a genre</h2>
        </div>
        <div className="chip-row">
          {HIGHLIGHT_GENRES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${genre === value ? ' is-active' : ''}`}
              onClick={() => push({ genre: genre === value ? '' : value, page: '' })}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="chip-row" style={{ marginTop: 10 }}>
          <select
            value={genre}
            onChange={(event) => push({ genre: event.target.value, page: '' })}
            className="chip"
            style={{ paddingRight: 22, textTransform: 'capitalize' }}
            aria-label="Any genre"
          >
            {GENRES.map((value) => (
              <option key={value || 'any'} value={value}>
                {value || 'Any genre'}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Pick a decade</h2>
        </div>
        <div className="chip-row">
          {DECADES.slice(1).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${decade === value ? ' is-active' : ''}`}
              onClick={() => push({ decade: decade === value ? '' : value, page: '' })}
            >
              {value}s
            </button>
          ))}
        </div>
      </section>

      {(country || genre || decade) ? (
        <div className="notice" style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>
            Showing <strong>{title || 'everything selected'}</strong>
            {data?.total ? ` - about ${data.total.toLocaleString()} matches` : ''}
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => push({ country: '', genre: '', decade: '', page: '' })}>
            Clear all
          </button>
        </div>
      ) : null}

      <section className="section">
        {!active ? (
          <div className="state">
            <p>Choose a country, genre or decade above to start browsing the global catalog.</p>
          </div>
        ) : loading && !items.length ? (
          <div className="stack">
            {[1, 2, 3, 4, 5].map((row) => (
              <div className="skeleton" key={row} />
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
              No recordings matched that combination. Try a broader genre, or remove the decade.
            </p>
          </div>
        ) : (
          <TrackList tracks={items} />
        )}
      </section>

      {active && !loading && (page > 1 || data?.hasMore) ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 26 }}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={page <= 1}
            onClick={() => push({ page: String(page - 1) })}
          >
            <IconPrev style={{ width: 14, height: 14 }} /> Previous
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!data?.hasMore}
            onClick={() => push({ page: String(page + 1) })}
          >
            Next <IconNext style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : null}

      {data?.notes?.length ? (
        <p className="section__note" style={{ marginTop: 18 }}>
          {data.notes.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="state">Loading explore...</div>}>
      <ExploreView />
    </Suspense>
  );
}

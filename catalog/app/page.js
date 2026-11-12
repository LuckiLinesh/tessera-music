'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TrackCard } from './components/TrackList';
import { IconCompass, IconSearch } from './components/Icons';

const QUICK = [
  'Fela Kuti',
  'Buena Vista Social Club',
  'City pop',
  'Cumbia',
  'Highlife',
  'Bollywood playback',
  'Nordic folk',
  'Desert blues',
  'Bossa nova',
  'Amapiano',
];

const COUNTRIES = [
  ['Nigeria', 'NG'],
  ['Brazil', 'BR'],
  ['Japan', 'JP'],
  ['India', 'IN'],
  ['Jamaica', 'JM'],
  ['Mali', 'ML'],
  ['Cuba', 'CU'],
  ['South Korea', 'KR'],
  ['Senegal', 'SN'],
  ['Mexico', 'MX'],
  ['Iceland', 'IS'],
  ['Sweden', 'SE'],
];

const GENRES = ['rock', 'jazz', 'hip hop', 'electronic', 'classical', 'folk', 'soul', 'reggae', 'blues', 'pop'];

export default function HomePage() {
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/home')
      .then((response) => response.json())
      .then((data) => {
        if (alive) setShelves(data.shelves || []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <section className="hero">
        <h1>Good evening</h1>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Explore by place</h2>
          <Link href="/explore" className="section__note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconCompass style={{ width: 14, height: 14 }} /> Open the world map
          </Link>
        </div>
        <div className="chip-row">
          {COUNTRIES.map(([name, code]) => (
            <Link key={code} href={`/explore?country=${code}`} className="chip">
              {name}
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Explore by genre</h2>
          <Link href="/search" className="section__note">
            Search instead
          </Link>
        </div>
        <div className="chip-row">
          {GENRES.map((genre) => (
            <Link key={genre} href={`/explore?genre=${encodeURIComponent(genre)}`} className="chip">
              {genre}
            </Link>
          ))}
        </div>
      </section>

      {loading
        ? [1, 2].map((row) => (
            <section className="section" key={row}>
              <div className="skeleton" style={{ height: 24, width: 220, marginBottom: 14 }} />
              <div className="row">
                {[1, 2, 3, 4, 5, 6].map((card) => (
                  <div className="skeleton" key={card} style={{ height: 220, width: 168, flex: 'none' }} />
                ))}
              </div>
            </section>
          ))
        : shelves.map((shelf) => (
            <section className="section" key={shelf.id}>
              <div className="section__head">
                <h2>{shelf.title}</h2>
                <span className="section__note">{shelf.note}</span>
              </div>
              <div className="row">
                {shelf.items.map((track) => (
                  <TrackCard key={track.id} track={track} items={shelf.items} />
                ))}
              </div>
            </section>
          ))}

      <section className="section">
        <div className="notice" style={{ display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>How the playback labels work</strong>
          <span>
            <span className="badge badge--full">Full</span> means a complete authorised file is streaming
            from the platform that publishes it. <span className="badge badge--embed">YouTube</span> opens
            the official embedded player, ads included. <span className="badge badge--preview">30s</span> is
            the official promotional clip. <span className="badge badge--none">No audio</span> means the
            recording is documented but no free authorised stream exists; the row links to its owner.
          </span>
        </div>
      </section>
    </div>
  );
}

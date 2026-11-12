'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePlayer } from './PlayerProvider';
import { fmtTime, tierClass, tierLabel } from '@/lib/format';
import {
  IconCompass,
  IconExternal,
  IconHeart,
  IconHome,
  IconLibrary,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSearch,
  IconVolume,
} from './Icons';

const NAV = [
  { href: '/', label: 'Home', Icon: IconHome },
  { href: '/search', label: 'Search', Icon: IconSearch },
  { href: '/explore', label: 'Explore', Icon: IconCompass },
  { href: '/library', label: 'Your library', Icon: IconLibrary },
];

function SearchForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get('q') || '');
  }, [pathname]);

  const submit = (event) => {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <form className="searchbox" onSubmit={submit} role="search">
      <IconSearch style={{ width: 17, height: 17, color: '#8f8f9b' }} />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search a song, artist, album or genre - anywhere in the world"
        aria-label="Search music"
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="btn--icon"
          style={{ background: 'none', border: 0, cursor: 'pointer', color: '#9a9aa5' }}
          onClick={() => setValue('')}
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </form>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { library } = usePlayer();

  return (
    <aside className="sidebar">
      <div className="panel sidebar__nav">
        <Link href="/" className="brand">
          <span className="brand__mark">T</span>
          <span>Tessera</span>
        </Link>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`nav-link${active ? ' is-active' : ''}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

      <div className="panel sidebar__library">
        <div className="sidebar__heading">
          <span>Your library</span>
          <span style={{ color: '#6e6e79', fontSize: 11 }}>{library.likes.length + library.playlists.length}</span>
        </div>

        {library.likes.length ? (
          <Link href="/library?tab=liked" className="lib-item">
            <span className="lib-item__art" style={{ background: 'linear-gradient(135deg,#8b7cff,#3a2b7a)' }}>
              <IconHeart filled style={{ width: 16, height: 16 }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="lib-item__title">Saved songs</span>
              <span className="lib-item__sub">{library.likes.length} tracks</span>
            </span>
          </Link>
        ) : null}

        {library.playlists.map((playlist) => (
          <Link key={playlist.id} href={`/library?tab=playlists&id=${playlist.id}`} className="lib-item">
            <span className="lib-item__art">
              {playlist.items[0]?.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playlist.items[0].art} alt="" loading="lazy" />
              ) : (
                playlist.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="lib-item__title">{playlist.name}</span>
              <span className="lib-item__sub">
                Playlist - {playlist.items.length} {playlist.items.length === 1 ? 'song' : 'songs'}
              </span>
            </span>
          </Link>
        ))}

        {!library.likes.length && !library.playlists.length ? (
          <p className="sidebar__empty">
            Save songs and build playlists. Everything stays in this browser - no account, no server copy.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function PlayerBar() {
  const {
    current,
    playing,
    position,
    duration,
    mode,
    resolving,
    toggle,
    next,
    prev,
    seek,
    volume,
    setVolume,
    isLiked,
    toggleLike,
  } = usePlayer();

  const liked = isLiked(current);
  const canSeek = duration > 1;
  const progress = canSeek ? (position / duration) * 100 : 0;
  const cover = Boolean(current?.resolved?.cover);

  return (
    <div className="player" role="region" aria-label="Player">
      <div className="player__now">
        <div className="player__art">
          {current?.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.art} alt="" />
          ) : (
            <span style={{ fontSize: 16 }}>♪</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="player__title">{current ? current.title : 'Nothing playing'}</div>
          <div className="player__artist">
            {resolving ? 'Looking for an authorised stream...' : current ? current.artist : 'Pick any result to start'}
          </div>
          {current ? (
            <span className={tierClass(mode === 'none' ? 'none' : mode === 'preview' ? 'preview' : mode === 'youtube' ? 'embed' : 'full')}>
              {mode === 'none'
                ? 'No free stream'
                : mode === 'preview'
                  ? '30s preview'
                  : mode === 'youtube'
                    ? 'YouTube'
                    : cover
                      ? 'Cover'
                      : 'Full song'}
            </span>
          ) : null}
        </div>
        {current ? (
          <button
            type="button"
            className="ctrl"
            onClick={() => toggleLike(current)}
            aria-label={liked ? 'Remove from library' : 'Save to library'}
            style={{ color: liked ? '#8b7cff' : undefined }}
          >
            <IconHeart filled={liked} />
          </button>
        ) : null}
      </div>

      <div className="player__center">
        <div className="player__controls">
          <button type="button" className="ctrl" onClick={prev} aria-label="Previous track">
            <IconPrev />
          </button>
          <button type="button" className="ctrl ctrl--play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="ctrl" onClick={() => next(false)} aria-label="Next track">
            <IconNext />
          </button>
        </div>
        <div className="player__seek">
          <span className="player__time">{fmtTime(position)}</span>
          <input
            className="range"
            type="range"
            min="0"
            max={canSeek ? Math.round(duration) : 100}
            value={canSeek ? Math.min(Math.round(position), Math.round(duration)) : 0}
            disabled={!canSeek}
            onChange={(event) => seek(Number(event.target.value))}
            style={{ '--fill': `${progress}%` }}
            aria-label="Seek"
          />
          <span className="player__time">{canSeek ? fmtTime(duration) : '--:--'}</span>
        </div>
      </div>

      <div className="player__right">
        {current && mode === 'none' ? (
          <a className="btn btn--ghost" href={current.links?.[0]?.href || '#'} target="_blank" rel="noreferrer">
            Listen where it is published <IconExternal style={{ width: 13, height: 13 }} />
          </a>
        ) : null}
        <button
          type="button"
          className="ctrl"
          onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        >
          {volume === 0 ? <IconMute /> : <IconVolume />}
        </button>
        <input
          className="range player__volume"
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          style={{ '--fill': `${volume * 100}%` }}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

function VideoPanel() {
  const { video } = usePlayer();
  if (!video) return null;
  return (
    <div className="yt-panel">
      <div className="yt-panel__bar">
        <span>YouTube - official player</span>
        <a
          href={`https://www.youtube.com/watch?v=${video.videoId}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#cfcfd8' }}
        >
          Open <IconExternal style={{ width: 11, height: 11, display: 'inline' }} />
        </a>
      </div>
      <div id="yt-frame-slot" />
      <div style={{ padding: '6px 10px 9px', fontSize: 11.5, color: '#9a9aa5' }}>
        {video.title} - {video.artist}
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts } = usePlayer();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default function Shell({ children }) {
  const pathname = usePathname();
  const mainRef = useRef(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <div className="shell">
        <Sidebar />
        <main className="main" ref={mainRef}>
          <div className="topbar">
            <SearchForm />
          </div>
          <div className="content">{children}</div>
        </main>
      </div>
      <VideoPanel />
      <PlayerBar />
      <Toasts />
    </>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from './PlayerProvider';
import { fmtTime, initials, tierClass as tierClassOf, tierLabel } from '@/lib/format';
import { albumHref, artistHref, sourceLabel } from '@/lib/links';
import { IconCheck, IconDownload, IconExternal, IconHeart, IconMore, IconPause, IconPlay, IconPlus } from './Icons';

export const tierOf = (track) =>
  track?.tier ||
  (track?.playback?.kind === 'audio'
    ? 'full'
    : track?.playback?.kind === 'youtube'
      ? 'embed'
      : track?.playback?.kind === 'preview'
        ? 'preview'
        : 'none');

export function PlaybackBadge({ track, mode }) {
  const tier = mode || tierOf(track);
  return <span className={tierClassOf(tier)}>{tier === 'embed' ? 'YouTube' : tier === 'full' ? 'Full' : tier === 'preview' ? '30s' : 'No audio'}</span>;
}

export function SourcePills({ sources = [], max = 3, statuses = {} }) {
  return (
    <>
      {sources.slice(0, max).map((source) => (
        <span
          key={source}
          className={`pill${statuses[source] === 'error' ? ' pill--warn' : ''}`}
          title={`Result confirmed by ${sourceLabel(source)}`}
        >
          {sourceLabel(source)}
        </span>
      ))}
      {sources.length > max ? <span className="pill">+{sources.length - max}</span> : null}
    </>
  );
}

function TrackMenu({ track, onClose }) {
  const { library, addToPlaylist, createPlaylist, toggleLike, isLiked } = usePlayer();
  const [newName, setNewName] = useState('');
  const [download, setDownload] = useState(null);

  const links = (track.links || []).filter((link) => link.href);
  const liked = isLiked(track);
  const hasBridge = typeof window !== 'undefined' && Boolean(window.tessera?.downloadTrack);

  return (
    <div
      className="menu"
      style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', maxHeight: 340, overflow: 'auto' }}
      role="menu"
    >
      <button type="button" role="menuitem" onClick={() => { toggleLike(track); onClose(); }}>
        <IconHeart filled={liked} style={{ width: 15, height: 15 }} />
        {liked ? 'Remove from library' : 'Save to library'}
      </button>

      <div style={{ padding: '6px 10px 4px', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8b8b97' }}>
        Add to playlist
      </div>
      {library.playlists.map((playlist) => (
        <button
          key={playlist.id}
          type="button"
          role="menuitem"
          onClick={() => { addToPlaylist(playlist.id, track); onClose(); }}
        >
          <IconPlus style={{ width: 14, height: 14 }} />
          {playlist.name}
        </button>
      ))}
      <div style={{ display: 'flex', gap: 6, padding: '4px 8px 6px' }}>
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New playlist"
          style={{
            flex: 1,
            minWidth: 0,
            background: '#ffffff10',
            border: '1px solid #ffffff1f',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 12,
            color: '#fff',
            outline: 'none',
          }}
        />
        <button
          type="button"
          role="menuitem"
          style={{ width: 'auto' }}
          onClick={() => {
            if (!newName.trim()) return;
            const id = createPlaylist(newName);
            addToPlaylist(id, track);
            setNewName('');
            onClose();
          }}
        >
          <IconCheck style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {track.playback?.url ? (
        <>
          <div style={{ height: 1, background: '#ffffff14', margin: '4px 0' }} />
          <button
            type="button"
            role="menuitem"
            disabled={!hasBridge || download === 'downloading'}
            title={hasBridge ? 'Save this licensed file to your Downloads folder' : 'Downloads are available in the Tessera desktop app'}
            onClick={async () => {
              const url = track.playback?.url;
              if (!url) return;
              setDownload('downloading');
              try {
                const folder = await window.tessera?.defaultDownloadFolder?.();
                const safeName = String(track.title || 'track').replace(/[^a-z0-9-_ ]/gi, '_');
                const result = await window.tessera?.downloadTrack?.({
                  url,
                  filename: `${safeName}.mp3`,
                  folder,
                });
                setDownload(result?.ok ? 'done' : 'error');
              } catch (error) {
                setDownload('error');
              }
            }}
          >
            <IconDownload style={{ width: 14, height: 14 }} />
            {download === 'downloading'
              ? 'Downloading…'
              : download === 'done'
                ? 'Saved to Downloads'
                : download === 'error'
                  ? 'Download failed – try again'
                  : hasBridge
                    ? 'Download full track'
                    : 'Download (desktop app)'}
          </button>
          {download === 'done' ? (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                const folder = await window.tessera?.defaultDownloadFolder?.();
                if (folder) await window.tessera?.openPath?.(folder);
              }}
            >
              <IconExternal style={{ width: 14, height: 14 }} />
              Show in folder
            </button>
          ) : null}
        </>
      ) : null}

      {links.length ? (
        <>
          <div style={{ height: 1, background: '#ffffff14', margin: '4px 0' }} />
          {links.slice(0, 6).map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" role="menuitem">
              <IconExternal style={{ width: 14, height: 14 }} />
              {link.label || 'Open source'}
            </a>
          ))}
        </>
      ) : null}
    </div>
  );
}

export function TrackRow({
  track,
  index,
  queue,
  queueIndex,
  showAlbum = true,
  showArt = true,
  onRemove = null,
}) {
  const { playQueue, playTrack, current, playing, toggle } = usePlayer();
  const [menu, setMenu] = useState(false);
  const holder = useRef(null);
  const isCurrent = current?.id === track.id;

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => {
      if (!holder.current?.contains(event.target)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const play = () => {
    if (isCurrent) {
      toggle();
      return;
    }
    if (queue?.length) playQueue(queue, queueIndex ?? index ?? 0);
    else playTrack(track);
  };

  return (
    <div className={`track${isCurrent ? ' is-playing' : ''}`} data-track-id={track.id}>
      <span className="track__index">{isCurrent && playing ? '▶' : index + 1}</span>

      {showArt ? (
        <span className="track__art">
          {track.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.art} alt="" loading="lazy" />
          ) : (
            initials(track.title)
          )}
        </span>
      ) : null}

      <div style={{ minWidth: 0 }}>
        <div className="track__title" title={track.title}>
          {track.title}
        </div>
        <div className="track__sub">
          <Link href={artistHref(track)} style={{ color: '#c7c7d2' }}>
            {track.artist || 'Unknown artist'}
          </Link>
          {track.year ? <span style={{ color: '#7d7d89' }}> · {track.year}</span> : null}
          {track.explicit ? <span className="pill" style={{ marginLeft: 6 }}>E</span> : null}
        </div>
      </div>

      <div className="track__album">
        {track.album && albumHref(track) ? (
          <Link href={albumHref(track)} style={{ color: 'inherit' }}>
            {track.album}
          </Link>
        ) : (
          track.album || '—'
        )}
      </div>

      <div className="track__right" ref={holder} style={{ position: 'relative' }}>
        <PlaybackBadge track={track} />
        <span className="track__time">{track.duration ? fmtTime(track.duration) : '—'}</span>
        <button type="button" className="play-dot" onClick={play} aria-label={`Play ${track.title}`}>
          {isCurrent && playing ? <IconPause /> : <IconPlay />}
        </button>
        <button
          type="button"
          className="btn--icon"
          style={{ border: 0, background: 'none', cursor: 'pointer', color: '#9a9aa5', padding: 4 }}
          onClick={() => setMenu((value) => !value)}
          aria-label={`More options for ${track.title}`}
          aria-expanded={menu}
        >
          <IconMore style={{ width: 16, height: 16 }} />
        </button>
        {menu ? <TrackMenu track={track} onClose={() => setMenu(false)} /> : null}
      </div>

      {onRemove ? (
        <button
          type="button"
          className="btn--icon"
          onClick={() => onRemove(track)}
          aria-label={`Remove ${track.title}`}
          style={{ border: 0, background: 'none', cursor: 'pointer', color: '#8b8b97' }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function TrackList({ tracks, showAlbum = true, showArt = true, onRemove = null }) {
  if (!tracks?.length) return null;
  return (
    <div className="tracklist">
      {tracks.map((track, index) => (
        <TrackRow
          key={`${track.id}-${index}`}
          track={track}
          index={index}
          queue={tracks}
          queueIndex={index}
          showAlbum={showAlbum}
          showArt={showArt}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

export function TrackCard({ track, items }) {
  const { playQueue, playTrack, current, playing } = usePlayer();
  const isCurrent = current?.id === track.id;
  return (
    <article className="card">
      <div className="card__art" onClick={() => (items?.length ? playQueue(items, items.indexOf(track)) : playTrack(track))}>
        {track.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.art} alt="" loading="lazy" />
        ) : (
          initials(track.title)
        )}
        <button
          type="button"
          className="play-dot"
          style={{ position: 'absolute', right: 8, bottom: 8 }}
          onClick={(event) => {
            event.stopPropagation();
            if (isCurrent) playQueue(items || [track], items ? items.indexOf(track) : 0);
            else if (items?.length) playQueue(items, items.indexOf(track));
            else playTrack(track);
          }}
          aria-label={`Play ${track.title}`}
        >
          {isCurrent && playing ? <IconPause /> : <IconPlay />}
        </button>
      </div>
      <div className="card__title" title={track.title}>
        {track.title}
      </div>
      <div className="card__sub">
        <Link href={artistHref(track)}>{track.artist}</Link>
        {track.year ? ` · ${track.year}` : ''}
      </div>
    </article>
  );
}

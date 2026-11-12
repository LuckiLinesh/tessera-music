'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrackList } from '../components/TrackList';
import { usePlayer } from '../components/PlayerProvider';
import { IconCheck, IconHeart, IconPlay, IconPlus } from '../components/Icons';

function LibraryView() {
  const params = useSearchParams();
  const tab = params.get('tab') === 'playlists' ? 'playlists' : 'liked';
  const selectedId = params.get('id') || '';
  const {
    library,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    playQueue,
  } = usePlayer();

  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState('');

  const selected = useMemo(
    () =>
      library.playlists.find((playlist) => playlist.id === selectedId) ||
      library.playlists[0] ||
      null,
    [library.playlists, selectedId],
  );

  useEffect(() => {
    setEditing(selected?.name || '');
  }, [selected?.id, selected?.name]);

  const playAll = (items) => {
    if (items?.length) playQueue(items, 0);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Your library</span>
          <h1 style={{ marginTop: 6 }}>Saved in this browser</h1>
          <p className="lede">
            Likes and playlists live in localStorage only. No account, no server copy, no tracking.
            Clear your browser data and they are gone.
          </p>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 22 }}>
        <Link href="/library?tab=liked" className={`tab${tab === 'liked' ? ' is-active' : ''}`}>
          Saved songs ({library.likes.length})
        </Link>
        <Link href="/library?tab=playlists" className={`tab${tab === 'playlists' ? ' is-active' : ''}`}>
          Playlists ({library.playlists.length})
        </Link>
      </div>

      {tab === 'liked' ? (
        library.likes.length ? (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <button type="button" className="btn btn--primary" onClick={() => playAll(library.likes)}>
                <IconPlay style={{ width: 14, height: 14 }} /> Play all
              </button>
            </div>
            <TrackList tracks={library.likes} />
          </>
        ) : (
          <div className="state">
            <IconHeart style={{ width: 26, height: 26, color: '#5f5f6b', marginBottom: 10 }} />
            <p>Songs you save appear here. Use the heart on any row or in the player bar.</p>
            <Link href="/search" className="btn btn--ghost">
              Find something to save
            </Link>
          </div>
        )
      ) : (
        <div className="library-split">
          <aside className="panel" style={{ padding: 12, alignSelf: 'start' }}>
            <div className="sidebar__heading" style={{ padding: '2px 4px 10px' }}>
              <span>Playlists</span>
            </div>
            {library.playlists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/library?tab=playlists&id=${playlist.id}`}
                className={`lib-item${playlist.id === selected?.id ? ' is-active' : ''}`}
                style={playlist.id === selected?.id ? { background: '#ffffff12' } : undefined}
              >
                <span className="lib-item__art">
                  {playlist.items[0]?.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={playlist.items[0].art} alt="" />
                  ) : (
                    playlist.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="lib-item__title">{playlist.name}</span>
                  <span className="lib-item__sub">
                    {playlist.items.length} {playlist.items.length === 1 ? 'song' : 'songs'}
                  </span>
                </span>
              </Link>
            ))}

            <div style={{ display: 'flex', gap: 6, padding: '10px 4px 2px' }}>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New playlist"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newName.trim()) {
                    createPlaylist(newName);
                    setNewName('');
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: '#ffffff10',
                  border: '1px solid #ffffff1f',
                  borderRadius: 6,
                  padding: '7px 9px',
                  fontSize: 12.5,
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: '7px 10px' }}
                onClick={() => {
                  if (!newName.trim()) return;
                  createPlaylist(newName);
                  setNewName('');
                }}
                aria-label="Create playlist"
              >
                <IconPlus style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            {selected ? (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={editing}
                    onChange={(event) => setEditing(event.target.value)}
                    onBlur={() => renamePlaylist(selected.id, editing)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      borderBottom: '1px solid #ffffff26',
                      color: '#fff',
                      fontSize: 24,
                      fontWeight: 750,
                      padding: '2px 0 6px',
                      outline: 'none',
                      minWidth: 220,
                      maxWidth: 480,
                    }}
                    aria-label="Playlist name"
                  />
                  <button type="button" className="btn btn--primary" onClick={() => playAll(selected.items)}>
                    <IconPlay style={{ width: 14, height: 14 }} /> Play
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      if (window.confirm(`Delete "${selected.name}"?`)) deletePlaylist(selected.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <p className="section__note" style={{ marginTop: 8 }}>
                  {selected.items.length} {selected.items.length === 1 ? 'song' : 'songs'} - rename by
                  editing the title, it saves when you click away.
                </p>

                <div className="section" style={{ marginTop: 18 }}>
                  {selected.items.length ? (
                    <TrackList tracks={selected.items} />
                  ) : (
                    <div className="state">
                      <p>This playlist is empty. Use the row menu on any song to add it.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="state">
                <p>No playlists yet. Create one on the left, then add songs from any row menu.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="state">Loading your library...</div>}>
      <LibraryView />
    </Suspense>
  );
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const PlayerCtx = createContext(null);

export const usePlayer = () => {
  const value = useContext(PlayerCtx);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
};

const LIBRARY_KEY = 'tessera.catalog.library.v1';
const VOLUME_KEY = 'tessera.catalog.volume.v1';

const readLibrary = () => {
  if (typeof window === 'undefined') return { likes: [], playlists: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || 'null');
    return {
      likes: Array.isArray(parsed?.likes) ? parsed.likes : [],
      playlists: Array.isArray(parsed?.playlists) ? parsed.playlists : [],
    };
  } catch {
    return { likes: [], playlists: [] };
  }
};

const readVolume = () => {
  if (typeof window === 'undefined') return 0.8;
  const stored = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.8;
};

let youtubeApiPromise = null;
const ensureYouTubeApi = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === 'function') previous();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('YouTube player failed to load'));
      document.head.append(script);
      setTimeout(() => {
        if (window.YT?.Player) resolve();
      }, 8000);
    });
  }
  return youtubeApiPromise;
};

export default function PlayerProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState('audio');
  const [video, setVideo] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [library, setLibrary] = useState({ likes: [], playlists: [] });
  const [toasts, setToasts] = useState([]);

  const audioRef = useRef(null);
  const ytRef = useRef(null);
  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const modeRef = useRef('audio');
  const volumeRef = useRef(0.8);
  const playingRef = useRef(false);
  const nextRef = useRef(null);

  const current = queue[index] || null;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode !== 'youtube') setVideo(null);
  }, [mode]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const stored = readVolume();
    setVolume(stored);
    volumeRef.current = stored;
    setLibrary(readLibrary());
  }, []);

  const toast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((list) => [...list, { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((entry) => entry.id !== id)), 3200);
  }, []);

  const saveLibrary = useCallback((updater) => {
    setLibrary((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
      } catch {
        /* quota - the in-memory library still works */
      }
      return next;
    });
  }, []);

  const patchAt = useCallback((at, trackId, patch) => {
    setQueue((list) =>
      list.map((entry, position) =>
        position === at && entry.id === trackId ? { ...entry, ...patch } : entry,
      ),
    );
    queueRef.current = queueRef.current.map((entry, position) =>
      position === at && entry.id === trackId ? { ...entry, ...patch } : entry,
    );
  }, []);

  const resolveTrack = useCallback(async (track) => {
    try {
      const params = new URLSearchParams({ title: track.title, artist: track.artist || '' });
      const response = await fetch(`/api/playback?${params.toString()}`);
      const data = await response.json();
      return {
        ...track,
        playback: data.playback || null,
        resolved: {
          kind: data.kind,
          cover: Boolean(data.cover),
          alternatives: (data.alternatives || []).slice(0, 4),
        },
      };
    } catch {
      return { ...track, playback: null, resolved: { kind: 'error', alternatives: [] } };
    }
  }, []);

  const activate = useCallback(
    async (track, at, autoplay = true) => {
      if (!track) return;
      // Stop the engine that is not in use so two things never play at once.
      try {
        ytRef.current?.stopVideo?.();
      } catch {
        /* player not ready */
      }
      audioRef.current?.pause();

      setPosition(0);
      setDuration(track.duration || 0);
      setMode('audio');
      setVideo(null);

      let ready = track;
      if (!ready.playback) {
        setResolving(true);
        ready = await resolveTrack(track);
        setResolving(false);
        patchAt(at, track.id, {
          playback: ready.playback,
          resolved: ready.resolved,
        });
      }

      if (!ready.playback) {
        setMode('none');
        setPlaying(false);
        toast(
          ready.resolved?.kind === 'error'
            ? 'Could not reach the playback resolver'
            : `No free stream found for "${track.title}" - open it where it is published`,
        );
        return;
      }

      if (ready.playback.kind === 'youtube') {
        setMode('youtube');
        setPlaying(true);
        setVideo({
          videoId: ready.playback.videoId,
          title: ready.title,
          artist: ready.artist,
          art: ready.art,
          channel: ready.playback.channel || '',
        });
        return;
      }

      const audio = audioRef.current;
      if (!audio) return;
      audio.src = ready.playback.url;
      audio.volume = volumeRef.current;
      audio.muted = volumeRef.current === 0;
      if (autoplay) {
        audio.play().catch(() => {
          setPlaying(false);
          toast('Press play to start');
        });
      }

      /* A 30-second promotional clip is a placeholder, not the goal. Start it
         immediately so the click feels instant, and in parallel ask the resolver
         whether the same song exists in full somewhere licensed. If it does, swap
         the source in place - never silently, the player bar says which version
         is playing. */
      if (ready.playback.kind === 'preview' && !ready.resolved) {
        resolveTrack(track).then((better) => {
          if (!better.playback || better.playback.kind === 'preview') return;
          if (queueRef.current[indexRef.current]?.id !== track.id) return;
          patchAt(at, track.id, { playback: better.playback, resolved: better.resolved });

          if (better.playback.kind === 'youtube') {
            audio.pause();
            setMode('youtube');
            setPlaying(true);
            setVideo({
              videoId: better.playback.videoId,
              title: track.title,
              artist: track.artist,
              art: track.art,
              channel: better.playback.channel || '',
            });
            toast('Official full video found on YouTube');
            return;
          }

          audio.src = better.playback.url;
          audio.volume = volumeRef.current;
          audio.muted = volumeRef.current === 0;
          audio.play().catch(() => setPlaying(false));
          toast(
            better.cover
              ? `Full cover by ${better.observed || 'another artist'} - the original is preview only`
              : 'Full version found - playing the complete song',
          );
        });
      }
    },
    [patchAt, resolveTrack, toast],
  );

  const playQueue = useCallback(
    (tracks, at = 0) => {
      const list = (tracks || []).filter(Boolean);
      if (!list.length) return;
      const safeAt = Math.min(Math.max(0, at), list.length - 1);
      queueRef.current = list;
      indexRef.current = safeAt;
      setQueue(list);
      setIndex(safeAt);
      activate(list[safeAt], safeAt, true);
    },
    [activate],
  );

  const playTrack = useCallback(
    (track) => {
      if (!track) return;
      // Re-use the queue when the same track is already in it.
      const found = queueRef.current.findIndex((entry) => entry.id === track.id);
      if (found >= 0) {
        indexRef.current = found;
        setIndex(found);
        activate(queueRef.current[found], found, true);
        return;
      }
      playQueue([track], 0);
    },
    [activate, playQueue],
  );

  const toggle = useCallback(() => {
    if (modeRef.current === 'youtube') {
      const player = ytRef.current;
      if (!player) return;
      if (playingRef.current) player.pauseVideo?.();
      else player.playVideo?.();
      return;
    }
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) audio.play().catch(() => toast('Playback was blocked - press play again'));
    else audio.pause();
  }, [toast]);

  const loadAt = useCallback(
    (at) => {
      const list = queueRef.current;
      if (!list.length) return;
      const safeAt = (at + list.length) % list.length;
      indexRef.current = safeAt;
      setIndex(safeAt);
      activate(list[safeAt], safeAt, true);
    },
    [activate],
  );

  const next = useCallback(
    (auto = false) => {
      const list = queueRef.current;
      if (!list.length) return;
      const nextIndex = indexRef.current + 1;
      if (nextIndex >= list.length) {
        if (auto) {
          setPlaying(false);
          audioRef.current?.pause();
          try {
            ytRef.current?.pauseVideo?.();
          } catch {
            /* ignore */
          }
          return;
        }
        loadAt(0);
        return;
      }
      loadAt(nextIndex);
    },
    [loadAt],
  );

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  const prev = useCallback(() => {
    const at = modeRef.current === 'youtube' ? ytRef.current?.getCurrentTime?.() || 0 : audioRef.current?.currentTime || 0;
    if (at > 3) {
      if (modeRef.current === 'youtube') ytRef.current?.seekTo?.(0, true);
      else if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    if (indexRef.current <= 0) loadAt(queueRef.current.length - 1);
    else loadAt(indexRef.current - 1);
  }, [loadAt]);

  const seek = useCallback((seconds) => {
    const target = Math.max(0, Number(seconds) || 0);
    if (modeRef.current === 'youtube') {
      ytRef.current?.seekTo?.(target, true);
      setPosition(target);
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = target;
    setPosition(target);
  }, []);

  const changeVolume = useCallback((value) => {
    const clamped = Math.min(1, Math.max(0, Number(value) || 0));
    setVolume(clamped);
    volumeRef.current = clamped;
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = clamped === 0;
    }
    if (ytRef.current?.setVolume) {
      try {
        ytRef.current.setVolume(Math.round(clamped * 100));
        if (clamped === 0) ytRef.current.mute?.();
        else ytRef.current.unMute?.();
      } catch {
        /* player not ready */
      }
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  /* ---- audio element events ---- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTime = () => {
      if (modeRef.current === 'youtube') return;
      setPosition(audio.currentTime || 0);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => nextRef.current?.(true);
    const onError = () => {
      if (!audio.src || modeRef.current === 'youtube') return;
      setPlaying(false);
      toast('That stream could not be loaded');
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [toast]);

  /* ---- YouTube iframe player ---- */
  useEffect(() => {
    if (!video?.videoId) return undefined;
    let cancelled = false;
    let player = null;

    ensureYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player) return;
        const host = document.getElementById('yt-frame-slot');
        if (!host) return;
        // React must not own the node YouTube replaces, so mount it by hand.
        const mount = document.createElement('div');
        host.appendChild(mount);
        player = new window.YT.Player(mount, {
          videoId: video.videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(Math.round(volumeRef.current * 100));
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === 1) setPlaying(true);
              if (event.data === 2) setPlaying(false);
              if (event.data === 0) nextRef.current?.(true);
            },
          },
        });
        ytRef.current = player;
      })
      .catch(() => toast('YouTube player could not load'));

    const timer = setInterval(() => {
      if (!player?.getCurrentTime) return;
      const time = player.getCurrentTime() || 0;
      const total = player.getDuration() || 0;
      setPosition(time);
      if (total) setDuration(total);
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(timer);
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.videoId]);

  /* ---- library helpers ---- */
  const trackKey = (track) => track?.key || track?.id || '';

  const isLiked = useCallback(
    (track) => Boolean(track) && library.likes.some((entry) => entry.key === trackKey(track)),
    [library.likes],
  );

  const toggleLike = useCallback(
    (track) => {
      if (!track) return;
      const key = trackKey(track);
      saveLibrary((previous) => {
        const liked = previous.likes.some((entry) => entry.key === key);
        return {
          ...previous,
          likes: liked
            ? previous.likes.filter((entry) => entry.key !== key)
            : [{ ...track, key, savedAt: Date.now() }, ...previous.likes].slice(0, 400),
        };
      });
      toast(isLiked(track) ? 'Removed from your library' : 'Saved to your library');
    },
    [isLiked, saveLibrary, toast],
  );

  const createPlaylist = useCallback(
    (name) => {
      const title = String(name || '').trim() || `Playlist ${library.playlists.length + 1}`;
      const id = `pl-${Date.now().toString(36)}`;
      saveLibrary((previous) => ({
        ...previous,
        playlists: [{ id, name: title, items: [], createdAt: Date.now() }, ...previous.playlists],
      }));
      toast(`Created "${title}"`);
      return id;
    },
    [library.playlists.length, saveLibrary, toast],
  );

  const addToPlaylist = useCallback(
    (id, track) => {
      if (!id || !track) return;
      const key = trackKey(track);
      saveLibrary((previous) => ({
        ...previous,
        playlists: previous.playlists.map((playlist) =>
          playlist.id === id
            ? {
                ...playlist,
                items: playlist.items.some((entry) => entry.key === key)
                  ? playlist.items
                  : [...playlist.items, { ...track, key }],
              }
            : playlist,
        ),
      }));
      toast('Added to playlist');
    },
    [saveLibrary, toast],
  );

  const removeFromPlaylist = useCallback(
    (id, key) => {
      saveLibrary((previous) => ({
        ...previous,
        playlists: previous.playlists.map((playlist) =>
          playlist.id === id
            ? { ...playlist, items: playlist.items.filter((entry) => entry.key !== key) }
            : playlist,
        ),
      }));
    },
    [saveLibrary],
  );

  const renamePlaylist = useCallback(
    (id, name) => {
      saveLibrary((previous) => ({
        ...previous,
        playlists: previous.playlists.map((playlist) =>
          playlist.id === id ? { ...playlist, name: String(name || '').trim() || playlist.name } : playlist,
        ),
      }));
    },
    [saveLibrary],
  );

  const deletePlaylist = useCallback(
    (id) => {
      saveLibrary((previous) => ({
        ...previous,
        playlists: previous.playlists.filter((playlist) => playlist.id !== id),
      }));
      toast('Playlist deleted');
    },
    [saveLibrary, toast],
  );

  const value = useMemo(
    () => ({
      queue,
      index,
      current,
      playing,
      position,
      duration,
      mode,
      video,
      resolving,
      volume,
      library,
      toasts,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      seek,
      setVolume: changeVolume,
      isLiked,
      toggleLike,
      createPlaylist,
      addToPlaylist,
      removeFromPlaylist,
      renamePlaylist,
      deletePlaylist,
      toast,
    }),
    [
      queue,
      index,
      current,
      playing,
      position,
      duration,
      mode,
      video,
      resolving,
      volume,
      library,
      toasts,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      seek,
      changeVolume,
      isLiked,
      toggleLike,
      createPlaylist,
      addToPlaylist,
      removeFromPlaylist,
      renamePlaylist,
      deletePlaylist,
      toast,
    ],
  );

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" />
    </PlayerCtx.Provider>
  );
}

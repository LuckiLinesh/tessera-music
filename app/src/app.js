/* Tessera - a working music player.
   Catalog + audio: Audius public API (real, free, full-length streams).
   Everything user-created (likes, playlists, volume, last track) lives in localStorage. */

const API = 'https://api.audius.co/v1';
const APP_NAME = 'TesseraMusic';
const STORE_KEY = 'tessera.v3';

/* -"--"- tiny helpers -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const cleanName = (value = '') => String(value).replace(/^@+/, '').trim();

const fmtTime = (seconds = 0) => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtCount = (n = 0) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

const hueFrom = (seed = '') => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
};

/* -"--"- persistence -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const defaults = { liked: [], playlists: [], volume: 0.8, prevVolume: 0.8, last: null, muted: false };
const LAST_KEY = 'tessera.last';

const loadStore = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return { ...defaults, ...(raw || {}), last: last || raw?.last || null };
  } catch {
    return { ...defaults };
  }
};

const store = loadStore();
store.liked = new Set(store.liked || []);
store.playlists = store.playlists || [];
store.last = store.last || null;

const saveStore = () => {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      liked: [...store.liked],
      playlists: store.playlists,
      volume: store.volume,
      prevVolume: store.prevVolume,
      muted: store.muted,
      last: store.last,
    }),
  );
};

/* Playback state lives under its own key. Otherwise every play would rewrite
   the library, and a stale second tab could drop a like the other tab just
   added. */
const saveLast = () => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(store.last || null));
  } catch {
    /* private mode or a full quota - the session still works */
  }
};

// Keep open tabs in step so one of them cannot save an out-of-date library.
window.addEventListener('storage', (event) => {
  if (event.key !== STORE_KEY || !event.newValue) return;
  try {
    const next = JSON.parse(event.newValue);
    store.liked = new Set(next.liked || []);
    store.playlists = next.playlists || [];
    store.volume = Number(next.volume ?? store.volume);
    store.prevVolume = Number(next.prevVolume ?? store.prevVolume);
    store.muted = Boolean(next.muted);
    renderSidebar();
    if (['/liked', '/collection'].includes(location.pathname)) render();
  } catch {
    /* ignore a malformed write from another tab */
  }
});

/* -"--"- catalog -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const tracks = new Map(); // id -> track
const contexts = new Map(); // contextId -> { title, ids }
const cache = new Map(); // url -> promise

const normTrack = (raw) => {
  const art = raw.artwork || {};
  const track = {
    id: raw.id,
    title: cleanName(raw.title) || 'Untitled',
    artist: cleanName(raw.user?.name) || 'Unknown artist',
    artistId: raw.user?.id || raw.user_id || '',
    art: art['480x480'] || art['150x150'] || art['1000x1000'] || '',
    duration: raw.duration || 0,
    genre: raw.genre || '',
    plays: raw.play_count || 0,
    album: raw.album_backlink?.playlist_name || '',
    src: `${API}/tracks/${raw.id}/stream?app_name=${APP_NAME}`,
    preview: false,
    source: 'audius',
  };
  tracks.set(track.id, track);
  return track;
};

const normList = (list) => (Array.isArray(list) ? list.filter((t) => t && t.id).map(normTrack) : []);

/* Deezer's public API does not send CORS headers, so JSONP is the way in from
   a static page. It also supplies real chart data and 30 second preview clips. */
const DZ = 'https://api.deezer.com';

const jsonp = (path) =>
  new Promise((resolve, reject) => {
    const cb = `dzcb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const sep = path.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The music catalog timed out'));
    }, 12000);
    window[cb] = (data) => {
      cleanup();
      if (data && data.error) reject(new Error(data.error.message || 'Catalog request failed'));
      else resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('The music catalog did not answer'));
    };
    script.src = `${DZ}${path}${sep}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });

const dz = (path) => {
  if (!cache.has(`dz:${path}`)) {
    const promise = jsonp(path).catch((error) => {
      cache.delete(`dz:${path}`);
      throw error;
    });
    cache.set(`dz:${path}`, promise);
  }
  return cache.get(`dz:${path}`);
};

const dzTrack = (raw) => {
  if (!raw || !raw.id) return null;
  const track = {
    id: `dz${raw.id}`,
    title: cleanName(raw.title) || 'Untitled',
    artist: cleanName(raw.artist?.name) || 'Unknown artist',
    artistId: raw.artist?.id ? `dz${raw.artist.id}` : '',
    art: raw.album?.cover_xl || raw.album?.cover_big || raw.album?.cover_medium || '',
    duration: raw.duration || 0,
    genre: '',
    plays: 0,
    album: cleanName(raw.album?.title) || '',
    src: raw.preview || '',
    preview: true,
    source: 'deezer',
  };
  tracks.set(track.id, track);
  return track;
};

const dzList = (list) => (Array.isArray(list) ? list.map(dzTrack).filter((t) => t && t.src) : []);

const dzAdd = (id, title, list) => {
  const trackList = dzList(list);
  contexts.set(id, { title, ids: trackList.map((t) => t.id) });
  return trackList;
};

/* Jamendo: complete Creative Commons tracks, not 30 second clips. It also
   supports JSONP, so it works from a static page with no proxy. A free
   client id from devportal.jamendo.com is required. */
const JAMENDO_KEY = 'tessera.jamendo';
const jamendoId = () => (localStorage.getItem(JAMENDO_KEY) || '').trim();

const jamendo = (path) =>
  new Promise((resolve, reject) => {
    const id = jamendoId();
    if (!id) {
      reject(new Error('Connect Jamendo to load full songs'));
      return;
    }
    const cb = `jmcb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const sep = path.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The Jamendo catalog timed out'));
    }, 12000);
    window[cb] = (data) => {
      cleanup();
      if (!data || data.headers?.status !== 'success') {
        reject(new Error(data?.headers?.error_message || 'Jamendo request failed'));
        return;
      }
      resolve(data.results || []);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('The Jamendo catalog did not answer'));
    };
    script.src = `https://api.jamendo.com/v3.0${path}${sep}client_id=${encodeURIComponent(
      id,
    )}&format=json&callback=${cb}`;
    document.head.appendChild(script);
  });

const jmFetch = (path) => {
  const key = `jm:${jamendoId()}:${path}`;
  if (!cache.has(key)) {
    const promise = jamendo(path).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return cache.get(key);
};

const jmTrack = (raw) => {
  if (!raw || !raw.id) return null;
  const track = {
    id: `jm${raw.id}`,
    title: cleanName(raw.name) || 'Untitled',
    artist: cleanName(raw.artist_name) || 'Unknown artist',
    artistId: raw.artist_id ? `jm${raw.artist_id}` : '',
    art: raw.image || raw.album_image || '',
    duration: Number(raw.duration) || 0,
    genre: '',
    plays: 0,
    album: cleanName(raw.album_name) || '',
    src: raw.audio || '',
    preview: false,
    source: 'jamendo',
  };
  tracks.set(track.id, track);
  return track;
};

const jmList = (list) => (Array.isArray(list) ? list.map(jmTrack).filter((t) => t && t.src) : []);

const jmAdd = (id, title, list) => {
  const trackList = jmList(list);
  contexts.set(id, { title, ids: trackList.map((t) => t.id) });
  return trackList;
};

/* Openverse is a keyless, CORS-enabled index of openly licensed audio. Its
   music comes from Jamendo and Wikimedia and every result carries a direct
   MP3 URL, so these are complete songs rather than clips - no client id, no
   account, and byte-range seeking works like any local file. */
const OV = 'https://api.openverse.org/v1';

const ovJson = (url) => {
  if (!cache.has(url)) {
    const promise = fetch(url, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`Open audio request failed (${res.status})`);
        return res.json();
      })
      .catch((error) => {
        cache.delete(url);
        throw error;
      });
    cache.set(url, promise);
  }
  return cache.get(url);
};

/* Openverse also indexes freesound, which is a bank of one-second loops. Drop
   those and anything shorter than a real song. */
const ovKeep = (raw) =>
  Boolean(raw?.url) &&
  raw.provider !== 'freesound' &&
  raw.category !== 'sound_effect' &&
  Number(raw.duration) >= 45000;

const ovTrack = (raw) => {
  if (!raw?.id || !ovKeep(raw)) return null;
  const creator = cleanName(raw.creator) || 'Independent artist';
  const track = {
    id: `ov:${raw.id}`,
    title: cleanName(raw.title) || 'Untitled',
    artist: creator,
    artistId: `ov:${creator}`,
    art: raw.thumbnail || '',
    duration: Math.round((Number(raw.duration) || 0) / 1000),
    genre: (raw.genres || [])[0] || '',
    plays: 0,
    album: cleanName(raw.audio_set?.title) || '',
    src: raw.url,
    preview: false,
    source: 'openverse',
  };
  tracks.set(track.id, track);
  return track;
};

const ovList = (json) => {
  const seen = new Set();
  const list = [];
  for (const raw of json?.results || []) {
    const track = ovTrack(raw);
    if (!track) continue;
    const key = `${track.title}|${track.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(track);
  }
  return list;
};

const ovRegister = (id, title, list) => {
  contexts.set(id, { title, ids: list.map((t) => t.id) });
  return list;
};

const ovQuery = (params, pageSize = 24) => {
  const query = new URLSearchParams({ page_size: String(pageSize) });
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  return ovJson(`${OV}/audio/?${query.toString()}`);
};

const ovAdd = (id, title, json, pageSize) => ovRegister(id, title, ovList(json).slice(0, pageSize));

const ovArtists = async (name, pageSize = 50) => {
  const json = await ovQuery({ creator: name }, pageSize).catch(() => null);
  const wanted = name.toLowerCase();
  return ovList(json).filter((track) => track.artist.toLowerCase() === wanted);
};

/* Internet Archive: the Live Music Archive keeps complete concert recordings
   that the bands themselves allow to be shared. No key, no account, and the
   download URLs answer with byte ranges, so seeking works. */
const IA = 'https://archive.org';

const iaJson = (url) => {
  if (!cache.has(url)) {
    const promise = fetch(url, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`Archive request failed (${res.status})`);
        return res.json();
      })
      .catch((error) => {
        cache.delete(url);
        throw error;
      });
    cache.set(url, promise);
  }
  return cache.get(url);
};

const iaSearch = (query, rows = 6) =>
  iaJson(
    `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}&fl%5B%5D=identifier&fl%5B%5D=creator&fl%5B%5D=title&fl%5B%5D=date&fl%5B%5D=downloads&sort%5B%5D=downloads+desc&rows=${rows}&page=1&output=json`,
  ).then((json) => json?.response?.docs || []);

const iaItem = (identifier) => iaJson(`${IA}/metadata/${encodeURIComponent(identifier)}`);

const iaSeconds = (value) => {
  if (typeof value === 'number') return value;
  const parts = String(value || '')
    .split(':')
    .map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0);
};

/* Concert files are named like "gd77-05-08d1t04Scarlet Begonias.mp3",
   "01-SigurRos-Live...-Yfirboro.mp3" or just "deadco2023-05-08t07.mp3".
   Pull the song name out when the taper put one in. */
const iaBare = (name) =>
  String(name)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{1,3}[\s._-]+/, '');

const iaLabel = (file, fallback, prefix = '') => {
  const stem = String(file.name).replace(/\.[a-z0-9]+$/i, '');
  const lead = stem.match(/^(\d{1,3})[\s._-]+(.*)$/);
  let body = lead ? lead[2] : stem;
  if (prefix && body.startsWith(prefix)) body = body.slice(prefix.length);
  const marked = body.match(/(?:d\d+)?(?:s\d+)?t(\d+)[\s._-]*(.*)$/i);
  const number = marked ? Number(marked[1]) || fallback : Number(lead?.[1]) || fallback;
  const tail = String(marked ? marked[2] : body)
    .replace(/_+/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[>\-–—:]+\s*$/, '')
    .trim();
  const looksLikeSong = tail.length > 1 && (tail.includes(' ') || /[A-Z]/.test(tail));
  const named =
    typeof file.title === 'string'
      ? cleanName(file.title)
          .replace(/[>\-–—:]+\s*$/, '')
          .replace(/^\d{1,3}[.)\-]\s+(?=\S)/, '')
          .trim()
      : '';
  // A stored title beats a parsed filename, but some tapers only ever put the
  // filename or "Track 3" in that field.
  const namedOk =
    named.length > 1 &&
    named !== stem &&
    !/^track\s*\d+$/i.test(named) &&
    !/\b(d\d+)?(s\d+)?t\d{2}\b/i.test(named);
  return {
    number,
    title: (namedOk ? named : '') || (looksLikeSong ? tail : '') || `Track ${number}`,
  };
};

/* Tapers share a filename stem across a whole show
   ("SigurRos-Live20130921-...-Yfirboro.mp3"). Strip what every file has in
   common so the song name is all that is left. */
const iaPrefix = (names) => {
  if (names.length < 2) return '';
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i += 1;
    prefix = prefix.slice(0, i);
  }
  const cut = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('_'), prefix.lastIndexOf('.'));
  return cut > 5 ? prefix.slice(0, cut + 1) : '';
};

const iaTrack = (identifier, file, meta, fallback, prefix = '', artistFallback = 'Live archive') => {
  const creator = meta?.metadata?.creator;
  const artist = cleanName(Array.isArray(creator) ? creator[0] : creator) || artistFallback;
  const showRaw = meta?.metadata?.title;
  const show = cleanName(Array.isArray(showRaw) ? showRaw[0] : showRaw) || identifier;
  const { number, title } = iaLabel(file, fallback, prefix);
  const track = {
    id: `ia:${identifier}/${file.name}`,
    title,
    artist,
    artistId: `ia:${artist}`,
    art: `${IA}/services/img/${encodeURIComponent(identifier)}`,
    duration: iaSeconds(file.length),
    genre: 'Live',
    plays: 0,
    album: show,
    src: `${IA}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`,
    preview: false,
    source: 'archive',
    number,
  };
  tracks.set(track.id, track);
  return track;
};

const iaShow = async (identifier, limit = 6) => {
  const meta = await iaItem(identifier);
  const files = (meta?.files || [])
    .filter((file) => /\.mp3$/i.test(file.name) && Number(file.size) > 150000)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (!files.length) return [];
  const prefix = iaPrefix(files.map((file) => iaBare(file.name)));
  return files.slice(0, limit).map((file, i) => iaTrack(identifier, file, meta, i + 1, prefix));
};

/* Netlabel releases are ordinary albums: several songs per item, real titles,
   and durations that fit a song rather than a whole concert. The netlabels
   collection holds tens of thousands of Creative Commons releases. */
const iaAlbum = async (identifier, limit = 6) => {
  const meta = await iaItem(identifier);
  const files = (meta?.files || [])
    .filter(
      (file) =>
        /\.mp3$/i.test(file.name) &&
        !/_64kb|_128kb|_vbr\.mp3$/i.test(file.name) &&
        Number(file.size) > 250000,
    )
    .filter((file) => {
      const seconds = iaSeconds(file.length);
      return seconds >= 60 && seconds <= 900;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (!files.length) return [];
  const prefix = iaPrefix(files.map((file) => iaBare(file.name)));
  return files.slice(0, limit).map((file, i) => {
    const track = iaTrack(identifier, file, meta, i + 1, prefix, 'Independent artist');
    track.genre = 'Album';
    return track;
  });
};

const iaNetlabels = async (query = 'collection:netlabels', albums = 6, perAlbum = 5) => {
  const docs = await iaSearch(`${query} AND mediatype:audio`, albums * 2);
  const lists = await Promise.all(
    docs.slice(0, albums * 2).map((doc) => iaAlbum(doc.identifier, perAlbum).catch(() => [])),
  );
  const seen = new Set();
  const list = [];
  for (const track of lists.flat()) {
    const key = `${track.title}|${track.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(track);
    if (list.length >= albums * perAlbum) break;
  }
  return list;
};

const iaAdd = (id, title, list) => {
  const trackList = list.filter(Boolean);
  contexts.set(id, { title, ids: trackList.map((t) => t.id) });
  return trackList;
};

const iaTrackFromId = async (id) => {
  const rest = String(id).slice(3);
  const cut = rest.indexOf('/');
  if (cut < 1) return null;
  const meta = await iaItem(rest.slice(0, cut));
  const file = (meta?.files || []).find((entry) => entry.name === rest.slice(cut + 1));
  if (!file) return null;
  const names = (meta?.files || [])
    .filter((entry) => /\.mp3$/i.test(entry.name))
    .map((entry) => iaBare(entry.name));
  return iaTrack(rest.slice(0, cut), file, meta, 1, iaPrefix(names));
};

/* One show per act keeps the home row varied instead of five Grateful Dead
   nights in a row. */
const IA_FEATURED = ['Grateful Dead', 'Goose', 'moe.', 'Widespread Panic', 'Sigur Rós'];

const namedCount = (list) => list.filter((track) => !/^Track \d+$/.test(track.title)).length;

const iaHome = async () => {
  const batches = await Promise.all(
    IA_FEATURED.map((name) =>
      iaSearch(`collection:etree AND creator:"${name}" AND format:"VBR MP3"`, 3).catch(() => []),
    ),
  );
  const candidates = batches.map((docs, index) =>
    docs
      .filter((doc) => String(doc.creator || '').toLowerCase() === IA_FEATURED[index].toLowerCase())
      .slice(0, 2)
      .map((doc) => doc.identifier),
  );
  // Some tapers do not name their files, so check the runner-up show too and
  // keep whichever one actually lists song titles.
  const shows = await Promise.all(
    candidates.map(async (ids) => {
      const lists = await Promise.all(ids.map((id) => iaShow(id, 4).catch(() => [])));
      lists.sort((a, b) => namedCount(b) - namedCount(a));
      return lists[0] || [];
    }),
  );
  return shows.flat();
};

const iaByArtist = async (name, maxShows = 3, perShow = 10) => {
  const docs = await iaSearch(
    `collection:etree AND creator:"${name.replace(/"/g, '')}" AND format:"VBR MP3"`,
    12,
  );
  const shows = await Promise.all(
    docs
      .slice(0, maxShows)
      .map((doc) => iaShow(doc.identifier, perShow).catch(() => [])),
  );
  return shows.flat();
};

/* The Great 78 Project digitises public-domain 78rpm records. Each item is one
   side of a disc, so it yields a single full-length song with a real title. */
const ia78 = async (limit = 12, query = 'collection:georgeblood AND mediatype:audio') => {
  const docs = await iaSearch(query, limit * 2);
  const built = await Promise.all(
    docs.slice(0, limit * 2).map(async (doc) => {
      const meta = await iaItem(doc.identifier).catch(() => null);
      const file = (meta?.files || [])
        .filter(
          (entry) =>
            /\.mp3$/i.test(entry.name) &&
            !/_64kb|_128kb/i.test(entry.name) &&
            iaSeconds(entry.length) > 90,
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0];
      if (!file) return null;

      const creator = meta?.metadata?.creator ?? doc.creator;
      const artist = cleanName(Array.isArray(creator) ? creator[0] : creator) || 'Archive artist';
      const fileTitle = cleanName(Array.isArray(file.title) ? file.title[0] : file.title);
      const itemTitle = cleanName(doc.title);
      const title = (fileTitle || itemTitle || iaLabel(file, 1).title).replace(
        /\s*[-(]\s*restored\)?$/i,
        '',
      );

      const track = {
        id: `ia:${doc.identifier}/${file.name}`,
        title: title.trim() || `Track 1`,
        artist,
        artistId: `ia:${artist}`,
        art: `${IA}/services/img/${encodeURIComponent(doc.identifier)}`,
        duration: iaSeconds(file.length),
        genre: 'Classic',
        plays: 0,
        album: itemTitle,
        src: `${IA}/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name)}`,
        preview: false,
        source: 'archive',
        number: 1,
      };
      tracks.set(track.id, track);
      return track;
    }),
  );
  return built.filter(Boolean).slice(0, limit);
};

/* ---- full-version resolver ------------------------------------------------
   Chart rows are 30 second previews because that is all the public catalog
   hands out. When one starts playing we look for the same song in the keyless
   full-length catalogs. A confident match swaps the audio for the complete
   file in place, so the row, the queue and your likes keep working. Nothing is
   invented: if no legal full version exists, the clip stays labelled a clip. */
const FULL_KEY = 'tessera.fullv2';

const fullCache = (() => {
  try {
    const loaded = JSON.parse(localStorage.getItem(FULL_KEY) || '{}');
    return loaded && typeof loaded === 'object' ? loaded : {};
  } catch {
    return {};
  }
})();

const saveFullCache = () => {
  try {
    const entries = Object.entries(fullCache).slice(-150);
    localStorage.setItem(FULL_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* quota or private mode - the in-memory copy still works this session */
  }
};

/* Compare titles the way a listener would: ignore brackets, punctuation and
   words that describe a release rather than the song. */
const songKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(feat|ft|featuring|remaster|remastered|version|official|audio|video|lyric|lyrics|hd|hq|mono|stereo)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

const artistKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* Only collections where archive.org is allowed to serve the audio: netlabel
   releases, public-domain 78s and taper-approved live recordings. No rip of a
   commercial master is reachable through this query. */
const IA_FULL_SCOPE =
  '(collection:netlabels OR collection:georgeblood OR collection:78rpm OR collection:etree)';

const iaFullVersion = async (title, artist) => {
  const want = songKey(title);
  if (want.length < 3) return null;
  const safe = String(title).replace(/["\\]/g, ' ').trim();
  const docs = await iaSearch(
    `mediatype:audio AND title:("${safe}") AND ${IA_FULL_SCOPE}`,
    8,
  ).catch(() => []);
  const singer = artistKey(artist);
  let cover = null;
  for (const doc of docs.slice(0, 8)) {
    const meta = await iaItem(doc.identifier).catch(() => null);
    const files = (meta?.files || []).filter(
      (file) =>
        /\.mp3$/i.test(file.name) &&
        !/_64kb|_128kb|_vbr\.mp3$/i.test(file.name) &&
        Number(file.size) > 200000,
    );
    for (const file of files) {
      const label = iaLabel(file, 1);
      if (songKey(label.title) !== want) continue;
      const creator = meta?.metadata?.creator;
      const by = cleanName(Array.isArray(creator) ? creator[0] : creator) || '';
      const candidate = {
        src: `${IA}/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name)}`,
        duration: iaSeconds(file.length),
        source: 'archive',
        by,
      };
      // Same performer is the real thing. A different performer is a cover, so
      // keep it only as a fallback and say so in the player. Unknown performer
      // stays unlabelled rather than pretending.
      if (!singer || !by) return candidate;
      const byKey = artistKey(by);
      if (byKey.includes(singer) || singer.includes(byKey)) return { ...candidate, cover: false };
      if (!cover) cover = { ...candidate, cover: true };
    }
  }
  return cover;
};

const ovFullVersion = async (title, artist) => {
  const want = songKey(title);
  if (want.length < 3) return null;
  const json = await ovQuery({ q: `${title} ${artist}` }, 20).catch(() => null);
  const hit = ovList(json).find((track) => songKey(track.title) === want);
  if (!hit?.src) return null;
  const singer = artistKey(artist);
  const cover = singer && hit.artist ? !artistKey(hit.artist).includes(singer) : undefined;
  return { src: hit.src, duration: hit.duration, source: 'openverse', by: hit.artist, cover };
};

const auFullVersion = async (title, artist) => {
  const want = songKey(title);
  if (want.length < 3) return null;
  const data = await api(
    `/tracks/search?query=${encodeURIComponent(`${title} ${artist}`)}&limit=10`,
  ).catch(() => []);
  const hit = (Array.isArray(data) ? data : [])
    .map((raw) => normTrack(raw))
    .find((track) => songKey(track.title) === want);
  if (!hit?.src) return null;
  const singer = artistKey(artist);
  const cover = singer && hit.artist ? !artistKey(hit.artist).includes(singer) : undefined;
  return { src: hit.src, duration: hit.duration, source: 'audius', by: hit.artist, cover };
};

const resolving = new Map();

const findFullVersion = (track) => {
  if (!track || !track.preview) return Promise.resolve(null);
  if (fullCache[track.id]) return Promise.resolve(fullCache[track.id]);
  if (!resolving.has(track.id)) {
    const attempt = (async () => {
      for (const source of [iaFullVersion, ovFullVersion, auFullVersion]) {
        const found = await source(track.title, track.artist).catch(() => null);
        if (found?.src) return found;
      }
      return null;
    })()
      .then((found) => {
        if (!found) return null;
        const upgraded = {
          ...track,
          src: found.src,
          duration: found.duration || track.duration,
          preview: false,
          fullKind: found.cover === true ? 'cover' : found.cover === false ? 'original' : 'alternative',
          fullBy: found.by || '',
          fullSource: found.source,
        };
        fullCache[track.id] = upgraded;
        saveFullCache();
        return upgraded;
      })
      .finally(() => resolving.delete(track.id));
    resolving.set(track.id, attempt);
  }
  return resolving.get(track.id);
};

/* Swap the audio under the current track without disturbing the queue, the
   play position bookkeeping or any saved like. */
const upgradeToFull = async (track, autoplay = false) => {
  if (!track || !track.preview) return;
  const startedPlaying = autoplay || !audio.paused;
  const found = await findFullVersion(track).catch(() => null);
  const now = currentTrack();
  if (!now || now.id !== track.id) return; // the listener moved on
  if (!found) {
    now.noFull = true;
    paintNowPlaying();
    return;
  }
  Object.assign(now, found, {
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    art: track.art || '',
    album: track.album,
    preview: false,
  });
  tracks.set(now.id, now);
  audio.src = now.src;
  audio.load();
  if (startedPlaying) audio.play().catch(() => {});
  paintNowPlaying();
  paintQueue();
  toast(
    now.fullKind === 'cover'
      ? `No licensed original - playing a full cover${now.fullBy ? ` by ${now.fullBy}` : ''}`
      : now.fullKind === 'alternative'
        ? 'Full version found - archive recording'
        : 'Full version found - playing the complete track',
  );
};

/* ---- licensed playback: Spotify -------------------------------------------
   The only way to hear a commercial master is to use a licensed service. This
   talks to Spotify's Web API with PKCE (no client secret, no backend) and plays
   through their Web Playback SDK, so the audio stays inside Spotify's licence.
   It needs two things that cannot be shipped inside an app: your own free
   Spotify developer app (a client id) and a Spotify Premium account, because
   Spotify only grants streaming to Premium listeners. Without them every other
   part of the player keeps working exactly as before. */
const SPOTIFY_ID_KEY = 'tessera.spotify.client';
const SPOTIFY_TOKEN_KEY = 'tessera.spotify.token';
const SPOTIFY_VERIFIER_KEY = 'tessera.spotify.verifier';
const SPOTIFY_SCOPES =
  'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';

const spClientId = () => (localStorage.getItem(SPOTIFY_ID_KEY) || '').trim();
const spRedirect = () => `${location.origin}/settings`;

const spTokenRaw = () => {
  try {
    return JSON.parse(localStorage.getItem(SPOTIFY_TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
};

const spSaveToken = (data) => {
  const token = {
    access: data.access_token,
    refresh: data.refresh_token || spTokenRaw()?.refresh || '',
    expires: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  try {
    localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(token));
  } catch {
    /* private mode - the session still streams */
  }
  return token;
};

const spConnected = () => Boolean(spClientId() && spTokenRaw()?.refresh);
const spProduct = () => localStorage.getItem('tessera.spotify.product') || '';

const spToken = async () => {
  const token = spTokenRaw();
  if (!token?.refresh) throw new Error('Spotify is not connected');
  if (token.access && Date.now() < token.expires - 60000) return token.access;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refresh,
    client_id: spClientId(),
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    throw new Error('Spotify session expired - connect again');
  }
  return spSaveToken(await res.json()).access;
};

const spApi = async (path, options = {}) => {
  const token = await spToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Spotify request failed (${res.status})`);
  return res.json();
};

const spB64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const spLogin = async () => {
  const id = spClientId();
  if (!id) {
    toast('Paste your Spotify client id first');
    return;
  }
  const verifier = spB64(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const query = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: spRedirect(),
    code_challenge_method: 'S256',
    code_challenge: spB64(digest),
    scope: SPOTIFY_SCOPES,
    show_dialog: 'false',
  });
  location.href = `https://accounts.spotify.com/authorize?${query.toString()}`;
};

const spFinishLogin = async (code) => {
  const verifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY);
  if (!verifier) return false;
  const body = new URLSearchParams({
    client_id: spClientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: spRedirect(),
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  localStorage.removeItem(SPOTIFY_VERIFIER_KEY);
  if (!res.ok) return false;
  spSaveToken(await res.json());
  return true;
};

const spotify = {
  ready: false,
  deviceId: '',
  player: null,
  active: false,
  paused: true,
  position: 0,
  duration: 0,
  wasPlaying: false,
  loading: null,
};

const spLoadSdk = () =>
  new Promise((resolve, reject) => {
    if (window.Spotify?.Player) return resolve();
    if (!document.querySelector('script[data-spotify-sdk]')) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.dataset.spotifySdk = '1';
      document.head.append(script);
    }
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    setTimeout(() => {
      if (window.Spotify?.Player) resolve();
      else reject(new Error('Spotify player did not load'));
    }, 12000);
  });

const spConnect = async () => {
  if (!spConnected()) return false;
  if (spotify.ready) return true;
  if (spotify.loading) return spotify.loading;
  spotify.loading = (async () => {
    await spLoadSdk();
    const player = new window.Spotify.Player({
      name: 'Tessera',
      getOAuthToken: (cb) => {
        spToken()
          .then(cb)
          .catch(() => {});
      },
      volume: store.muted ? 0 : store.volume,
    });
    player.addListener('ready', ({ device_id }) => {
      spotify.deviceId = device_id;
      spotify.ready = true;
    });
    player.addListener('not_ready', () => {
      spotify.ready = false;
    });
    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      const finished = spotify.wasPlaying && state.paused && state.position === 0;
      spotify.paused = state.paused;
      spotify.position = state.position;
      spotify.duration = state.duration;
      spotify.wasPlaying = !state.paused && state.position > 0;
      paintProgress(state.position, state.duration);
      paintPlayState();
      if (finished) nextTrack(true);
    });
    player.addListener('playback_error', ({ message }) => {
      toast(`Spotify: ${message}`);
      spotify.active = false;
      loadCurrent(true);
    });
    spotify.player = player;
    const ok = await player.connect();
    if (!ok) throw new Error('Spotify player could not connect');
    // Show the account, and whether it is Premium (streaming needs Premium).
    spApi('/me')
      .then((me) => {
        localStorage.setItem('tessera.spotify.product', me?.product || '');
        localStorage.setItem('tessera.spotify.name', me?.display_name || me?.id || '');
        if (location.pathname === '/settings') render();
      })
      .catch(() => {});
    return true;
  })().finally(() => {
    spotify.loading = null;
  });
  return spotify.loading;
};

const spForgot = () => {
  localStorage.removeItem(SPOTIFY_TOKEN_KEY);
  localStorage.removeItem('tessera.spotify.product');
  localStorage.removeItem('tessera.spotify.name');
  spotify.active = false;
  spotify.ready = false;
  spotify.player?.disconnect?.();
  spotify.player = null;
  render();
};

/* Map our chart track to the same recording on Spotify. A wrong match is worse
   than no match, so the title has to agree and the artist has to overlap. */
const spCache = new Map();

const spFindUri = async (track) => {
  if (spCache.has(track.id)) return spCache.get(track.id);
  const title = String(track.title || '').replace(/["\\]/g, ' ').trim();
  const artist = String(track.artist || '').replace(/["\\]/g, ' ').trim();
  if (!title) return '';
  const query = `track:"${title}"${artist ? ` artist:"${artist}"` : ''}`;
  const json = await spApi(`/search?type=track&limit=5&q=${encodeURIComponent(query)}`);
  const want = songKey(title);
  const singer = artistKey(artist);
  const hit = (json?.tracks?.items || []).find((item) => {
    const found = songKey(item.name);
    const by = artistKey((item.artists || []).map((a) => a.name).join(' '));
    const titleOk = found === want || found.includes(want) || want.includes(found);
    const artistOk = !singer || !by || by.includes(singer) || singer.includes(by);
    return titleOk && artistOk;
  });
  const uri = hit?.uri || '';
  spCache.set(track.id, uri);
  return uri;
};

const spPlay = async (uri, autoplay = true) => {
  await spApi(`/me/player/play?device_id=${encodeURIComponent(spotify.deviceId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
  spotify.active = true;
  spotify.paused = !autoplay;
  if (!autoplay) await spotify.player?.pause?.();
  audio.pause();
  paintPlayState();
};

const api = (path) => {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}app_name=${APP_NAME}`;
  if (!cache.has(url)) {
    const promise = fetch(url, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
        return res.json();
      })
      .then((json) => json.data ?? json)
      .catch((error) => {
        cache.delete(url);
        throw error;
      });
    cache.set(url, promise);
  }
  return cache.get(url);
};


const addContext = (id, title, list) => {
  const trackList = normList(list);
  contexts.set(id, { title, ids: trackList.map((t) => t.id) });
  return trackList;
};

const ctxTracks = (id) => (contexts.get(id)?.ids || []).map((tid) => tracks.get(tid)).filter(Boolean);

/* Saved likes and playlists store ids only, so a fresh page load has no track
   metadata for them. Pull the missing ones before painting those views. */
const hydrate = async (ids) => {
  const missing = [...new Set(ids.filter(Boolean))].filter((id) => {
    if (tracks.has(id)) return false;
    // A preview that we already upgraded keeps its complete audio across loads.
    if (fullCache[id]) {
      tracks.set(id, fullCache[id]);
      return false;
    }
    return true;
  });
  if (!missing.length) return false;
  await Promise.all(
    missing.map((id) =>
      (id.startsWith('dz')
        ? dz(`/track/${id.slice(2)}`).then((raw) => dzTrack(Array.isArray(raw) ? raw[0] : raw))
        : id.startsWith('jm')
          ? jmFetch(`/tracks/?id=${id.slice(2)}`).then((list) => jmTrack(list[0]))
          : id.startsWith('ia:')
            ? iaTrackFromId(id).catch(() => null)
            : id.startsWith('ov:')
              ? ovJson(`${OV}/audio/${id.slice(3)}/`).then((raw) => ovTrack(raw))
              : api(`/tracks/${id}`).then((data) => {
                  const raw = Array.isArray(data) ? data[0] : data;
                  if (raw && raw.id) normTrack(raw);
                })
      ).catch(() => {}),
    ),
  );
  return true;
};

const streamUrl = (id) => `${API}/tracks/${id}/stream?app_name=${APP_NAME}`;

/* -"--"- audio engine -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const audio = $('#audio');
const player = {
  queue: [],
  index: -1,
  contextId: null,
  shuffle: false,
  repeat: 'off',
  order: [],
  consecutiveErrors: 0,
};

const currentTrack = () => player.queue[player.index] || null;

const setQueue = (list, startIndex = 0, contextId = null) => {
  player.queue = [...list];
  player.contextId = contextId;
  player.index = Math.max(0, Math.min(startIndex, player.queue.length - 1));
  player.consecutiveErrors = 0;
  if (player.shuffle) buildShuffleOrder(player.index);
  loadCurrent(true);
};

const buildShuffleOrder = (current) => {
  const rest = player.queue.map((_, i) => i).filter((i) => i !== current);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  player.order = [current, ...rest];
};

const isPlaying = () => (spotify.active ? !spotify.paused : !audio.paused && !audio.ended);

const loadCurrent = async (autoplay = false) => {
  const track = currentTrack();
  if (!track) return;

  /* With Spotify connected the licensed master wins. If Spotify does not have
     the recording (or the account cannot stream), fall through to the open
     catalogs exactly as before. */
  if (spotify.ready && spConnected()) {
    const uri = await spFindUri(track).catch(() => '');
    if (uri && currentTrack()?.id === track.id) {
      try {
        await spPlay(uri, autoplay);
        paintNowPlaying();
        paintQueue();
        store.last = { id: track.id, contextId: player.contextId, index: player.index };
        saveLast();
        updateMediaSession(track);
        return;
      } catch {
        /* fall back to the open catalog */
      }
    }
  }

  spotify.active = false;
  audio.src = track.src || streamUrl(track.id);
  audio.volume = store.muted ? 0 : store.volume;
  paintNowPlaying();
  paintQueue();
  if (autoplay) {
    audio.play().catch(() => {
      /* autoplay may be blocked until a user gesture; the play button covers that */
    });
  }
  store.last = { id: track.id, contextId: player.contextId, index: player.index };
  saveLast();
  updateMediaSession(track);
  // A 30 second clip may have a legal full-length twin; check while it plays.
  if (track.preview) upgradeToFull(track, autoplay);
};

const playContext = (contextId, index = 0) => {
  const list = ctxTracks(contextId);
  if (!list.length) return;
  if (player.contextId === contextId && player.queue.length === list.length && player.index === index) {
    togglePlay();
    return;
  }
  setQueue(list, index, contextId);
};

const togglePlay = () => {
  if (!currentTrack()) return;
  if (spotify.active && spotify.player) {
    spotify.player.togglePlay().catch(() => {
      // The SDK can lose its session; drop back to the open catalog.
      spotify.active = false;
      loadCurrent(true);
    });
    return;
  }
  if (audio.paused) audio.play().catch(() => toast('Playback was blocked - press play again'));
  else audio.pause();
};

/* Rewind whichever engine is live: 0 back to the start of the current track. */
const rewindCurrent = () => {
  if (spotify.active && spotify.player) spotify.player.seek(0).catch(() => {});
  else audio.currentTime = 0;
};

/* Stop whichever engine is live (end of a queue with repeat off). */
const stopPlayback = () => {
  if (spotify.active && spotify.player) spotify.player.pause().catch(() => {});
  else {
    audio.pause();
    audio.currentTime = 0;
  }
  paintPlayState();
};

const nextTrack = (auto = false) => {
  if (!player.queue.length) return;
  if (auto && player.repeat === 'one') {
    rewindCurrent();
    if (!spotify.active) audio.play().catch(() => {});
    else spotify.player?.resume?.().catch(() => {});
    return;
  }
  if (player.shuffle) {
    const pos = player.order.indexOf(player.index);
    if (pos === player.order.length - 1) {
      if (player.repeat === 'all') {
        buildShuffleOrder(player.index);
        player.index = player.order[0];
        loadCurrent(true);
      } else if (auto) {
        stopPlayback();
      }
      return;
    }
    player.index = player.order[pos + 1];
    loadCurrent(true);
    return;
  }
  if (player.index >= player.queue.length - 1) {
    if (player.repeat === 'all') {
      player.index = 0;
      loadCurrent(true);
    } else if (auto) {
      stopPlayback();
    }
    return;
  }
  player.index += 1;
  loadCurrent(true);
};

const prevTrack = () => {
  if (!player.queue.length) return;
  const at = spotify.active ? spotify.position / 1000 : audio.currentTime;
  if (at > 3) {
    rewindCurrent();
    return;
  }
  if (player.shuffle) {
    const pos = player.order.indexOf(player.index);
    player.index = player.order[Math.max(0, pos - 1)];
  } else {
    player.index = Math.max(0, player.index - 1);
  }
  loadCurrent(true);
};

const toggleLike = (id) => {
  if (!id) return;
  if (store.liked.has(id)) store.liked.delete(id);
  else store.liked.add(id);
  saveStore();
  paintLikeButtons(id);
  renderSidebar();
  if (location.pathname.startsWith('/liked')) render();
  toast(store.liked.has(id) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
};

/* -"--"- UI paint -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const paintProgress = (current, duration) => {
  const total = Number(duration) || 0;
  const ratio = total ? Math.min(1, (Number(current) || 0) / total) : 0;
  const seek = $('#seek');
  if (seek) {
    seek.value = String(Math.round(ratio * 1000));
    seek.style.setProperty('--fill', `${ratio * 100}%`);
  }
  $('#curTime').textContent = fmtTime(current || 0);
  $('#durTime').textContent = fmtTime(total);
};

const paintPlayState = () => {
  const playing = isPlaying();
  const icon = playing ? '#i-pause' : '#i-play';
  $('#playBtn').innerHTML = `<svg aria-hidden="true"><use href="${icon}"/></svg>`;
  $('#playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $$('.tl-row, .card').forEach((el) => el.classList.remove('is-playing'));
  if (currentTrack()) {
    $$(`[data-track-row="${currentTrack().id}"]`).forEach((el) => el.classList.add('is-playing'));
  }
};

const paintNowPlaying = () => {
  const track = currentTrack();
  const art = $('#npArt');
  const title = $('#npTitle');
  const artist = $('#npArtist');
  if (!track) {
    art.style.backgroundImage = '';
    title.textContent = 'Nothing playing';
    title.removeAttribute('href');
    artist.textContent = '';
    artist.removeAttribute('href');
    const preview = $('#npPreview');
    if (preview) preview.hidden = true;
    $('#npLike').disabled = true;
    return;
  }
  art.style.backgroundImage = track.art ? `url("${track.art}")` : '';
  title.textContent = track.title;
  title.href = `/artist?id=${track.artistId}`;
  title.dataset.link = '';
  artist.textContent = track.artist;
  artist.href = `/artist?id=${track.artistId}`;
  artist.dataset.link = '';
  const preview = $('#npPreview');
  if (preview) {
    if (track.preview) {
      preview.hidden = false;
      preview.textContent = track.noFull ? '30s preview - no full version' : '30s preview';
    } else if (track.fullKind) {
      preview.hidden = false;
      preview.textContent =
        track.fullKind === 'cover'
          ? `Full cover${track.fullBy ? ` - ${track.fullBy}` : ''}`
          : track.fullKind === 'alternative'
            ? 'Full version - archive recording'
            : 'Full version';
    } else {
      preview.hidden = true;
      preview.textContent = '';
    }
  }
  $('#npLike').disabled = false;
  paintLikeButtons(track.id);
  document.title = `${track.title} - ${track.artist}`;
  paintPlayState();
};

const paintLikeButtons = (id) => {
  const liked = store.liked.has(id);
  $$('[data-like]').forEach((btn) => {
    if (btn.dataset.like !== id) return;
    btn.setAttribute('aria-pressed', String(liked));
    btn.innerHTML = `<svg aria-hidden="true"><use href="${liked ? '#i-heart-fill' : '#i-heart'}"/></svg>`;
  });
  const npLike = $('#npLike');
  if (currentTrack()?.id === id) {
    npLike.setAttribute('aria-pressed', String(liked));
    npLike.innerHTML = `<svg aria-hidden="true"><use href="${liked ? '#i-heart-fill' : '#i-heart'}"/></svg>`;
  }
};

const paintQueue = () => {
  const body = $('#queueBody');
  if (!body) return;
  if (!player.queue.length) {
    body.innerHTML = '<p class="state">Nothing queued yet.</p>';
    return;
  }
  body.innerHTML = player.queue
    .map(
      (track, i) => `
      <button class="queue-item ${i === player.index ? 'is-current' : ''}" data-play-index="${i}">
        ${track.art ? `<img src="${esc(track.art)}" alt="" loading="lazy" />` : '<div class="queue-item__art"></div>'}
        <span class="queue-item__text">
          <span class="queue-item__title">${esc(track.title)}</span>
          <span class="queue-item__sub">${esc(track.artist)}</span>
        </span>
      </button>`,
    )
    .join('');
};

const updateMediaSession = (track) => {
  if (!('mediaSession' in navigator) || !track) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || 'Tessera',
    artwork: track.art ? [{ src: track.art, sizes: '480x480', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play', () => {
    if (spotify.active && spotify.player) spotify.player.resume().catch(() => {});
    else audio.play();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (spotify.active && spotify.player) spotify.player.pause().catch(() => {});
    else audio.pause();
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    const target = Number(details.seekTime) || 0;
    if (spotify.active && spotify.player) spotify.player.seek(target * 1000).catch(() => {});
    else audio.currentTime = target;
  });
};

const toast = (message) => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 2600);
};

/* -"--"- audio events -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
audio.addEventListener('play', paintPlayState);
audio.addEventListener('pause', paintPlayState);
audio.addEventListener('loadedmetadata', () => {
  if (spotify.active) return;
  $('#durTime').textContent = fmtTime(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  if (spotify.active) return;
  paintProgress(audio.currentTime, audio.duration);
});
audio.addEventListener('ended', () => {
  if (spotify.active) return;
  nextTrack(true);
});
audio.addEventListener('error', () => {
  if (spotify.active) return;
  if (!currentTrack()) return;
  player.consecutiveErrors += 1;
  if (player.consecutiveErrors > 2) {
    toast('Could not stream that track');
    audio.pause();
    return;
  }
  toast('Track unavailable - skipping');
  setTimeout(() => nextTrack(true), 400);
});
audio.addEventListener('playing', () => {
  player.consecutiveErrors = 0;
  paintPlayState();
});

/* -"--"- sidebar -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const likedTracks = () => [...store.liked].map((id) => tracks.get(id)).filter(Boolean);

const renderSidebar = () => {
  const body = $('#libraryList');
  const likedCount = store.liked.size;
  const rows = [];

  rows.push(`
    <div class="lib-row ${location.pathname.startsWith('/liked') ? 'is-active' : ''}">
      <button class="lib-row__main" data-link-href="/liked">
        <span class="lib-row__art lib-row__art--liked"><svg aria-hidden="true"><use href="#i-heart-fill"/></svg></span>
        <span class="lib-row__text">
          <span class="lib-row__title">Liked Songs</span>
          <span class="lib-row__sub">Playlist - ${likedCount} ${likedCount === 1 ? 'song' : 'songs'}</span>
        </span>
      </button>
    </div>`);

  rows.push(`
    <div class="lib-row ${location.pathname.startsWith('/full') ? 'is-active' : ''}">
      <button class="lib-row__main" data-link-href="/full">
        <span class="lib-row__art" style="background:linear-gradient(135deg,#2f6b46,#14301f);display:grid;place-items:center;color:#fff">
          <svg aria-hidden="true" style="width:18px;height:18px"><use href="#i-browse"/></svg>
        </span>
        <span class="lib-row__text">
          <span class="lib-row__title">Full songs</span>
          <span class="lib-row__sub">Complete tracks - no previews</span>
        </span>
      </button>
    </div>`);

  for (const playlist of store.playlists) {
    const active = location.search.includes(`id=${playlist.id}`);
    rows.push(`
      <div class="lib-row ${active ? 'is-active' : ''}">
        <button class="lib-row__main" data-link-href="/collection?type=local&id=${playlist.id}">
          <span class="lib-row__art" style="background:linear-gradient(135deg,hsl(${hueFrom(playlist.id)} 60% 45%),hsl(${(hueFrom(playlist.id) + 60) % 360} 60% 25%))"></span>
          <span class="lib-row__text">
            <span class="lib-row__title">${esc(playlist.name)}</span>
            <span class="lib-row__sub">Playlist - ${playlist.ids.length} songs</span>
          </span>
        </button>
        <button class="lib-row__more" data-menu-playlist="${playlist.id}" aria-label="More options for ${esc(playlist.name)}">
          <svg aria-hidden="true"><use href="#i-more"/></svg>
        </button>
      </div>`);
  }

  if (!store.playlists.length) {
    rows.push(`
      <div class="side-card">
        <h3>Create your first playlist</h3>
        <p>It's easy, we'll help you</p>
        <button class="chip" data-create-playlist>Create playlist</button>
      </div>
      <div class="side-card">
        <h3>Let's find some podcasts to follow</h3>
        <p>We'll keep you updated on new episodes</p>
        <button class="chip" data-link-href="/genre/podcasts-web">Browse podcasts</button>
      </div>`);
  }

  body.innerHTML = rows.join('');
};

const createPlaylist = (name) => {
  const playlist = {
    id: `p${Date.now().toString(36)}`,
    name: name || `My Playlist #${store.playlists.length + 1}`,
    ids: [],
  };
  store.playlists.unshift(playlist);
  saveStore();
  renderSidebar();
  toast('Playlist created');
  return playlist;
};

const addToPlaylist = (playlistId, trackId) => {
  const playlist = store.playlists.find((p) => p.id === playlistId);
  if (!playlist || playlist.ids.includes(trackId)) return;
  playlist.ids.push(trackId);
  saveStore();
  renderSidebar();
  toast(`Added to ${playlist.name}`);
  if (location.search.includes(`id=${playlistId}`)) render();
};

/* -"--"- shared markup -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const artBlock = (track, className = 'card__img') =>
  track.art
    ? `<div class="${className}"><img src="${esc(track.art)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement&&this.parentElement.classList.add('card__img--fallback')" /></div>`
    : `<div class="${className} card__img--fallback"></div>`;

const cardFor = (track, ctxId, index) => `
  <div class="card card--track" role="group" data-play-ctx="${ctxId}" data-index="${index}" title="Play ${esc(track.title)}">
    ${artBlock(track)}
    <button class="card__play" data-play-ctx="${ctxId}" data-index="${index}" aria-label="Play ${esc(track.title)}">
      <svg aria-hidden="true"><use href="#i-play"/></svg>
    </button>
    <h3 class="card__title">${esc(track.title)}</h3>
    <p class="card__sub"><a href="/artist?id=${esc(track.artistId)}" data-link>${esc(track.artist)}</a></p>
  </div>`;

const artistCard = (user, index) => {
  const art = user.profile_picture?.['480x480'] || user.profile_picture?.['150x150'] || '';
  return `
  <a class="card card--artist" href="/artist?id=${esc(user.id)}" data-link>
    <div class="card__img">${art ? `<img src="${esc(art)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}</div>
    <h3 class="card__title">${esc(cleanName(user.name))}</h3>
    <p class="card__sub">Artist${user.follower_count ? ` - ${fmtCount(user.follower_count)} followers` : ''}</p>
  </a>`;
};

const playlistCard = (playlist) => {
  const art =
    playlist.artwork?.['480x480'] || playlist.artwork?.['150x150'] || playlist.artwork?.['1000x1000'] || '';
  return `
  <a class="card" href="/collection?type=playlist&id=${esc(playlist.id)}" data-link>
    <div class="card__img">${art ? `<img src="${esc(art)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}</div>
    <h3 class="card__title">${esc(cleanName(playlist.playlist_name))}</h3>
    <p class="card__sub">${esc(cleanName(playlist.user?.name) || 'Playlist')}</p>
  </a>`;
};

const dzArtistCard = (artist) => `
  <a class="card card--artist" href="/artist?id=dz${esc(artist.id)}" data-link>
    <div class="card__img">${artist.picture_medium || artist.picture_big ? `<img src="${esc(artist.picture_big || artist.picture_medium)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}</div>
    <h3 class="card__title">${esc(cleanName(artist.name))}</h3>
    <p class="card__sub">Artist${artist.nb_fan ? ` - ${fmtCount(artist.nb_fan)} fans` : ''}</p>
  </a>`;

const dzPlaylistCard = (playlist) => `
  <a class="card" href="/collection?type=playlist&id=dz${esc(playlist.id)}" data-link>
    <div class="card__img">${playlist.picture_medium || playlist.picture_big ? `<img src="${esc(playlist.picture_big || playlist.picture_medium)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}</div>
    <h3 class="card__title">${esc(cleanName(playlist.title))}</h3>
    <p class="card__sub">${esc(cleanName(playlist.user?.name) || 'Playlist')}${playlist.nb_tracks ? ` - ${playlist.nb_tracks} songs` : ''}</p>
  </a>`;

const row = (title, itemsHtml, seeAllHref = '') => `
  <section class="section">
    <div class="section__head">
      <h2>${esc(title)}</h2>
      ${seeAllHref ? `<a href="${seeAllHref}" data-link>Show all</a>` : ''}
    </div>
    <div class="row-wrap">
      <button class="row-nav row-nav--prev" data-scroll="-1" aria-label="Scroll left"><svg aria-hidden="true"><use href="#i-left"/></svg></button>
      <div class="row">${itemsHtml}</div>
      <button class="row-nav row-nav--next" data-scroll="1" aria-label="Scroll right"><svg aria-hidden="true"><use href="#i-right"/></svg></button>
    </div>
  </section>`;

const trackRow = (track, index, ctxId, { editable = false } = {}) => `
  <div class="tl-row" data-track-row="${esc(track.id)}" role="row">
    <div class="tl-num">
      <span>${index + 1}</span>
      <button class="tl-play" data-play-ctx="${ctxId}" data-index="${index}" aria-label="Play ${esc(track.title)}">
        <svg aria-hidden="true"><use href="#i-play"/></svg>
      </button>
    </div>
    <div class="tl-main">
      ${track.art ? `<img class="tl-art" src="${esc(track.art)}" alt="" loading="lazy" />` : '<div class="tl-art"></div>'}
      <div class="tl-text">
        <div class="tl-title">${esc(track.title)}</div>
        <a class="tl-artist" href="/artist?id=${esc(track.artistId)}" data-link>${esc(track.artist)}</a>
      </div>
    </div>
    <div class="tl-album">${esc(track.album || track.genre || '-')}</div>
    <div class="tl-dur"${track.preview ? ' title="30 second preview"' : ' title="Full track"'}>${fmtTime(track.duration)}</div>
    <div class="tl-actions">
      <button class="icon-btn" data-like="${esc(track.id)}" aria-pressed="${store.liked.has(track.id)}" aria-label="Save to your library">
        <svg aria-hidden="true"><use href="${store.liked.has(track.id) ? '#i-heart-fill' : '#i-heart'}"/></svg>
      </button>
      <button class="icon-btn" data-menu="${esc(track.id)}" data-menu-ctx="${esc(ctxId)}" ${editable ? 'data-menu-editable="1"' : ''} aria-label="More options">
        <svg aria-hidden="true"><use href="#i-more"/></svg>
      </button>
    </div>
  </div>`;

const trackList = (list, ctxId, options = {}) => `
  <div class="tracklist" role="table">
    <div class="tl-head" role="row">
      <div class="tl-num">#</div>
      <div>Title</div>
      <div class="tl-album">Album</div>
      <div class="tl-dur"><svg aria-hidden="true" style="width:16px;height:16px;margin-left:auto"><use href="#i-clock"/></svg></div>
      <div></div>
    </div>
    ${list.map((track, i) => trackRow(track, i, ctxId, options)).join('')}
  </div>`;

const skeletonRow = (count = 6) =>
  row('Loading', Array.from({ length: count }, () => '<div class="sk-card"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton" style="width:60%"></div></div>').join(''));

const failing = (error) => `
  <div class="state">
    <h2>Catalog unreachable</h2>
    <p>${esc(error?.message || 'The music catalog did not answer.')} Check your connection and try again - nothing is lost, your library is stored on this device.</p>
    <button class="btn-primary" data-retry>Try again</button>
  </div>`;

/* -"--"- views -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const dzData = (res) => (Array.isArray(res) ? res : res?.data || []);

const viewHome = async () => {
  $('#main').innerHTML = `
    <div class="view">
      <div class="hero" style="--hero-a:#1f3a5f">
        <p class="hero__eyebrow">No account needed</p>
        <h1>Good evening</h1>
      </div>
      ${skeletonRow()}
      ${skeletonRow()}
      ${skeletonRow()}
    </div>`;

  try {
    const [chartTracks, chartArtists, pop, rap, rock, playlists, fullTracks, ovRock, ovChill] = await Promise.all([
      dz('/playlist/1313621735?limit=20'),
      dz('/chart/0/artists?limit=12'),
      dz('/chart/132/tracks?limit=14'),
      dz('/chart/116/tracks?limit=14'),
      dz('/chart/152/tracks?limit=14'),
      dz('/chart/0/playlists?limit=12'),
      api('/tracks/trending?time=week&limit=14').catch(() => []),
      ovQuery({ q: 'rock' }, 20).catch(() => null),
      ovQuery({ q: 'electronic' }, 20).catch(() => null),
    ]);

    const top = dzAdd('home:top', 'Top songs right now', dzData(chartTracks.tracks));
    const popList = dzAdd('home:pop', 'Pop right now', dzData(pop));
    const rapList = dzAdd('home:rap', 'Hip-hop right now', dzData(rap));
    const rockList = dzAdd('home:rock', 'Rock right now', dzData(rock));
    const artists = dzData(chartArtists);
    const lists = dzData(playlists);
    const full = addContext('home:full', 'Full-length tracks', fullTracks);
    // Two open-catalog queries merged into one row: real song titles, complete
    // audio, and enough variety that the row does not look like one genre.
    const fullSongs = ovRegister(
      'home:fullsongs',
      'Full songs',
      ovList({ results: [...(ovRock?.results || []), ...(ovChill?.results || [])] }).slice(0, 30),
    );

    $('#main').innerHTML = `
      <div class="view">
        <div class="hero" style="--hero-a:#1f3a5f">
          <p class="hero__eyebrow">No account needed - everything free</p>
          <h1>Good evening</h1>
          <p class="hero__note">Press play on anything. If a full-length recording of that song exists in an open catalog, the player swaps it in automatically and keeps going to the end - otherwise the clip stays labelled <span class="tag">30s preview</span>.</p>
        </div>
        ${row('Top songs right now', top.map((t, i) => cardFor(t, 'home:top', i)).join(''))}
        ${
          fullSongs.length
            ? row(
                'Full songs - every track plays to the end',
                fullSongs.map((t, i) => cardFor(t, 'home:fullsongs', i)).join(''),
                '/full',
              )
            : ''
        }
        ${row('Popular artists', artists.map((a) => dzArtistCard(a)).join(''))}
        ${row('Pop right now', popList.map((t, i) => cardFor(t, 'home:pop', i)).join(''))}
        ${row('Hip-hop right now', rapList.map((t, i) => cardFor(t, 'home:rap', i)).join(''))}
        ${row('Rock right now', rockList.map((t, i) => cardFor(t, 'home:rock', i)).join(''))}
        ${row('Playlists for you', lists.map((p) => dzPlaylistCard(p)).join(''))}
        ${row('Full-length tracks - independent artists', full.map((t, i) => cardFor(t, 'home:full', i)).join(''))}
        <div id="albumRow"></div>
        <div id="liveRow"></div>
        <section class="section">
          <div class="section__head"><h2>Browse all</h2></div>
          <div class="search-grid" style="padding:0">
            ${[
              ['Electronic', '#dc148c'],
              ['Hip-Hop/Rap', '#ba5d07'],
              ['Podcasts', '#27856a'],
              ['Lo-Fi', '#477d95'],
              ['House', '#8d67ab'],
              ['Ambient', '#1e3264'],
              ['Rock', '#e91429'],
              ['Jazz', '#777777'],
              ['R&B/Soul', '#477d95'],
              ['Classical', '#7d4b32'],
            ]
              .map(
                ([genre, color]) => `
                <button class="tile" style="background:${color}" data-genre="${esc(genre)}">
                  ${esc(genre)}
                  <svg aria-hidden="true" style="position:absolute;right:-6px;bottom:-6px;width:72px;height:72px;transform:rotate(24deg);opacity:.45"><use href="#i-browse"/></svg>
                </button>`,
              )
              .join('')}
          </div>
        </section>
      </div>`;
    paintNowPlaying();

    // The live shows need a metadata call per concert, so paint them after the
    // rest of the page instead of holding the whole home screen hostage.
    iaHome()
      .then((live) => {
        const holder = $('#liveRow');
        const liveList = iaAdd('home:live', 'Live sets', live);
        if (!holder || !liveList.length) return;
        holder.innerHTML = row(
          'Live sets - full songs',
          liveList.map((t, i) => cardFor(t, 'home:live', i)).join(''),
        );
      })
      .catch(() => {});

    // Same deal for whole albums from the Creative Commons netlabels catalog.
    iaNetlabels('collection:netlabels AND subject:"electronic"', 6, 4)
      .then((tracks) => {
        const holder = $('#albumRow');
        const albums = iaAdd('home:albums', 'Full albums', tracks);
        if (!holder || !albums.length) return;
        holder.innerHTML = row(
          'Albums - play every track, start to finish',
          albums.map((t, i) => cardFor(t, 'home:albums', i)).join(''),
          '/full',
        );
      })
      .catch(() => {});
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewPodcasts = async () => {
  const categories = [
    ['Educational', '#4a7fb5', 'educational'],
    ['Documentary', '#6b4a7d', 'documentary'],
    ['Comedy', '#a52d8a', 'comedy'],
    ['Pop Culture', '#e0245e', 'pop culture'],
    ['Fitness & Nutrition', '#1f8a63', 'fitness'],
    ['Celebrities', '#7c7c7c', 'celebrity'],
    ['Video games', '#2a6b8f', 'gaming'],
    ['Film', '#8f4a2a', 'film'],
  ];

  $('#main').innerHTML = `
    <div class="view">
      <div class="hero" style="--hero-a:#1e5c46">
        <h1>Podcasts</h1>
      </div>
      <section class="section section--flush">
        <div class="section__head"><h2>Categories</h2></div>
        <div class="search-grid" style="padding:0">
          ${categories
            .map(
              ([name, color, query]) => `
              <button class="tile" style="background:${color}" data-search="${esc(query)}">
                ${esc(name)}
                <svg aria-hidden="true" style="position:absolute;right:-6px;bottom:-6px;width:80px;height:80px;transform:rotate(20deg);opacity:.35"><use href="#i-browse"/></svg>
              </button>`,
            )
            .join('')}
        </div>
      </section>
      <div id="podcastRow">${skeletonRow(5)}</div>
    </div>`;

  try {
    const list = await api('/tracks/trending?genre=Podcasts&limit=18');
    const pods = addContext('podcasts:row', 'Podcasts', list);
    $('#podcastRow').innerHTML = row(
      'Trending episodes',
      pods.map((t, i) => cardFor(t, 'podcasts:row', i)).join(''),
    );
  } catch (error) {
    $('#podcastRow').innerHTML = failing(error);
  }
};

const collectionHeader = ({ kind, title, subtitle, art, round = false, liked = false }) => `
  <div class="collection ${round ? 'collection--round' : ''}" style="--hero-a:hsl(${hueFrom(title)} 42% 26%)">
    ${
      liked
        ? '<div class="collection__art collection__art--liked"><svg aria-hidden="true"><use href="#i-heart-fill"/></svg></div>'
        : `<div class="collection__art">${art ? `<img src="${esc(art)}" alt="" />` : ''}</div>`
    }
    <div class="collection__meta">
      <p class="collection__kind">${esc(kind)}</p>
      <h1 class="collection__title">${esc(title)}</h1>
      <p class="collection__sub">${subtitle}</p>
    </div>
  </div>`;

const viewCollection = async (type, id) => {
  if (!id) return view404();
  if (type === 'local') {
    const playlist = store.playlists.find((p) => p.id === id);
    if (!playlist) return view404();
    if (await hydrate(playlist.ids)) return viewCollection(type, id);
    const list = playlist.ids.map((tid) => tracks.get(tid)).filter(Boolean);
    const ctx = `local:${playlist.id}`;
    // Same reason as Liked Songs: these tracks are already normalised.
    contexts.set(ctx, { title: playlist.name, ids: list.map((track) => track.id) });
    $('#main').innerHTML = `
      <div class="view">
        ${collectionHeader({
          kind: 'Playlist',
          title: playlist.name,
          subtitle: `<strong>${list.length}</strong> ${list.length === 1 ? 'song' : 'songs'} - saved on this device`,
          art: '',
        })}
        <div class="actionbar">
          <button class="actionbar__play" data-play-ctx="${ctx}" data-index="0" aria-label="Play playlist">
            <svg aria-hidden="true"><use href="#i-play"/></svg>
          </button>
          <button class="icon-btn" data-rename-playlist="${playlist.id}" aria-label="Rename playlist">
            <svg aria-hidden="true"><use href="#i-more"/></svg>
          </button>
        </div>
        ${
          list.length
            ? `<div class="section" style="padding:0 16px">${trackList(list, ctx, { editable: true })}</div>`
            : `<div class="state"><h2>This playlist is empty</h2><p>Use the --- menu on any song and pick "Add to playlist".</p></div>`
        }
      </div>`;
    return;
  }

  if (String(id).startsWith('dz')) {
    try {
      const data = await dz(`/playlist/${id.slice(2)}`);
      const playlist = Array.isArray(data) ? data[0] : data;
      if (!playlist) return view404();
      const ctx = `dzplaylist:${playlist.id}`;
      const list = dzAdd(ctx, cleanName(playlist.title), dzData(playlist.tracks));
      const art = playlist.picture_xl || playlist.picture_big || playlist.picture_medium || '';

      $('#main').innerHTML = `
        <div class="view">
          ${collectionHeader({
            kind: 'Playlist',
            title: cleanName(playlist.title) || 'Playlist',
            subtitle: `<strong>${esc(cleanName(playlist.user?.name) || 'Various artists')}</strong> - ${list.length} songs, 30 second previews`,
            art,
          })}
          <div class="actionbar">
            <button class="actionbar__play" data-play-ctx="${ctx}" data-index="0" aria-label="Play">
              <svg aria-hidden="true"><use href="#i-play"/></svg>
            </button>
          </div>
          <div class="section" style="padding:0 16px">${list.length ? trackList(list, ctx) : '<p class="state">This playlist has no playable tracks.</p>'}</div>
        </div>`;
    } catch (error) {
      $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
    }
    return;
  }

  try {
    const data = await api(`/playlists/${id}`);
    const playlist = Array.isArray(data) ? data[0] : data;
    if (!playlist) return view404();
    const list = normList(playlist.tracks || []);
    const ctx = `playlist:${playlist.id}`;
    addContext(ctx, cleanName(playlist.playlist_name), list);
    const art = playlist.artwork?.['480x480'] || playlist.artwork?.['150x150'] || '';
    const totalSecs = list.reduce((sum, t) => sum + t.duration, 0);

    $('#main').innerHTML = `
      <div class="view">
        ${collectionHeader({
          kind: playlist.is_album ? 'Album' : 'Playlist',
          title: cleanName(playlist.playlist_name),
          subtitle: `<strong>${esc(cleanName(playlist.user?.name) || 'Various artists')}</strong> - ${list.length} songs, ${Math.round(totalSecs / 60)} min`,
          art,
        })}
        <div class="actionbar">
          <button class="actionbar__play" data-play-ctx="${ctx}" data-index="0" aria-label="Play">
            <svg aria-hidden="true"><use href="#i-play"/></svg>
          </button>
        </div>
        <div class="section" style="padding:0 16px">${list.length ? trackList(list, ctx) : '<p class="state">This playlist has no playable tracks.</p>'}</div>
      </div>`;
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewPopular = async () => {
  $('#main').innerHTML = `<div class="view">${skeletonRow(4)}</div>`;
  try {
    const chart = await dz('/playlist/1313621735?limit=50');
    const tracksList = dzAdd('popular:week', 'Popular right now', dzData(chart.tracks));
    $('#main').innerHTML = `
      <div class="view">
        ${collectionHeader({
          kind: 'Chart',
          title: 'Popular right now',
          subtitle: `<strong>${tracksList.length} songs</strong> - what is getting played this week, as 30 second previews`,
          art: tracksList[0]?.art || '',
        })}
        <div class="actionbar">
          <button class="actionbar__play" data-play-ctx="popular:week" data-index="0" aria-label="Play chart">
            <svg aria-hidden="true"><use href="#i-play"/></svg>
          </button>
        </div>
        <div class="section" style="padding:0 16px">${trackList(tracksList, 'popular:week')}</div>
      </div>`;
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewTopSongs = async () => {
  $('#main').innerHTML = `<div class="view">${skeletonRow(4)}</div>`;
  try {
    const chart = await dz('/playlist/1313621735?limit=50');
    const tracksList = dzAdd('topsongs:month', 'Top songs right now', dzData(chart.tracks));
    $('#main').innerHTML = `
      <div class="view">
        ${collectionHeader({
          kind: 'Playlist',
          title: 'Top songs right now',
          subtitle: `<strong>${tracksList.length} songs</strong> - refreshed from the public chart, 30 second previews`,
          art: tracksList[0]?.art || '',
        })}
        <div class="actionbar">
          <button class="actionbar__play" data-play-ctx="topsongs:month" data-index="0" aria-label="Play playlist">
            <svg aria-hidden="true"><use href="#i-play"/></svg>
          </button>
        </div>
        <div class="section" style="padding:0 16px">${trackList(tracksList, 'topsongs:month')}</div>
      </div>`;
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewLiked = async () => {
  // Hydrate tracks saved in a previous session, then paint.
  if (await hydrate([...store.liked])) return viewLiked();
  const list = likedTracks();
  const ctx = 'liked:songs';
  // Already-normalised tracks: register ids directly. Passing them through
  // addContext would re-run the Audius normaliser and strip their audio URLs.
  contexts.set(ctx, { title: 'Liked Songs', ids: list.map((track) => track.id) });
  $('#main').innerHTML = `
    <div class="view">
      ${collectionHeader({
        kind: 'Playlist',
        title: 'Liked Songs',
        subtitle: `<strong>${list.length}</strong> ${list.length === 1 ? 'song' : 'songs'} - saved on this device`,
        liked: true,
      })}
      ${
        list.length
          ? `<div class="actionbar">
               <button class="actionbar__play" data-play-ctx="${ctx}" data-index="0" aria-label="Play liked songs">
                 <svg aria-hidden="true"><use href="#i-play"/></svg>
               </button>
             </div>
             <div class="section" style="padding:0 16px">${trackList(list, ctx)}</div>`
          : `<div class="state"><h2>Songs you like live here</h2><p>Tap the heart on any song to save it. No account, nothing to sign up for.</p></div>`
      }
    </div>`;
};

const viewArtist = async (id) => {
  if (!id) return view404();
  $('#main').innerHTML = `<div class="view">${skeletonRow(4)}</div>`;

  if (String(id).startsWith('jm')) {
    const aid = String(id).slice(2);
    try {
      const [artistRes, trackRes] = await Promise.all([
        jmFetch(`/artists/?id=${aid}&imagesize=500`),
        jmFetch(`/artists/tracks/?id=${aid}&limit=40&order=popularity_total&audioformat=mp32`),
      ]);
      const artist = artistRes[0] || {};
      const ctx = `artist:${id}`;
      const list = jmAdd(ctx, cleanName(artist.name) || 'Artist', trackRes);

      $('#main').innerHTML = `
        <div class="view">
          ${collectionHeader({
            kind: 'Artist',
            title: cleanName(artist.name) || 'Artist',
            subtitle: `${list.length} full-length tracks - Jamendo`,
            art: artist.image || '',
            round: true,
          })}
          <div class="actionbar">
            <button class="actionbar__play" data-play-ctx="${esc(ctx)}" data-index="0" aria-label="Play artist">
              <svg aria-hidden="true"><use href="#i-play"/></svg>
            </button>
          </div>
          <div class="section" style="padding:0 16px">
            <div class="section__head"><h2>Popular</h2></div>
            ${list.length ? trackList(list, ctx) : '<p class="state">No public tracks from this artist.</p>'}
          </div>
        </div>`;
    } catch (error) {
      $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
    }
    return;
  }

  if (String(id).startsWith('ov:')) {
    const name = String(id).slice(3);
    try {
      const list = await ovArtists(name, 50);
      const ctx = `artist:${id}`;
      ovRegister(ctx, name, list);
      $('#main').innerHTML = `
        <div class="view">
          ${collectionHeader({
            kind: 'Artist',
            title: name,
            subtitle: `${list.length} full-length ${list.length === 1 ? 'track' : 'tracks'} - complete audio`,
            art: list[0]?.art || '',
            round: true,
          })}
          <div class="actionbar">
            <button class="actionbar__play" data-play-ctx="${esc(ctx)}" data-index="0" aria-label="Play artist">
              <svg aria-hidden="true"><use href="#i-play"/></svg>
            </button>
          </div>
          <div class="section" style="padding:0 16px">
            <div class="section__head"><h2>Songs</h2></div>
            ${
              list.length
                ? trackList(list, ctx)
                : '<p class="state">This artist has no other tracks in the open catalog yet.</p>'
            }
          </div>
        </div>`;
    } catch (error) {
      $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
    }
    return;
  }

  if (String(id).startsWith('ia:')) {
    const name = String(id).slice(3);
    try {
      const list = await iaByArtist(name, 3, 10);
      const ctx = `artist:${id}`;
      iaAdd(ctx, name, list);
      $('#main').innerHTML = `
        <div class="view">
          ${collectionHeader({
            kind: 'Artist',
            title: name,
            subtitle: `${list.length} full-length live tracks - Internet Archive`,
            art: list[0]?.art || '',
            round: true,
          })}
          <div class="actionbar">
            <button class="actionbar__play" data-play-ctx="${esc(ctx)}" data-index="0" aria-label="Play artist">
              <svg aria-hidden="true"><use href="#i-play"/></svg>
            </button>
          </div>
          <div class="section" style="padding:0 16px">
            <div class="section__head"><h2>Live sets</h2></div>
            ${list.length ? trackList(list, ctx) : '<p class="state">No public concert recordings for this artist.</p>'}
          </div>
        </div>`;
    } catch (error) {
      $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
    }
    return;
  }

  if (String(id).startsWith('dz')) {
    const dzId = String(id).slice(2);
    try {
      const [rawArtist, rawTop] = await Promise.all([
        dz(`/artist/${dzId}`),
        dz(`/artist/${dzId}/top?limit=30`),
      ]);
      const artist = Array.isArray(rawArtist) ? rawArtist[0] : rawArtist;
      const ctx = `artist:${id}`;
      const top = dzAdd(ctx, cleanName(artist?.name) || 'Artist', dzData(rawTop));
      const art = artist?.picture_xl || artist?.picture_big || artist?.picture_medium || '';

      $('#main').innerHTML = `
        <div class="view">
          ${collectionHeader({
            kind: 'Artist',
            title: cleanName(artist?.name) || 'Artist',
            subtitle: `${artist?.nb_fan ? `${fmtCount(artist.nb_fan)} fans - ` : ''}${top.length} popular tracks`,
            art,
            round: true,
          })}
          <div class="actionbar">
            <button class="actionbar__play" data-play-ctx="${esc(ctx)}" data-index="0" aria-label="Play artist">
              <svg aria-hidden="true"><use href="#i-play"/></svg>
            </button>
          </div>
          <div class="section" style="padding:0 16px">
            <div class="section__head"><h2>Popular</h2></div>
            ${top.length ? trackList(top, ctx) : '<p class="state">No public tracks from this artist.</p>'}
          </div>
        </div>`;
    } catch (error) {
      $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
    }
    return;
  }

  try {
    const [user, list] = await Promise.all([api(`/users/${id}`), api(`/users/${id}/tracks?limit=20&sort=plays`)]);
    const artist = Array.isArray(user) ? user[0] : user;
    const top = addContext(`artist:${id}`, cleanName(artist?.name) || 'Artist', list);
    const art = artist?.profile_picture?.['1000x1000'] || artist?.profile_picture?.['480x480'] || '';

    $('#main').innerHTML = `
      <div class="view">
        ${collectionHeader({
          kind: 'Artist',
          title: cleanName(artist?.name) || 'Artist',
          subtitle: `${artist?.follower_count ? `${fmtCount(artist.follower_count)} followers - ` : ''}${top.length} tracks`,
          art,
          round: true,
        })}
        <div class="actionbar">
          <button class="actionbar__play" data-play-ctx="artist:${esc(id)}" data-index="0" aria-label="Play artist">
            <svg aria-hidden="true"><use href="#i-play"/></svg>
          </button>
        </div>
        <div class="section" style="padding:0 16px">
          <div class="section__head"><h2>Popular</h2></div>
          ${top.length ? trackList(top, `artist:${id}`) : '<p class="state">No public tracks from this artist.</p>'}
        </div>
      </div>`;
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewSearch = async (query) => {
  const q = (query || '').trim();
  if (!q) {
    $('#main').innerHTML = `
      <div class="view">
        <div class="hero" style="--hero-a:#2b2b2b"><h1>Search</h1></div>
        <div class="state"><h2>What do you want to play?</h2><p>Type a song, artist or genre in the search box. Everything is free and nothing needs an account.</p></div>
      </div>`;
    return;
  }

  $('#main').innerHTML = `<div class="view"><div class="hero" style="--hero-a:#2b2b2b"><h1>${esc(q)}</h1></div>${skeletonRow(5)}</div>`;

  try {
    const [trackRes, artistRes, jmRes, auRes, ovRes] = await Promise.all([
      dz(`/search?q=${encodeURIComponent(q)}&limit=30`),
      dz(`/search/artist?q=${encodeURIComponent(q)}&limit=8`).catch(() => ({ data: [] })),
      jamendoId()
        ? jmFetch(`/tracks/?search=${encodeURIComponent(q)}&limit=20&order=popularity_total&audioformat=mp32`).catch(
            () => [],
          )
        : Promise.resolve([]),
      api(`/tracks/search?query=${encodeURIComponent(q)}&limit=10`).catch(() => []),
      ovQuery({ q }, 30).catch(() => null),
    ]);
    const list = dzAdd(`search:${q}`, `Search: ${q}`, dzData(trackRes));
    const jmSongs = jmAdd(`search:jm:${q}`, `Full songs: ${q}`, jmRes);
    const ovSongs = ovAdd(`search:ov:${q}`, `Full songs: ${q}`, ovRes);
    // Audius search is fuzzy and returns loosely related uploads, so keep only
    // hits that actually name the thing being searched for.
    const auTokens = q
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const auRaw = (Array.isArray(auRes) ? auRes : []).filter((track) => {
      if (!auTokens.length) return true;
      const hay = `${track.title || ''} ${track.user?.name || ''}`.toLowerCase();
      return auTokens.some((word) => hay.includes(word));
    });
    const auSongs = addContext(`search:au:${q}`, `Full songs: ${q}`, auRaw);
    const users = dzData(artistRes);
    const ctx = `search:${q}`;
    const liveDocs = await iaSearch(
      `collection:etree AND (creator:"${q.replace(/"/g, '')}" OR title:"${q.replace(/"/g, '')}") AND format:"VBR MP3"`,
      6,
    ).catch(() => []);
    const liveSongs = iaAdd(
      `search:live:${q}`,
      `Live sets: ${q}`,
      (
        await Promise.all(
          liveDocs.slice(0, 3).map((doc) => iaShow(doc.identifier, 6).catch(() => [])),
        )
      ).flat(),
    );

    // Public-domain 78s are the one catalog where the item title *is* the song
    // title, so a name typed here can return a genuinely complete recording.
    const albumSongs = iaAdd(
      `search:album:${q}`,
      `Full recordings: ${q}`,
      await ia78(
        8,
        `(collection:georgeblood OR collection:78rpm) AND mediatype:audio AND title:("${q.replace(/["\\]/g, '')}")`,
      ).catch(() => []),
    );

    $('#main').innerHTML = `
      <div class="view">
        <div class="hero" style="--hero-a:#2b2b2b">
          <p class="hero__eyebrow">Results for</p>
          <h1>${esc(q)}</h1>
        </div>
        ${
          users && users.length
            ? `<section class="section section--flush">
                 <div class="section__head"><h2>Artists</h2></div>
                 <div class="row">${users.map((a) => dzArtistCard(a)).join('')}</div>
               </section>`
            : ''
        }
        ${
          albumSongs.length
            ? `<section class="section">
                 <div class="section__head"><h2>Full recordings - public domain</h2></div>
                 <div class="row">${albumSongs.map((t, i) => cardFor(t, `search:album:${q}`, i)).join('')}</div>
               </section>`
            : ''
        }
        ${
          ovSongs.length
            ? `<section class="section">
                 <div class="section__head"><h2>Full songs - complete tracks</h2></div>
                 <div class="row">${ovSongs.map((t, i) => cardFor(t, `search:ov:${q}`, i)).join('')}</div>
               </section>`
            : ''
        }
        ${
          auSongs.length
            ? `<section class="section">
                 <div class="section__head"><h2>Full-length on Audius</h2></div>
                 <div class="row">${auSongs.map((t, i) => cardFor(t, `search:au:${q}`, i)).join('')}</div>
               </section>`
            : ''
        }
        ${
          liveSongs.length
            ? `<section class="section">
                 <div class="section__head"><h2>Live sets - full songs</h2></div>
                 <div class="row">${liveSongs.map((t, i) => cardFor(t, `search:live:${q}`, i)).join('')}</div>
               </section>`
            : ''
        }
        ${
          jmSongs.length
            ? `<section class="section">
                 <div class="section__head"><h2>Full songs - no preview cut</h2></div>
                 <div class="row">${jmSongs.map((t, i) => cardFor(t, `search:jm:${q}`, i)).join('')}</div>
               </section>`
            : ''
        }
        <section class="section">
          <div class="section__head"><h2>Songs</h2></div>
          ${list.length ? trackList(list, ctx) : `<p class="state">Nothing matched "${esc(q)}". Try another spelling or a genre like "house".</p>`}
        </section>
      </div>`;
  } catch (error) {
    $('#main').innerHTML = `<div class="view">${failing(error)}</div>`;
  }
};

const viewDownload = () => {
  const installable = Boolean(window.__installPrompt);
  $('#main').innerHTML = `
    <div class="view">
      <div class="dl-hero">
        <div class="dl-hero__brand"><svg aria-hidden="true"><use href="#i-logo"/></svg> Tessera</div>
        <h1>Install Tessera on this computer</h1>
        <p>Your whole library, straight from the browser. No account, no subscription, no paid tier - every feature is on from the first song. Installing just gives it its own window and an icon in your dock.</p>
        <div class="dl-actions">
          <button class="btn-primary" id="installBtn">
            <svg aria-hidden="true"><use href="#i-download"/></svg>
            ${installable ? 'Install app' : 'How to install'}
          </button>
          <a class="btn-ghost" href="/" data-link>Open the player</a>
        </div>
      </div>
      <div class="dl-note">
        <strong>Why there is no installer file:</strong> this is a web player served as static files. Browsers install it natively, which means updates arrive instantly and nothing sits in your downloads folder.
      </div>
      <div class="steps">
        <div class="step"><span>01</span><h3>Open the menu</h3><p>In Chrome or Edge, use the - menu in the top-right of the browser window.</p></div>
        <div class="step"><span>02</span><h3>Choose "Install"</h3><p>Look for "Install Tessera" (or "Apps - Install this site as an app").</p></div>
        <div class="step"><span>03</span><h3>Pin it</h3><p>The player opens in its own window, keeps your library, and shows up in your app list.</p></div>
      </div>
    </div>`;

  $('#installBtn')?.addEventListener('click', async () => {
    if (window.__installPrompt) {
      window.__installPrompt.prompt();
      const choice = await window.__installPrompt.userChoice;
      if (choice.outcome === 'accepted') toast('Installing...');
      window.__installPrompt = null;
      return;
    }
    toast('Use your browser menu - Install app');
  });
};

/* Everything on this page is a complete song. Chips are plain query terms
   rather than a taxonomy, because the open catalog is tagged by people. */
const FULL_GENRES = [
  ['Rock', 'rock'],
  ['Pop', 'pop'],
  ['Hip-hop', 'hip hop'],
  ['Electronic', 'electronic'],
  ['Jazz', 'jazz'],
  ['Blues', 'blues'],
  ['Folk', 'folk'],
  ['Acoustic', 'acoustic'],
  ['Metal', 'metal'],
  ['Ambient', 'ambient'],
  ['Classical', 'classical'],
  ['Soul', 'soul'],
  ['Reggae', 'reggae'],
  ['Piano', 'piano'],
];

const viewFull = async (genre) => {
  const active = FULL_GENRES.find(([, q]) => q === genre) || FULL_GENRES[0];
  const ctx = `full:${active[1]}`;

  $('#main').innerHTML = `
    <div class="view">
      <div class="hero" style="--hero-a:#20402a">
        <p class="hero__eyebrow">Complete audio</p>
        <h1>Full songs</h1>
        <p class="hero__note">Every track on this page plays start to finish - no 30 second cut. Openly licensed music, streamed straight from the file the artist published.</p>
      </div>
      <section class="section section--flush">
        <div class="section__head"><h2>Genres</h2></div>
        <div class="chip-row">
          ${FULL_GENRES.map(
            ([label, q]) =>
              `<button class="chip${q === active[1] ? ' is-active' : ''}" data-full-genre="${esc(q)}" aria-pressed="${q === active[1]}">${esc(label)}</button>`,
          ).join('')}
        </div>
      </section>
      <div id="fullBody">${skeletonRow(4)}</div>
    </div>`;

  try {
    /* The Archive's netlabels collection is the reliable primary here: real
       albums, real track titles, complete MP3s, no key and no rate limit.
       Genre comes from the release's own subject tags. */
    const query = `collection:netlabels AND subject:"${active[1]}"`;
    let list = iaAdd(ctx, active[0], await iaNetlabels(query, 9, 4).catch(() => []));

    // A genre that few netlabel releases tag still deserves a full page.
    if (!list.length) {
      list = iaAdd(
        ctx,
        active[0],
        await iaNetlabels('collection:netlabels AND subject:"rock"', 9, 4).catch(() => []),
      );
    }

    $('#fullBody').innerHTML = `
      <div class="actionbar">
        <button class="actionbar__play" data-play-ctx="${esc(ctx)}" data-index="0" aria-label="Play ${esc(active[0])}">
          <svg aria-hidden="true"><use href="#i-play"/></svg>
        </button>
      </div>
      <div class="section" style="padding:0 16px">
        <div class="section__head"><h2>${esc(active[0])}</h2><span class="section__note">${list.length} complete ${list.length === 1 ? 'track' : 'tracks'}</span></div>
        ${
          list.length
            ? trackList(list, ctx)
            : `<p class="state">Nothing came back for "${esc(active[0])}". Pick another genre, or search for an artist name.</p>`
        }
      </div>
      <div id="ovRow"></div>
      <div id="classicRow"></div>
      <div id="showRow"></div>`;

    /* Bonus rows load after the page is usable. Each one is optional, so a
       blocked or slow catalog never leaves the page half-painted. */
    ovQuery({ q: active[1] }, 30)
      .then((json) => {
        const holder = $('#ovRow');
        const more = ovAdd(`full:ov:${active[1]}`, `More ${active[0]}`, json, 24);
        if (!holder || !more.length) return;
        holder.innerHTML = row(
          `More ${active[0]} - openly licensed`,
          more.map((t, i) => cardFor(t, `full:ov:${active[1]}`, i)).join(''),
        );
      })
      .catch(() => {});

    // Public-domain 78s: real songs from the 1920s-50s, one request per disc.
    ia78(12)
      .then((classic) => {
        const holder = $('#classicRow');
        const sides = iaAdd('full:78', 'Classic 78s', classic);
        if (!holder || !sides.length) return;
        holder.innerHTML = row(
          'Classic 78s - public domain, complete sides',
          sides.map((t, i) => cardFor(t, 'full:78', i)).join(''),
        );
      })
      .catch(() => {});

    // Whole live shows, several songs each, from bands that allow taping.
    iaHome()
      .then((live) => {
        const holder = $('#showRow');
        const shows = iaAdd('full:shows', 'Live sets', live);
        if (!holder || !shows.length) return;
        holder.innerHTML = row(
          'Live sets - every song, start to finish',
          shows.map((t, i) => cardFor(t, 'full:shows', i)).join(''),
        );
      })
      .catch(() => {});
  } catch (error) {
    $('#fullBody').innerHTML = failing(error);
  }
};

const view404 = () => {
  $('#main').innerHTML = `
    <div class="view">
      <div class="state">
        <h2>Nothing here</h2>
        <p>That page does not exist in this player. Head back to the home screen and pick a row.</p>
        <a class="btn-primary" href="/" data-link>Go home</a>
      </div>
    </div>`;
};

/* -"--"- router -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const render = () => {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(location.search);
  renderSidebar();
  paintNowPlaying();

  if (path === '/') return viewHome();
  if (path === '/download') return viewDownload();
  if (path === '/genre/podcasts-web') return viewPodcasts();
  if (path === '/popular-in/om') return viewPopular();
  if (path === '/playlist/37i9dQZF1CLcTo7UzL0sYK') return viewTopSongs();
  if (path === '/search') {
    $('#searchInput').value = params.get('q') || '';
    return viewSearch(params.get('q'));
  }
  if (path === '/full') return viewFull(params.get('genre'));
  if (path === '/liked') return viewLiked();
  if (path === '/artist') return viewArtist(params.get('id'));
  if (path === '/collection') return viewCollection(params.get('type') || 'playlist', params.get('id'));
  return view404();
};

const navigate = (href, { replace = false } = {}) => {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) {
    location.href = href;
    return;
  }
  if (replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
  $('#main').scrollTop = 0;
  render();
};

/* -"--"- events -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link], [data-link-href]');
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
    const href = link.getAttribute('href') || link.dataset.linkHref;
    if (href && !href.startsWith('http')) {
      event.preventDefault();
      navigate(href);
      return;
    }
  }

  const playBtn = event.target.closest('[data-play-ctx]');
  if (playBtn) {
    event.preventDefault();
    playContext(playBtn.dataset.playCtx, Number(playBtn.dataset.index || 0));
    return;
  }

  const playIndex = event.target.closest('[data-play-index]');
  if (playIndex) {
    player.index = Number(playIndex.dataset.playIndex);
    loadCurrent(true);
    return;
  }

  const likeBtn = event.target.closest('[data-like]');
  if (likeBtn) {
    event.preventDefault();
    toggleLike(likeBtn.dataset.like);
    return;
  }

  const menuBtn = event.target.closest('[data-menu]');
  if (menuBtn) {
    event.preventDefault();
    openMenu(menuBtn, menuBtn.dataset.menu, menuBtn.dataset.menuCtx);
    return;
  }

  const playlistMenu = event.target.closest('[data-menu-playlist]');
  if (playlistMenu) {
    event.preventDefault();
    openPlaylistMenu(playlistMenu, playlistMenu.dataset.menuPlaylist);
    return;
  }

  if (event.target.closest('[data-create-playlist]') || event.target.closest('#createBtn')) {
    createPlaylist();
    return;
  }

  if (event.target.closest('[data-jamendo-connect]')) {
    const id = window.prompt('Paste your Jamendo client id (free from devportal.jamendo.com)');
    if (id && id.trim()) {
      localStorage.setItem(JAMENDO_KEY, id.trim());
      cache.clear();
      toast('Jamendo connected - full songs unlocked');
      render();
    }
    return;
  }

  const genreBtn = event.target.closest('[data-genre]');
  if (genreBtn) {
    navigate(`/search?q=${encodeURIComponent(genreBtn.dataset.genre)}`);
    return;
  }

  const fullGenre = event.target.closest('[data-full-genre]');
  if (fullGenre) {
    navigate(`/full?genre=${encodeURIComponent(fullGenre.dataset.fullGenre)}`);
    return;
  }

  const searchBtn = event.target.closest('[data-search]');
  if (searchBtn) {
    navigate(`/search?q=${encodeURIComponent(searchBtn.dataset.search)}`);
    return;
  }

  const scrollBtn = event.target.closest('[data-scroll]');
  if (scrollBtn) {
    const rowEl = scrollBtn.parentElement.querySelector('.row');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    rowEl.scrollBy({
      left: Number(scrollBtn.dataset.scroll) * (rowEl.clientWidth * 0.8),
      behavior: reduced ? 'auto' : 'smooth',
    });
    return;
  }

  if (event.target.closest('[data-retry]')) {
    cache.clear();
    render();
    return;
  }

  const rename = event.target.closest('[data-rename-playlist]');
  if (rename) {
    const playlist = store.playlists.find((p) => p.id === rename.dataset.renamePlaylist);
    const name = prompt('Playlist name', playlist?.name || '');
    if (name && playlist) {
      playlist.name = name;
      saveStore();
      renderSidebar();
      render();
    }
    return;
  }

  if (!event.target.closest('#menu')) closeMenu();
});

$('#homeBtn').addEventListener('click', () => navigate('/'));
$('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const q = $('#searchInput').value.trim();
  navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
});

const searchInput = $('#searchInput');
searchInput.addEventListener('input', () => {
  searchInput.closest('.search').classList.toggle('has-text', Boolean(searchInput.value));
});
searchInput.addEventListener(
  'input',
  debounce(() => {
    const q = searchInput.value.trim();
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`, { replace: true });
  }, 450),
);
$('#searchClear').addEventListener('click', () => {
  searchInput.value = '';
  searchInput.closest('.search').classList.remove('has-text');
  searchInput.focus();
});

$('#playBtn').addEventListener('click', togglePlay);
$('#nextBtn').addEventListener('click', () => nextTrack());
$('#prevBtn').addEventListener('click', prevTrack);
$('#npLike').addEventListener('click', () => toggleLike(currentTrack()?.id));

$('#shuffleBtn').addEventListener('click', (event) => {
  player.shuffle = !player.shuffle;
  event.currentTarget.setAttribute('aria-pressed', String(player.shuffle));
  if (player.shuffle) buildShuffleOrder(player.index);
  toast(player.shuffle ? 'Shuffle on' : 'Shuffle off');
});

$('#repeatBtn').addEventListener('click', (event) => {
  player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
  const btn = event.currentTarget;
  btn.setAttribute('aria-pressed', String(player.repeat !== 'off'));
  btn.setAttribute(
    'aria-label',
    player.repeat === 'off' ? 'Enable repeat' : player.repeat === 'all' ? 'Enable repeat one' : 'Disable repeat',
  );
  btn.innerHTML = `<svg aria-hidden="true"><use href="#${player.repeat === 'one' ? 'i-repeat-one' : 'i-repeat'}"/></svg>`;
  toast(player.repeat === 'off' ? 'Repeat off' : player.repeat === 'all' ? 'Repeat all' : 'Repeat one');
});

const seek = $('#seek');
seek.addEventListener('input', () => {
  const ratio = Number(seek.value) / 1000;
  if (spotify.active && spotify.player) {
    const total = spotify.duration || 0;
    if (total) spotify.player.seek(Math.round(ratio * total)).catch(() => {});
    spotify.position = ratio * total;
  } else {
    if (!audio.duration) return;
    audio.currentTime = ratio * audio.duration;
  }
  seek.style.setProperty('--fill', `${(ratio * 100).toFixed(1)}%`);
});

const vol = $('#vol');
vol.value = String(store.volume);
vol.style.setProperty('--fill', `${store.volume * 100}%`);
const applyVolume = (value) => {
  store.volume = value;
  if (value > 0) store.prevVolume = value;
  store.muted = value === 0;
  audio.volume = value;
  audio.muted = value === 0;
  if (spotify.player?.setVolume) spotify.player.setVolume(value).catch(() => {});
  vol.style.setProperty('--fill', `${value * 100}%`);
  $('#muteBtn').innerHTML = `<svg aria-hidden="true"><use href="#${value === 0 ? 'i-mute' : 'i-volume'}"/></svg>`;
  saveStore();
};
vol.addEventListener('input', () => applyVolume(Number(vol.value)));
$('#muteBtn').addEventListener('click', () => {
  if (store.volume === 0) applyVolume(store.prevVolume || 0.6);
  else applyVolume(0);
});
applyVolume(store.volume);

$('#queueBtn').addEventListener('click', (event) => {
  const q = $('#queue');
  q.hidden = !q.hidden;
  event.currentTarget.setAttribute('aria-pressed', String(!q.hidden));
  paintQueue();
});
$('#queueClose').addEventListener('click', () => {
  $('#queue').hidden = true;
  $('#queueBtn').setAttribute('aria-pressed', 'false');
});

$('#langBtn').addEventListener('click', () => toast('This build only ships English'));

document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (typing || event.metaKey || event.ctrlKey) return;
  if (event.code === 'Space') {
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'ArrowRight') {
    if (spotify.active && spotify.player) spotify.player.seek(Math.min(spotify.duration, spotify.position + 5000)).catch(() => {});
    else audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  } else if (event.key === 'ArrowLeft') {
    if (spotify.active && spotify.player) spotify.player.seek(Math.max(0, spotify.position - 5000)).catch(() => {});
    else audio.currentTime = Math.max(0, audio.currentTime - 5);
  } else if (event.key === 'm') {
    applyVolume(store.volume === 0 ? store.prevVolume || 0.6 : 0);
  } else if (event.key === 'l') {
    toggleLike(currentTrack()?.id);
  } else if (event.key === 's') {
    $('#shuffleBtn').click();
  } else if (event.key === 'r') {
    $('#repeatBtn').click();
  }
});

window.addEventListener('popstate', render);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__installPrompt = event;
});

/* -"--"- context menu -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const menu = $('#menu');

const placeMenu = (x, y) => {
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
};

const closeMenu = () => {
  menu.hidden = true;
  menu.innerHTML = '';
};

const openMenu = (anchor, trackId, ctxId) => {
  const track = tracks.get(trackId);
  if (!track) return;
  const liked = store.liked.has(trackId);
  const localPlaylist = ctxId?.startsWith('local:') ? ctxId.slice(6) : null;

  menu.innerHTML = `
    <button data-menu-action="like" data-id="${esc(trackId)}">
      <svg aria-hidden="true"><use href="#${liked ? 'i-heart' : 'i-heart-fill'}"/></svg>
      ${liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
    </button>
    <button data-menu-action="artist" data-id="${esc(track.artistId)}">
      <svg aria-hidden="true"><use href="#i-library"/></svg> Go to artist
    </button>
    <div class="menu__sep"></div>
    <div class="menu__label">Add to playlist</div>
    <button data-menu-action="new-playlist" data-id="${esc(trackId)}">
      <svg aria-hidden="true"><use href="#i-plus"/></svg> New playlist
    </button>
    ${store.playlists
      .map(
        (p) => `<button data-menu-action="add" data-id="${esc(trackId)}" data-playlist="${esc(p.id)}">
          <svg aria-hidden="true"><use href="#i-check"/></svg> ${esc(p.name)}
        </button>`,
      )
      .join('')}
    ${
      localPlaylist
        ? `<div class="menu__sep"></div>
           <button data-menu-action="remove" data-id="${esc(trackId)}" data-playlist="${esc(localPlaylist)}">
             <svg aria-hidden="true"><use href="#i-close"/></svg> Remove from this playlist
           </button>`
        : ''
    }`;

  const rect = anchor.getBoundingClientRect();
  placeMenu(rect.right - 220, rect.bottom + 4);

  menu.onclick = (event) => {
    const action = event.target.closest('[data-menu-action]');
    if (!action) return;
    const { menuAction, id, playlist } = action.dataset;
    if (menuAction === 'like') toggleLike(id);
    if (menuAction === 'artist') navigate(`/artist?id=${id}`);
    if (menuAction === 'add') addToPlaylist(playlist, id);
    if (menuAction === 'new-playlist') {
      const created = createPlaylist();
      addToPlaylist(created.id, id);
    }
    if (menuAction === 'remove') {
      const target = store.playlists.find((p) => p.id === playlist);
      if (target) {
        target.ids = target.ids.filter((tid) => tid !== id);
        saveStore();
        renderSidebar();
        render();
      }
    }
    closeMenu();
  };
};

const openPlaylistMenu = (anchor, playlistId) => {
  const playlist = store.playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  menu.innerHTML = `
    <button data-playlist-action="rename">Rename</button>
    <button data-playlist-action="delete"><svg aria-hidden="true"><use href="#i-close"/></svg> Delete playlist</button>`;
  const rect = anchor.getBoundingClientRect();
  placeMenu(rect.right, rect.bottom);
  menu.onclick = (event) => {
    const action = event.target.closest('[data-playlist-action]')?.dataset.playlistAction;
    if (action === 'rename') {
      const name = prompt('Playlist name', playlist.name);
      if (name) {
        playlist.name = name;
        saveStore();
        renderSidebar();
        render();
      }
    }
    if (action === 'delete') {
      store.playlists = store.playlists.filter((p) => p.id !== playlistId);
      saveStore();
      renderSidebar();
      navigate('/');
    }
    closeMenu();
  };
};

document.addEventListener('scroll', closeMenu, true);
window.addEventListener('resize', closeMenu);

/* -"--"- boot -"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"--"- */
const boot = () => {
  render();

  // Restore the last session so a reload keeps the song and the shelf.
  const last = store.last;
  if (last?.id) {
    let known = tracks.get(last.id) || null;
    if (!known && fullCache[last.id]) {
      known = fullCache[last.id];
      tracks.set(known.id, known);
    }
    if (known) {
      player.queue = [known];
      player.index = 0;
      loadCurrent(false);
    } else {
      (last.id.startsWith('dz')
        ? dz(`/track/${last.id.slice(2)}`).then((raw) => dzTrack(Array.isArray(raw) ? raw[0] : raw))
        : last.id.startsWith('jm')
          ? jmFetch(`/tracks/?id=${last.id.slice(2)}`).then((list) => jmTrack(list[0]))
          : last.id.startsWith('ia:')
            ? iaTrackFromId(last.id).catch(() => null)
            : last.id.startsWith('ov:')
              ? ovJson(`${OV}/audio/${last.id.slice(3)}/`).then((raw) => ovTrack(raw))
              : api(`/tracks/${last.id}`).then((data) => {
                  const raw = Array.isArray(data) ? data[0] : data;
                  return raw ? normTrack(raw) : null;
                })
      )
        .then((track) => {
          // Never steal playback from a track the user started while we fetched.
          if (!track || currentTrack() || !audio.paused) return;
          player.queue = [track];
          player.index = 0;
          loadCurrent(false);
        })
        .catch(() => {});
    }
  }
};

boot();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}



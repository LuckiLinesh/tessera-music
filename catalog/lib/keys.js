/* Optional providers. Everything here is read at request time on the server, so
   no key is ever shipped to the browser. Missing keys simply disable a source
   instead of breaking search - the app tells the user which ones are live. */

export const config = {
  musicbrainzContact: process.env.MUSICBRAINZ_USER_AGENT || '',
  youtubeKey: (process.env.YOUTUBE_API_KEY || '').trim(),
  jamendoId: (process.env.JAMENDO_CLIENT_ID || '').trim(),
  openverse: process.env.ENABLE_OPENVERSE === '1',
  audiusApp: process.env.AUDIUS_APP_NAME || 'TesseraCatalog',
};

/* The desktop app lets someone paste a key while it runs. Applying it here means
   the next request already uses it - no restart, no rebuild. The Electron main
   process also persists it and passes it back as env on the next launch. */
export const applyKeys = (values = {}) => {
  if (typeof values.youtubeKey === 'string' && values.youtubeKey.trim()) {
    config.youtubeKey = values.youtubeKey.trim();
  }
  if (typeof values.jamendoId === 'string' && values.jamendoId.trim()) {
    config.jamendoId = values.jamendoId.trim();
  }
  return { youtube: hasYouTube(), jamendo: hasJamendo() };
};

export const hasYouTube = () => Boolean(config.youtubeKey);
export const hasJamendo = () => Boolean(config.jamendoId);

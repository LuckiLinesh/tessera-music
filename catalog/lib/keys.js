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

export const hasYouTube = () => Boolean(config.youtubeKey);
export const hasJamendo = () => Boolean(config.jamendoId);

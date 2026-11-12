/* YouTube: the authorised free listen for songs that have no open audio. Playback
   happens inside YouTube's own embedded player, ads included - nothing is
   downloaded, extracted or proxied. The Data API needs a key; one search costs
   100 of the 10,000 daily quota units, so results are cached for 30 minutes. */

import { fetchJson } from '../http';
import { artistKey, cleanName, songKey } from '../text';
import { config, hasYouTube } from '../keys';

const YT = 'https://www.googleapis.com/youtube/v3';

const NOISE =
  /\b(official|video|lyric|lyrics|audio|visualizer|vevo|hd|hq|4k|remaster|remastered|version|edit|explicit|clean)\b/gi;

const tidy = (value) =>
  cleanName(String(value || '').replace(NOISE, ' ').replace(/\s+/g, ' '));

export const isConfigured = hasYouTube;

const looksOfficial = (channel) =>
  /-\s*topic$/i.test(channel) || /vevo$/i.test(channel.replace(/\s+/g, '')) || /official/i.test(channel);

/**
 * Find an embeddable video for one song. Matching is deliberately strict: a
 * wrong recording is worse than no player, so both sides of the match must agree.
 */
export const findVideo = async (title, artist) => {
  if (!hasYouTube() || !title) return null;
  const query = `${artist || ''} ${title}`.trim();
  const search = await fetchJson(
    `${YT}/search?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=${encodeURIComponent(query)}&key=${encodeURIComponent(config.youtubeKey)}`,
    { timeout: 9000, tries: 1 },
  );
  const ids = (search.items || []).map((item) => item.id?.videoId).filter(Boolean);
  if (!ids.length) return null;

  const details = await fetchJson(
    `${YT}/videos?part=status,contentDetails&id=${ids.join(',')}&key=${encodeURIComponent(config.youtubeKey)}`,
    { timeout: 9000, tries: 1 },
  ).catch(() => ({ items: [] }));
  const allowed = new Set(
    (details.items || [])
      .filter((video) => video.status?.embeddable !== false && video.status?.privacyStatus !== 'private')
      .map((video) => video.id),
  );

  const want = songKey(title);
  const singer = artistKey(artist);
  for (const item of search.items || []) {
    const id = item.id?.videoId;
    if (!id || !allowed.has(id)) continue;
    const videoTitle = tidy(item.snippet?.title);
    const channel = cleanName(item.snippet?.channelTitle);
    const titleOk =
      songKey(videoTitle) === want ||
      songKey(videoTitle).includes(want) ||
      (want.length > 6 && want.includes(songKey(videoTitle)));
    const artistOk =
      !singer ||
      artistKey(channel).includes(singer) ||
      singer.includes(artistKey(channel)) ||
      artistKey(videoTitle).includes(singer);
    if (titleOk && (artistOk || looksOfficial(channel))) {
      return {
        videoId: id,
        channel,
        title: videoTitle,
        thumb:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
        official: looksOfficial(channel),
      };
    }
  }
  return null;
};

export const asPlayback = (video) =>
  video
    ? {
        kind: 'youtube',
        videoId: video.videoId,
        label: video.official ? 'Official YouTube player' : 'YouTube player',
        provider: 'YouTube',
        license: 'Streamed by YouTube with its ads',
        channel: video.channel,
      }
    : null;

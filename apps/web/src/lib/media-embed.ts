/*
 * Soundtrack links that can play inside the app. Given a link to a track or playlist on a service
 * with an embeddable player, this returns the address of that player. Nothing is loaded from the
 * service until the person presses play, so opening an entry tells third parties nothing.
 */

export interface MediaEmbed {
  /** The player's address, for an iframe. */
  src: string;
  /** The player's height in pixels. */
  height: number;
  service: 'YouTube' | 'Spotify' | 'SoundCloud';
}

export function mediaEmbedFor(link: string): MediaEmbed | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const id = /^[\w-]{6,64}$/;

  if (host === 'youtu.be') {
    const video = url.pathname.slice(1);
    return id.test(video) ? youtube(`embed/${video}`) : null;
  }
  if (host === 'youtube.com') {
    const list = url.searchParams.get('list');
    const video = url.searchParams.get('v');
    if (url.pathname === '/watch' && video && id.test(video)) {
      return youtube(`embed/${video}${list && id.test(list) ? `?list=${list}` : ''}`);
    }
    if (url.pathname === '/playlist' && list && id.test(list)) {
      return youtube(`embed/videoseries?list=${list}`);
    }
    return null;
  }
  if (host === 'open.spotify.com') {
    // Addresses may carry a locale first, such as /intl-de/track/…
    const parts = url.pathname.split('/').filter((part) => part && !part.startsWith('intl-'));
    const [kind, item] = parts;
    if (
      kind &&
      item &&
      ['track', 'album', 'playlist', 'episode', 'show'].includes(kind) &&
      id.test(item)
    ) {
      return {
        src: `https://open.spotify.com/embed/${kind}/${item}`,
        height: kind === 'track' || kind === 'episode' ? 152 : 352,
        service: 'Spotify',
      };
    }
    return null;
  }
  if (host === 'soundcloud.com' && url.pathname.split('/').filter(Boolean).length >= 2) {
    const target = encodeURIComponent(`https://soundcloud.com${url.pathname}`);
    return {
      src: `https://w.soundcloud.com/player/?url=${target}&auto_play=true`,
      height: 166,
      service: 'SoundCloud',
    };
  }
  return null;
}

function youtube(path: string): MediaEmbed {
  const joiner = path.includes('?') ? '&' : '?';
  // The no-cookie host sets nothing until the video is played.
  return {
    src: `https://www.youtube-nocookie.com/${path}${joiner}autoplay=1`,
    height: 200,
    service: 'YouTube',
  };
}

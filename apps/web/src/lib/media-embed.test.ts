import { describe, expect, it } from 'vitest';
import { mediaEmbedFor } from './media-embed';

describe('soundtrack links that can play in the app', () => {
  it('turns YouTube videos and playlists into the no-cookie player', () => {
    expect(mediaEmbedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    );
    expect(mediaEmbedFor('https://youtu.be/dQw4w9WgXcQ?t=10')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    );
    expect(
      mediaEmbedFor('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890ab')?.src,
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?list=PL1234567890ab&autoplay=1');
    expect(mediaEmbedFor('https://www.youtube.com/playlist?list=PL1234567890ab')?.src).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PL1234567890ab&autoplay=1',
    );
  });

  it('turns Spotify tracks, albums and playlists into their players', () => {
    expect(mediaEmbedFor('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')).toEqual({
      src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      height: 152,
      service: 'Spotify',
    });
    expect(
      mediaEmbedFor('https://open.spotify.com/intl-de/playlist/37i9dQZF1DX4sWSpwq3LiO')?.src,
    ).toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO');
  });

  it('wraps a SoundCloud track in its player', () => {
    expect(mediaEmbedFor('https://soundcloud.com/some-artist/some-track')?.src).toBe(
      'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fsome-artist%2Fsome-track&auto_play=true',
    );
  });

  it('leaves everything else as a plain link', () => {
    for (const link of [
      '',
      'not a link',
      'https://tabletopaudio.com/',
      'https://www.youtube.com/@somechannel',
      'https://www.youtube.com/watch?v="><script>',
      'https://open.spotify.com/user/someone',
      'javascript:alert(1)',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(mediaEmbedFor(link), link).toBeNull();
    }
  });
});

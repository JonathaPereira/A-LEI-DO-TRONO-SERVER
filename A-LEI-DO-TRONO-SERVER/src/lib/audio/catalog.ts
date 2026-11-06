/** Existing CC0 sources and the local fallback tracks distributed with the application. */
export const musicTracks = {
  lofi: {
    label: 'Lo-fi',
    title: 'Lofi again',
    artist: 'omfgdude',
    license: 'CC0',
    src: 'https://opengameart.org/sites/default/files/lofiagain.ogg',
    fallback: 'assets/audio/classical_piano_nocturne.mp3',
  },
  edm: {
    label: 'EDM',
    title: 'Joyfully',
    artist: 'MintoDog',
    license: 'CC0',
    src: 'https://opengameart.org/sites/default/files/joyfully_loop_bpm170.mp3',
    fallback: 'assets/audio/electronic_summer_nights.mp3',
  },
  rock: {
    label: 'Rock',
    title: 'Codename Granny II',
    artist: 'Kistol',
    license: 'CC0',
    src: 'https://opengameart.org/sites/default/files/Codename%20Granny%20II_0.ogg',
    fallback: 'assets/audio/rock_guitar_solo.mp3',
  },
  electronic: {
    label: 'Eletrônica',
    title: 'Claimed by the Void',
    artist: 'vitalezzz',
    license: 'CC0',
    src: 'https://opengameart.org/sites/default/files/claimed_by_the_void_loop.mp3',
    fallback: 'assets/audio/electronic_summer_nights.mp3',
  },
} as const;
export type MusicTrack = keyof typeof musicTracks;
export const isMusicTrack = (id: string): id is MusicTrack => Object.hasOwn(musicTracks, id);

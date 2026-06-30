'use strict';

const playlist = {
  '8f2c91a4b6d0e3f5': {
    song: 'Hileli',
    artist: 'Manifest',
    youtube: 'kXKhNI4DLHM',
    bg: 'linear-gradient(135deg, #1B263B 0%, #0D1B2A 100%)',
  },
  'a7b4e2d9c1f850b6': {
    song: 'Saki',
    artist: 'Sıla',
    youtube: 'y035E2kzLYM',
    bg: 'linear-gradient(135deg, #27384d 0%, #111927 100%)',
  },
  '3c6e9a1f5b8d2e4b': {
    song: 'Ölüyorum',
    artist: 'Hayko Çepkin',
    youtube: 'Coh96WC6Mc4',
    bg: 'linear-gradient(135deg, #223246 0%, #0d1622 100%)',
  },
  'd5f0e8b2a4c793f1': {
    song: 'Satmışım Anasını',
    artist: 'Ferdi Özbeğen',
    youtube: 'cqkQWu1CZl0',
    bg: 'linear-gradient(135deg, #314761 0%, #152132 100%)',
  },
  '61b9d4e3f5a2c8e7': {
    song: 'Sultan Süleyman',
    artist: 'Sezen Aksu',
    youtube: '89PepdEhKCM',
    bg: 'linear-gradient(135deg, #3a5471 0%, #172131 100%)',
  },
};

const DEFAULT_ID = '8f2c91a4b6d0e3f5';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { playlist, DEFAULT_ID };
}

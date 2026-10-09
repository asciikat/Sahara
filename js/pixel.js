/*
 * Sahara pixel art. Every picture is a grid of strings where X is a filled
 * pixel, drawn as SVG squares so it stays sharp at any size.
 * Pure string builders (no DOM), so the bitmaps can be checked from Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaharaPixel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HEART = [
    '.XX...XX.',
    'XXXX.XXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];

  const ICONS = {
    heart: HEART,
    star: [
      '....X....',
      '....X....',
      '...XXX...',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
      '..XXXXX..',
      '.XXX.XXX.',
      '.XX...XX.',
    ],
    trophy: [
      '.XXXXXXX.',
      'XXXXXXXXX',
      'X.XXXXX.X',
      'X.XXXXX.X',
      '.XXXXXXX.',
      '..XXXXX..',
      '...XXX...',
      '...XXX...',
      '..XXXXX..',
    ],
    flame: [
      '...X....',
      '...XX...',
      '..XXX...',
      '..XXXX..',
      '.XXXXXX.',
      '.XXXXXX.',
      'XXXXXXXX',
      'XXXXXXXX',
      '.XXXXXX.',
    ],
    moon: [
      '..XXXX..',
      '.XXX....',
      'XXX.....',
      'XXX.....',
      'XXX.....',
      'XXXX....',
      '.XXXXXX.',
      '..XXXX..',
    ],
    drop: [
      '...X...',
      '...X...',
      '..XXX..',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
    ],
    case: [
      '...XXX...',
      '...X.X...',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXX.XXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
    ],
    people: [
      '.XX.......',
      '.XX.......',
      'XXXX......',
      'XXXX...XX.',
      '.XX....XX.',
      '.XX...XXXX',
      '.XX...XXXX',
      '.XX....XX.',
    ],
    gift: [
      '..XX.XX..',
      '.X.XXX.X.',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXX.XXXX',
      'XXXX.XXXX',
      'XXXX.XXXX',
      'XXXXXXXXX',
    ],
    lock: [
      '..XXX..',
      '.X...X.',
      '.X...X.',
      'XXXXXXX',
      'XXXXXXX',
      'XXX.XXX',
      'XXXXXXX',
      'XXXXXXX',
    ],
    sparkle: [
      '...X...',
      '...X...',
      '..XXX..',
      'XXXXXXX',
      '..XXX..',
      '...X...',
      '...X...',
    ],
    check: [
      '.......XX',
      '......XXX',
      '.....XXX.',
      'X...XXX..',
      'XX.XXX...',
      'XXXXX....',
      '.XXX.....',
      '..X......',
    ],
    apple: [
      '.....XX..',
      '....XX...',
      '.XXX.XXX.',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XX.XX..',
    ],
    speakerOn: [
      '..X......',
      '.XX...X..',
      'XXX....X.',
      'XXX..X..X',
      'XXX..X..X',
      'XXX....X.',
      '.XX...X..',
      '..X......',
    ],
    speakerOff: [
      '..X......',
      '.XX......',
      'XXX..X.X.',
      'XXX...X..',
      'XXX...X..',
      'XXX..X.X.',
      '.XX......',
      '..X......',
    ],
  };

  // The big mascot heart.
  const HERO = [
    '..XXX...XXX..',
    '.XXXXX.XXXXX.',
    'XXXXXXXXXXXXX',
    'XXXXXXXXXXXXX',
    'XXXXXXXXXXXXX',
    'XXXXXXXXXXXXX',
    '.XXXXXXXXXXX.',
    '..XXXXXXXXX..',
    '...XXXXXXX...',
    '....XXXXX....',
    '.....XXX.....',
    '......X......',
  ];
  const HERO_SHINE = [[2, 2], [3, 2], [2, 3]];
  const HERO_BLUSH = [[1, 6], [2, 6], [10, 6], [11, 6]];
  const HAPPY_EYES = [[3, 4], [2, 5], [4, 5], [9, 4], [8, 5], [10, 5]];
  const HERO_FACES = {
    sleepy: { eyes: [[2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5]], mouth: [[6, 8]], blush: false },
    ok: { eyes: [[3, 4], [3, 5], [9, 4], [9, 5]], mouth: [[5, 8], [6, 8], [7, 8]], blush: true },
    happy: { eyes: HAPPY_EYES, mouth: [[4, 7], [8, 7], [5, 8], [6, 8], [7, 8]], blush: true },
    sparkle: { eyes: HAPPY_EYES, mouth: [[4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [5, 8], [6, 8], [7, 8]], blush: true },
  };

  const rowsPath = (rows) => rows
    .flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'X' ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join('');
  const cellsPath = (cells, ox = 0, oy = 0) => cells.map(([x, y]) => `M${x + ox} ${y + oy}h1v1h-1z`).join('');

  const svg = (w, h, cls, inner, label) => (
    `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${inner}</svg>`
  );

  const HEART_PATH = rowsPath(HEART);

  const heart = (on = true) => svg(9, 8, `pixel-heart${on ? '' : ' off'}`, `<path d="${HEART_PATH}"/>`);

  const icon = (name, cls = '') => {
    const rows = ICONS[name];
    if (!rows) return '';
    return svg(rows[0].length, rows.length, `pixel-icon ${cls}`.trim(), `<path fill="currentColor" d="${rowsPath(rows)}"/>`);
  };

  // The mascot: fill, a dark outline, a shaded rim, a shine, then the face.
  function hero(mood = 'ok') {
    const face = HERO_FACES[mood] || HERO_FACES.ok;
    const H = HERO.length;
    const W = HERO[0].length;
    const solid = (x, y) => y >= 0 && y < H && x >= 0 && x < W && HERO[y][x] === 'X';

    const outline = [];
    const shade = [];
    for (let y = -1; y <= H; y++) {
      for (let x = -1; x <= W; x++) {
        const touches = solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1);
        if (!solid(x, y) && touches) outline.push([x, y]);
        if (solid(x, y) && (!solid(x + 1, y) || !solid(x, y + 1))) shade.push([x, y]);
      }
    }

    const pad = 1;
    const parts = [
      `<path class="hero-ink" d="${cellsPath(outline, pad, pad)}"/>`,
      `<path class="hero-fill" d="${rowsPath(HERO).replace(/M(\d+) (\d+)/g, (_, x, y) => `M${Number(x) + pad} ${Number(y) + pad}`)}"/>`,
      `<path class="hero-shade" d="${cellsPath(shade, pad, pad)}"/>`,
      `<path class="hero-shine" d="${cellsPath(HERO_SHINE, pad, pad)}"/>`,
      face.blush ? `<path class="hero-blush" d="${cellsPath(HERO_BLUSH, pad, pad)}"/>` : '',
      `<path class="hero-face" d="${cellsPath(face.eyes.concat(face.mouth), pad, pad)}"/>`,
    ];
    return svg(W + 2 * pad, H + 2 * pad, `hero-heart mood-${mood}`, parts.join(''), `Sahara heart, feeling ${mood}`);
  }

  const faviconUri = () => `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 8" shape-rendering="crispEdges"><path fill="#ff4d8d" d="${HEART_PATH}"/></svg>`
  )}`;

  return { ICONS, HERO, HERO_FACES, heart, icon, hero, faviconUri };
});

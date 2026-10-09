const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pixel.js');

test('every bitmap is a clean rectangle of . and X', () => {
  const sets = { ...P.ICONS, hero: P.HERO };
  for (const [name, rows] of Object.entries(sets)) {
    assert.ok(rows.length > 0, `${name} has rows`);
    rows.forEach((row, y) => {
      assert.equal(row.length, rows[0].length, `${name} row ${y} is ${row.length} wide, expected ${rows[0].length}`);
      assert.match(row, /^[.X]+$/, `${name} row ${y} only uses . and X`);
    });
  }
});

test('the mascot heart is left-right symmetrical', () => {
  P.HERO.forEach((row, y) => {
    assert.equal(row, [...row].reverse().join(''), `hero row ${y}`);
  });
});

test('every mascot face fits inside the heart', () => {
  for (const [mood, face] of Object.entries(P.HERO_FACES)) {
    [...face.eyes, ...face.mouth].forEach(([x, y]) => {
      assert.equal(P.HERO[y] && P.HERO[y][x], 'X', `${mood} pixel ${x},${y} is on the heart`);
    });
  }
});

test('builders return svg strings', () => {
  assert.match(P.heart(true), /^<svg class="pixel-heart"/);
  assert.match(P.heart(false), /pixel-heart off/);
  assert.match(P.icon('moon', 'big'), /pixel-icon big/);
  assert.equal(P.icon('does-not-exist'), '');
  assert.match(P.hero('happy'), /aria-label="Sahara heart, feeling happy"/);
  assert.match(P.hero('nonsense'), /mood-nonsense/, 'unknown moods fall back to the ok face');
  assert.match(P.faviconUri(), /^data:image\/svg\+xml,/);
});

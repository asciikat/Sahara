const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

// 2026-10-07 is a Wednesday, so its week runs Mon 2026-10-05 to Sun 2026-10-11.
const WED = '2026-10-07';

const mission = (state, over = {}) => {
  const m = {
    id: C.uid(), title: 'Test', who: 'Me', type: 'Home', pts: 2,
    due: '', repeat: '', done: false, doneOn: '', doneAt: '', ...over,
  };
  state.missions.push(m);
  return m;
};

test('weeks start on Monday and dates roll over months', () => {
  assert.equal(C.weekStart(WED), '2026-10-05');
  assert.equal(C.weekStart('2026-10-11'), '2026-10-05'); // Sunday belongs to the same week
  assert.equal(C.weekStart('2026-10-12'), '2026-10-12');
  assert.equal(C.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(C.addDays('2026-01-01', -1), '2025-12-31');
  assert.ok(C.inWeek('2026-10-11', '2026-10-05'));
  assert.ok(!C.inWeek('2026-10-12', '2026-10-05'));
  assert.ok(!C.inWeek('', '2026-10-05'));
});

test('sleep hours handle going to bed before and after midnight', () => {
  assert.equal(C.sleepHours('23:30', '07:00'), 7.5);
  assert.equal(C.sleepHours('01:00', '08:30'), 7.5);
  assert.equal(C.sleepHours('22:00', '22:00'), 0);
});

test('normalizeState repairs garbage instead of trusting it', () => {
  const s = C.normalizeState({
    missions: [
      { title: '  ok  ', who: 'Nobody', type: 'x', pts: 99, due: 'not-a-date', repeat: 'daily', done: true },
      { title: '' },
      null,
      'string',
      { id: 'dup', title: 'a' },
      { id: 'dup', title: 'b' },
    ],
    sleep: [
      { date: WED, bed: '23:00', wake: '07:00', rest: 9 },
      { date: WED, bed: '22:00', wake: '06:00', rest: 2 },
      { date: 'nope', bed: '23:00', wake: '07:00' },
      { date: WED, bed: '25:99', wake: '07:00' },
    ],
    meals: [{ date: WED, time: '08:00', type: 'Brunch', what: 'x'.repeat(500) }],
    water: { [WED]: 500, bad: 3, '2026-10-06': -4 },
    shifts: [{ date: WED, hours: 99 }, { date: WED, hours: 0 }, { date: WED, hours: 'abc' }],
    settings: { missionGoal: -5, sleepGoal: 'x', theme: 'neon', sound: 'yes' },
    badges: { first: WED, nonsense: WED },
  });

  assert.deepEqual(s.missions.map((m) => m.title), ['ok', 'a'], 'blank, non-object and duplicate-id rows are dropped');
  assert.deepEqual(
    { title: s.missions[0].title, who: s.missions[0].who, type: s.missions[0].type, pts: s.missions[0].pts, due: s.missions[0].due, done: s.missions[0].done },
    { title: 'ok', who: 'Me', type: 'Home', pts: 3, due: '', done: false },
    'repeating missions never stay permanently done and have no due date'
  );
  assert.equal(new Set(s.missions.map((m) => m.id)).size, s.missions.length, 'ids are unique');
  assert.equal(s.sleep.length, 1, 'one night per morning');
  assert.equal(s.sleep[0].rest, 2, 'the later entry wins');
  assert.equal(s.meals[0].type, 'Snack');
  assert.equal(s.meals[0].what.length, 160);
  assert.deepEqual(s.water, { [WED]: 30 });
  assert.deepEqual(s.shifts.map((x) => x.hours), [24]);
  assert.equal(s.settings.missionGoal, 1);
  assert.equal(s.settings.sleepGoal, 7);
  assert.equal(s.settings.theme, 'dark', 'unknown themes fall back to Night');
  assert.equal(s.settings.sound, false);
  assert.deepEqual(s.badges, { first: WED });
});

test('ids from an imported file cannot carry markup into the page', () => {
  const s = C.normalizeState({
    missions: [{ id: '"><img src=x onerror=alert(1)>', title: 'bad id' }],
    meals: [{ id: "x' onclick='boom", date: WED, time: '08:00', type: 'Lunch', what: 'ok' }],
  });
  assert.match(s.missions[0].id, /^[\w-]+$/);
  assert.match(s.meals[0].id, /^[\w-]+$/);
});

test('normalizeState copes with non-objects', () => {
  for (const bad of [null, undefined, 42, 'x', [], true]) {
    const s = C.normalizeState(bad);
    assert.deepEqual(s.missions, []);
    assert.equal(s.settings.jobTarget, 37.5);
  }
});

test('v1 data is upgraded: done missions become points, jobTarget moves to settings', () => {
  const v1 = {
    missions: [
      { id: 'a', title: 'Done one', who: 'Me', type: 'Job', pts: 3, due: '', done: true, doneOn: WED, doneAt: '2026-10-07T09:00:00.000Z' },
      { id: 'b', title: 'Open one', who: 'Kids', type: 'Home', pts: 1, due: '', done: false, doneOn: '', doneAt: '' },
    ],
    redeemed: [{ id: 'r', title: 'Coffee', cost: 1, at: '' }],
    jobTarget: 20,
  };
  const s = C.normalizeState(v1);
  assert.equal(s.completions.length, 1);
  assert.equal(C.earnedPoints(s), 3);
  assert.equal(C.balance(s), 2);
  assert.equal(s.settings.jobTarget, 20);
});

test('one-off missions: complete, undo, and points', () => {
  const s = C.freshState();
  const m = mission(s, { pts: 3 });
  assert.ok(C.completeMission(s, m.id, WED, 'now'));
  assert.equal(C.completeMission(s, m.id, WED, 'now'), null, 'cannot complete twice');
  assert.equal(C.earnedPoints(s), 3);
  assert.ok(C.isDone(m, '2026-10-20'), 'one-off stays done on later days');
  assert.ok(C.uncompleteMission(s, m.id, WED));
  assert.equal(C.earnedPoints(s), 0);
  assert.equal(m.done, false);
  assert.equal(m.doneOn, '');
});

test('deleting a finished mission keeps the points it earned', () => {
  const s = C.freshState();
  const m = mission(s, { pts: 2 });
  C.completeMission(s, m.id, WED, 'now');
  s.missions = s.missions.filter((x) => x.id !== m.id);
  assert.equal(C.earnedPoints(s), 2);
});

test('daily missions come back every day and score every time', () => {
  const s = C.freshState();
  const m = mission(s, { repeat: 'daily', pts: 1 });
  C.completeMission(s, m.id, WED, 'a');
  assert.ok(C.isDone(m, WED));
  assert.ok(!C.isDone(m, C.addDays(WED, 1)), 'open again tomorrow');
  C.completeMission(s, m.id, C.addDays(WED, 1), 'b');
  assert.equal(C.earnedPoints(s), 2);
  // undoing today's does not touch yesterday's
  assert.ok(C.uncompleteMission(s, m.id, C.addDays(WED, 1)));
  assert.equal(C.earnedPoints(s), 1);
  assert.equal(m.doneOn, WED);
});

test('weekly missions are done for the whole week and reset on Monday', () => {
  const s = C.freshState();
  const m = mission(s, { repeat: 'weekly' });
  C.completeMission(s, m.id, WED, 'a');
  assert.ok(C.isDone(m, '2026-10-11'), 'still done on Sunday');
  assert.ok(!C.isDone(m, '2026-10-12'), 'open again next Monday');
  assert.ok(C.uncompleteMission(s, m.id, '2026-10-09'), 'can undo from later in the same week');
  assert.ok(!C.isDone(m, WED));
});

test('sortMissions: open before done, soonest due first, overdue flagged', () => {
  const s = C.freshState();
  const later = mission(s, { title: 'later', due: '2026-10-20' });
  const soon = mission(s, { title: 'soon', due: '2026-10-08' });
  const none = mission(s, { title: 'none' });
  const daily = mission(s, { title: 'daily', repeat: 'daily' });
  const done = mission(s, { title: 'done' });
  C.completeMission(s, done.id, WED, 'now');
  assert.deepEqual(C.sortMissions(s.missions, WED).map((m) => m.title), ['soon', 'later', 'daily', 'none', 'done']);
  assert.ok(C.isOverdue(soon, '2026-10-09'));
  assert.ok(!C.isOverdue(soon, WED));
  assert.ok(!C.isOverdue(daily, '2030-01-01'));
  assert.ok(!C.isOverdue(later, WED) && !C.isOverdue(none, WED));
});

test('levels grow slower as you go', () => {
  assert.equal(C.levelInfo(0).level, 1);
  assert.equal(C.levelInfo(9).level, 1);
  assert.equal(C.levelInfo(10).level, 2);
  assert.equal(C.levelInfo(30).level, 3);
  assert.equal(C.levelInfo(60).level, 4);
  const mid = C.levelInfo(20);
  assert.equal(mid.level, 2);
  assert.equal(mid.into, 10);
  assert.equal(mid.span, 20);
  assert.equal(mid.pct, 0.5);
  assert.equal(C.levelInfo(10_000).title, 'Sahara Star');
});

test('streaks: today may be empty, gaps break them, best streak remembers', () => {
  const s = C.freshState();
  const log = (date) => s.meals.push({ id: C.uid(), date, time: '08:00', type: 'Breakfast', what: 'x' });
  assert.equal(C.currentStreak(s, WED), 0);

  log('2026-10-05'); log('2026-10-06');
  assert.equal(C.currentStreak(s, WED), 2, 'yesterday and the day before still count while today is empty');
  log(WED);
  assert.equal(C.currentStreak(s, WED), 3);
  assert.equal(C.currentStreak(s, '2026-10-09'), 0, 'two empty days break it');

  log('2026-09-01'); log('2026-09-02'); log('2026-09-03'); log('2026-09-04');
  assert.equal(C.bestStreak(s, WED), 4);
});

test('good-job hearts and mood', () => {
  const s = C.freshState();
  assert.equal(C.heartsOn(s, WED), 0);
  assert.equal(C.moodFor(0), 'sleepy');
  assert.equal(C.moodFor(2), 'ok');
  assert.equal(C.moodFor(4), 'happy');
  assert.equal(C.moodFor(5), 'sparkle');

  // sleep heart needs the goal, not just a log
  s.sleep.push({ id: 'n', date: WED, bed: '01:00', wake: '06:00', rest: 3 });
  assert.equal(C.heartsOn(s, WED), 0, '5 h is below the 7 h goal');
  s.sleep[0].bed = '23:00';
  assert.equal(C.heartsOn(s, WED), 1);

  // food + water
  for (let i = 0; i < 3; i++) s.meals.push({ id: `m${i}`, date: WED, time: '12:00', type: 'Lunch', what: 'x' });
  s.water[WED] = 8;
  assert.equal(C.heartsOn(s, WED), 3);

  // missions heart wants the daily goal
  const ms = [1, 2, 3].map(() => mission(s));
  ms.slice(0, 2).forEach((m) => C.completeMission(s, m.id, WED, 'now'));
  assert.equal(C.heartsOn(s, WED), 3);
  C.completeMission(s, ms[2].id, WED, 'now');
  assert.equal(C.heartsOn(s, WED), 4);

  // showing up: a handoff note, a shift or a kids/co-parent mission
  s.handoffs.push({ id: 'h', date: WED, time: '10:00', text: 'hi' });
  assert.equal(C.heartsOn(s, WED), 5);
});

test('the "showed up" heart accepts kids and co-parent missions and shifts', () => {
  const s = C.freshState();
  const kid = mission(s, { who: 'Kids' });
  C.completeMission(s, kid.id, WED, 'now');
  assert.equal(C.heartChecks(s, WED).find((c) => c.key === 'showup').ok, true);

  const t = C.freshState();
  t.shifts.push({ id: 's', date: WED, hours: 4, note: '' });
  assert.equal(C.heartChecks(t, WED).find((c) => c.key === 'showup').ok, true);

  const u = C.freshState();
  const mine = mission(u, { who: 'Me' });
  C.completeMission(u, mine.id, WED, 'now');
  assert.equal(C.heartChecks(u, WED).find((c) => c.key === 'showup').ok, false);
});

test('settings change what counts', () => {
  const s = C.freshState();
  s.settings.missionGoal = 1;
  const m = mission(s);
  C.completeMission(s, m.id, WED, 'now');
  assert.equal(C.heartChecks(s, WED).find((c) => c.key === 'missions').ok, true);
});

test('nudge picks the most useful next step', () => {
  const at = (h) => new Date(2026, 9, 7, h, 0); // Wed 7 Oct 2026
  const s = C.freshState();
  assert.equal(C.nudge(s, at(8)).tab, 'sleep', 'morning with no sleep logged');

  s.sleep.push({ id: 'n', date: WED, bed: '23:00', wake: '07:00', rest: 3 });
  assert.equal(C.nudge(s, at(11)).tab, 'food', 'no food by 11');

  s.meals.push({ id: 'm', date: WED, time: '08:00', type: 'Breakfast', what: 'toast' });
  mission(s, { due: '2026-10-01' });
  const overdue = C.nudge(s, at(11));
  assert.equal(overdue.tab, 'missions');
  assert.match(overdue.text, /1 mission overdue/);
});

test('badges unlock once and not again', () => {
  const s = C.freshState();
  assert.deepEqual(C.evaluateBadges(s, WED), []);
  const m = mission(s);
  C.completeMission(s, m.id, WED, 'now');
  assert.deepEqual(C.evaluateBadges(s, WED).map((b) => b.id), ['first']);
  assert.equal(s.badges.first, WED);
  assert.deepEqual(C.evaluateBadges(s, WED), [], 'already unlocked');

  s.redeemed.push({ id: 'r', title: 'x', cost: 1, at: '' });
  assert.deepEqual(C.evaluateBadges(s, WED).map((b) => b.id), ['treat']);
});

test('work-week badge needs the weekly target in a single week', () => {
  const s = C.freshState();
  s.settings.jobTarget = 10;
  s.shifts.push({ id: 'a', date: '2026-10-04', hours: 6, note: '' }); // Sunday of the week before
  s.shifts.push({ id: 'b', date: '2026-10-05', hours: 6, note: '' });
  assert.ok(!C.evaluateBadges(s, WED).some((b) => b.id === 'work'));
  s.shifts.push({ id: 'c', date: '2026-10-06', hours: 4, note: '' });
  assert.ok(C.evaluateBadges(s, WED).some((b) => b.id === 'work'));
});

test('the weekly report covers hearts, work, sleep, waiting items and notes', () => {
  const s = C.freshState();
  s.sleep.push({ id: 'n', date: WED, bed: '23:30', wake: '07:00', rest: 4 });
  s.shifts.push({ id: 's', date: WED, hours: 4.5, note: '' });
  s.handoffs.push({ id: 'h', date: WED, time: '10:00', text: 'PE kit by Friday' });
  const waiting = mission(s, { title: 'Sign school form', who: 'Co-parent' });
  const done = mission(s, { pts: 3 });
  C.completeMission(s, done.id, WED, 'now');

  const text = C.buildReport(s, WED);
  assert.match(text, /Sahara weekly report/);
  assert.match(text, /Missions done: 1 \(3 points\)/);
  assert.match(text, /Sleep: 7\.5 h average over 1 night/);
  assert.match(text, /Work hours: 4\.5 of 37\.5 h/);
  assert.match(text, /Waiting on co-parent:\n- Sign school form/);
  assert.match(text, /Handoff notes:\n- PE kit by Friday/);

  C.completeMission(s, waiting.id, WED, 'now');
  assert.doesNotMatch(C.buildReport(s, WED), /Waiting on co-parent/);
});

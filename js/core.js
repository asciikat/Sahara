/*
 * Sahara core: state shape, validation and every rule of the app.
 * No DOM in here, so it runs in the browser (window.SaharaCore) and in
 * Node (require) for the unit tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SaharaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WHO = ['Me', 'Co-parent', 'Kids'];
  const TYPES = ['Job', 'Home', 'Self'];
  const REPEATS = ['', 'daily', 'weekly'];
  const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const THEMES = ['auto', 'light', 'dark'];
  const HEART_COUNT = 5;
  const MAX_ROWS = 5000;
  const STATE_VERSION = 2;

  const DEFAULT_SETTINGS = Object.freeze({
    missionGoal: 3, // missions a day for the Missions heart
    mealGoal: 3,    // meals a day for the Food heart
    waterGoal: 8,   // glasses a day for the Water heart
    sleepGoal: 7,   // hours a night for the Sleep heart
    jobTarget: 37.5, // hours a week at work
    sound: false,
    theme: 'auto',
  });

  // ---------- small helpers ----------

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseYmd(s)) === s;
  const isHm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const weekStart = (s) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }; // Monday
  const inWeek = (s, start) => isYmd(s) && s >= start && s <= addDays(start, 6);
  const fmtDay = (s) => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const sum = (list, pick) => list.reduce((total, x) => total + pick(x), 0);
  const sortedDesc = (list, key) => [...list].sort((a, b) => key(b).localeCompare(key(a)));

  const toNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const clampNum = (v, min, max, fallback) => {
    const n = toNum(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const clampInt = (v, min, max, fallback) => {
    const n = clampNum(v, min, max, NaN);
    return Number.isNaN(n) ? fallback : Math.round(n);
  };

  const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Hours between bed and wake. Waking "earlier" than bed means after midnight.
  const sleepHours = (bed, wake) => {
    const diff = toMinutes(wake) - toMinutes(bed);
    if (diff === 0) return 0;
    return (diff < 0 ? diff + 24 * 60 : diff) / 60;
  };

  // ---------- state ----------

  const freshState = () => ({
    version: STATE_VERSION,
    missions: [],
    completions: [], // every time a mission was completed. Points come from here.
    rewards: [],
    redeemed: [],
    sleep: [],
    meals: [],
    water: {},
    shifts: [],
    handoffs: [],
    badges: {}, // badge id -> date unlocked
    settings: { ...DEFAULT_SETTINGS },
  });

  /**
   * Turn anything (saved data, an imported file, garbage) into a valid state.
   * Bad rows are dropped and values are clamped, so the UI can trust the shape.
   * Also upgrades v1 data, which had no completion log.
   */
  function normalizeState(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const s = freshState();
    const rows = (x) => (Array.isArray(x) ? x.slice(0, MAX_ROWS).filter((o) => o && typeof o === 'object') : []);
    const str = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
    const oneOf = (x, list, fallback) => (list.includes(x) ? x : fallback);
    // ids end up inside HTML attributes, so only plain characters are allowed
    const idOf = (x) => (typeof x === 'string' && /^[\w-]{1,40}$/.test(x) ? x : uid());
    const dateOr = (x, fallback = '') => (isYmd(x) ? x : fallback);
    const unique = (list) => {
      const seen = new Set();
      return list.filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
    };
    const build = (list, fn) => unique(rows(list).map(fn).filter(Boolean));

    const rs = r.settings && typeof r.settings === 'object' ? r.settings : {};
    s.settings = {
      missionGoal: clampInt(rs.missionGoal, 1, 20, DEFAULT_SETTINGS.missionGoal),
      mealGoal: clampInt(rs.mealGoal, 1, 8, DEFAULT_SETTINGS.mealGoal),
      waterGoal: clampInt(rs.waterGoal, 1, 20, DEFAULT_SETTINGS.waterGoal),
      sleepGoal: clampNum(rs.sleepGoal, 4, 12, DEFAULT_SETTINGS.sleepGoal),
      jobTarget: clampNum(rs.jobTarget !== undefined ? rs.jobTarget : r.jobTarget, 1, 80, DEFAULT_SETTINGS.jobTarget),
      sound: rs.sound === true,
      theme: oneOf(rs.theme, THEMES, 'auto'),
    };

    s.missions = build(r.missions, (m) => {
      const title = str(m.title, 120);
      if (!title) return null;
      const repeat = oneOf(m.repeat, REPEATS, '');
      return {
        id: idOf(m.id),
        title,
        who: oneOf(m.who, WHO, 'Me'),
        type: oneOf(m.type, TYPES, 'Home'),
        pts: clampInt(m.pts, 1, 3, 2),
        due: repeat ? '' : dateOr(m.due),
        repeat,
        done: !repeat && m.done === true,
        doneOn: dateOr(m.doneOn),
        doneAt: str(m.doneAt, 40),
      };
    });

    if (Array.isArray(r.completions)) {
      s.completions = build(r.completions, (c) => {
        if (!isYmd(c.date)) return null;
        return {
          id: idOf(c.id),
          mid: str(c.mid, 40),
          title: str(c.title, 120) || 'Mission',
          date: c.date,
          pts: clampInt(c.pts, 1, 3, 1),
          who: oneOf(c.who, WHO, 'Me'),
          type: oneOf(c.type, TYPES, 'Home'),
          at: str(c.at, 40),
        };
      });
    } else {
      // v1 upgrade: missions marked done become completion log entries
      s.completions = s.missions
        .filter((m) => m.done && m.doneOn)
        .map((m) => ({ id: uid(), mid: m.id, title: m.title, date: m.doneOn, pts: m.pts, who: m.who, type: m.type, at: m.doneAt }));
    }

    s.rewards = build(r.rewards, (x) => {
      const title = str(x.title, 80);
      return title ? { id: idOf(x.id), title, cost: clampInt(x.cost, 1, 999, 10) } : null;
    });

    s.redeemed = build(r.redeemed, (x) => ({
      id: idOf(x.id),
      title: str(x.title, 80) || 'Reward',
      cost: clampInt(x.cost, 0, 999, 0),
      at: str(x.at, 40),
    }));

    const nights = build(r.sleep, (x) => {
      if (!isYmd(x.date) || !isHm(x.bed) || !isHm(x.wake)) return null;
      return { id: idOf(x.id), date: x.date, bed: x.bed, wake: x.wake, rest: clampInt(x.rest, 1, 5, 3) };
    });
    // one night per morning: a later entry replaces an earlier one
    s.sleep = [...new Map(nights.map((n) => [n.date, n])).values()];

    s.meals = build(r.meals, (x) => {
      const what = str(x.what, 160);
      if (!what || !isYmd(x.date) || !isHm(x.time)) return null;
      return { id: idOf(x.id), date: x.date, time: x.time, type: oneOf(x.type, MEAL_TYPES, 'Snack'), what };
    });

    if (r.water && typeof r.water === 'object' && !Array.isArray(r.water)) {
      Object.entries(r.water).slice(0, MAX_ROWS).forEach(([date, n]) => {
        const glasses = clampInt(n, 0, 30, 0);
        if (isYmd(date) && glasses > 0) s.water[date] = glasses;
      });
    }

    s.shifts = build(r.shifts, (x) => {
      const hours = clampNum(x.hours, 0, 24, 0);
      if (!isYmd(x.date) || hours <= 0) return null;
      return { id: idOf(x.id), date: x.date, hours: Math.round(hours * 100) / 100, note: str(x.note, 120) };
    });

    s.handoffs = build(r.handoffs, (x) => {
      const text = str(x.text, 500);
      if (!text || !isYmd(x.date)) return null;
      return { id: idOf(x.id), date: x.date, time: isHm(x.time) ? x.time : '00:00', text };
    });

    if (r.badges && typeof r.badges === 'object' && !Array.isArray(r.badges)) {
      Object.entries(r.badges).slice(0, 100).forEach(([id, date]) => {
        if (BADGES.some((b) => b.id === id) && isYmd(date)) s.badges[id] = date;
      });
    }

    return s;
  }

  // ---------- missions ----------

  // One-off missions stay done. Daily ones reset each day, weekly ones each Monday.
  function isDone(m, date) {
    if (m.repeat === 'daily') return m.doneOn === date;
    if (m.repeat === 'weekly') return inWeek(m.doneOn, weekStart(date));
    return m.done;
  }

  function isOverdue(m, date) {
    return !m.repeat && !m.done && m.due !== '' && m.due < date;
  }

  function sortMissions(list, date) {
    const rank = (m) => (m.repeat ? '9999-12-30' : m.due || '9999-12-31');
    return [...list].sort((a, b) => {
      const doneA = isDone(a, date);
      const doneB = isDone(b, date);
      if (doneA !== doneB) return doneA ? 1 : -1;
      if (doneA) return (b.doneAt || '').localeCompare(a.doneAt || '');
      return rank(a).localeCompare(rank(b)) || a.title.localeCompare(b.title);
    });
  }

  function completeMission(state, id, date, nowIso) {
    const m = state.missions.find((x) => x.id === id);
    if (!m || isDone(m, date)) return null;
    const c = { id: uid(), mid: m.id, title: m.title, date, pts: m.pts, who: m.who, type: m.type, at: nowIso };
    state.completions.push(c);
    m.doneOn = date;
    m.doneAt = nowIso;
    if (!m.repeat) m.done = true;
    return c;
  }

  function uncompleteMission(state, id, date) {
    const m = state.missions.find((x) => x.id === id);
    if (!m || !isDone(m, date)) return false;
    const inPeriod = (c) => (m.repeat === 'daily' ? c.date === date
      : m.repeat === 'weekly' ? inWeek(c.date, weekStart(date))
      : true);
    for (let i = state.completions.length - 1; i >= 0; i--) {
      if (state.completions[i].mid === m.id && inPeriod(state.completions[i])) {
        state.completions.splice(i, 1);
        break;
      }
    }
    const previous = state.completions.filter((c) => c.mid === m.id).pop();
    m.doneOn = previous ? previous.date : '';
    m.doneAt = previous ? previous.at : '';
    m.done = false;
    return true;
  }

  // ---------- points, levels, streaks ----------

  const earnedPoints = (state) => sum(state.completions, (c) => c.pts);
  const spentPoints = (state) => sum(state.redeemed, (r) => r.cost);
  const balance = (state) => earnedPoints(state) - spentPoints(state);

  const LEVEL_TITLES = ['Pebble', 'Sprout', 'Spark', 'Helper', 'Hero', 'Champion', 'Guardian', 'Legend', 'Mythic', 'Sahara Star'];
  const xpFor = (level) => (10 * level * (level - 1)) / 2; // level 2 at 10 xp, 3 at 30, 4 at 60...

  function levelInfo(xp) {
    let level = 1;
    while (xpFor(level + 1) <= xp) level++;
    const base = xpFor(level);
    const span = xpFor(level + 1) - base;
    return {
      level,
      title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
      into: xp - base,
      span,
      pct: Math.min(1, (xp - base) / span),
    };
  }

  // Any logged activity makes a day count towards the streak.
  function activeDates(state) {
    const dates = new Set();
    state.completions.forEach((c) => dates.add(c.date));
    state.sleep.forEach((x) => dates.add(x.date));
    state.meals.forEach((x) => dates.add(x.date));
    state.shifts.forEach((x) => dates.add(x.date));
    state.handoffs.forEach((x) => dates.add(x.date));
    Object.entries(state.water).forEach(([d, n]) => { if (n > 0) dates.add(d); });
    return dates;
  }

  // A streak survives until the end of today even if nothing is logged yet.
  function currentStreak(state, today) {
    const dates = activeDates(state);
    let day = dates.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (dates.has(day)) { n++; day = addDays(day, -1); }
    return n;
  }

  function bestStreak(state, today) {
    const days = [...activeDates(state)].filter((d) => d <= today).sort();
    let best = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i > 0 && addDays(days[i - 1], 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  }

  // ---------- the daily "good job" hearts ----------

  function heartChecks(state, date) {
    const g = state.settings;
    const done = state.completions.filter((c) => c.date === date);
    const night = state.sleep.find((x) => x.date === date);
    const slept = night ? sleepHours(night.bed, night.wake) : 0;
    const meals = state.meals.filter((x) => x.date === date).length;
    const water = state.water[date] || 0;
    const showedUp = done.some((c) => c.who !== 'Me')
      || state.handoffs.some((x) => x.date === date)
      || state.shifts.some((x) => x.date === date);

    return [
      { key: 'missions', label: 'Missions', ok: done.length >= g.missionGoal, detail: done.length > g.missionGoal ? `${done.length} done` : `${done.length}/${g.missionGoal} done`, tab: 'missions' },
      { key: 'sleep', label: 'Sleep', ok: night !== undefined && slept >= g.sleepGoal, detail: night ? `${slept.toFixed(1)} of ${g.sleepGoal} h` : 'not logged', tab: 'sleep' },
      { key: 'food', label: 'Food', ok: meals >= g.mealGoal, detail: `${meals}/${g.mealGoal} meals`, tab: 'food' },
      { key: 'water', label: 'Water', ok: water >= g.waterGoal, detail: `${water}/${g.waterGoal} glasses`, tab: 'food' },
      { key: 'showup', label: 'Showed up', ok: showedUp, detail: showedUp ? 'done' : 'kids, co-parent or work', tab: 'coparent' },
    ];
  }

  const heartsOn = (state, date) => heartChecks(state, date).filter((c) => c.ok).length;
  const moodFor = (hearts) => (hearts >= HEART_COUNT ? 'sparkle' : hearts >= 3 ? 'happy' : hearts >= 1 ? 'ok' : 'sleepy');

  const greeting = (hour) => (hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

  // One gentle next step, most useful first.
  function nudge(state, now) {
    const date = ymd(now);
    const hour = now.getHours();
    const hearts = heartsOn(state, date);
    const mealsToday = state.meals.filter((x) => x.date === date);
    const hasMeal = (type) => mealsToday.some((x) => x.type === type);
    const overdue = state.missions.filter((m) => isOverdue(m, date)).length;
    const open = state.missions.filter((m) => !isDone(m, date)).length;

    if (hearts >= HEART_COUNT) return { text: 'All five hearts. You did a great job today!', tab: null };
    if (!state.sleep.some((x) => x.date === date) && hour < 14) return { text: "Log last night's sleep to start the day.", tab: 'sleep' };
    if (overdue) return { text: `${plural(overdue, 'mission')} overdue. Knock one out?`, tab: 'missions' };
    if (hour >= 10 && mealsToday.length === 0) return { text: 'Nothing eaten yet today. Log a bite.', tab: 'food' };
    if (hour >= 14 && !hasMeal('Lunch') && mealsToday.length < 2) return { text: 'Lunch is not logged yet.', tab: 'food' };
    if (hour >= 15 && (state.water[date] || 0) < 4) return { text: 'Time for a glass of water.', tab: 'food' };
    if (open) return { text: `${plural(open, 'mission')} waiting. Pick one small win.`, tab: 'missions' };
    if (hour >= 20) return { text: 'Wind down. Log your day and rest.', tab: 'sleep' };
    return { text: 'All clear. Add a mission when you think of one.', tab: 'missions' };
  }

  // ---------- weekly numbers + report ----------

  function weekSummary(state, date) {
    const start = weekStart(date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const shifts = state.shifts.filter((s) => inWeek(s.date, start));
    const nights = state.sleep.filter((s) => inWeek(s.date, start)).map((s) => sleepHours(s.bed, s.wake));
    const done = state.completions.filter((c) => inWeek(c.date, start));
    const heartsByDay = days.filter((d) => d <= date).map((d) => heartsOn(state, d));
    return {
      start,
      end: days[6],
      days,
      hours: sum(shifts, (s) => s.hours),
      hoursByDay: days.map((d) => sum(shifts.filter((s) => s.date === d), (s) => s.hours)),
      daysWorked: new Set(shifts.map((s) => s.date)).size,
      target: state.settings.jobTarget,
      missions: done.length,
      points: sum(done, (c) => c.pts),
      nights: nights.length,
      avgSleep: nights.length ? sum(nights, (h) => h) / nights.length : 0,
      heartsByDay,
      hearts: sum(heartsByDay, (h) => h),
      goodDays: heartsByDay.filter((h) => h >= 3).length,
    };
  }

  function buildReport(state, date) {
    const w = weekSummary(state, date);
    const waiting = sortMissions(state.missions.filter((m) => m.who === 'Co-parent' && !isDone(m, date)), date);
    const notes = state.handoffs.filter((n) => inWeek(n.date, w.start));
    const level = levelInfo(earnedPoints(state));

    const lines = [
      `Sahara weekly report, ${fmtDay(w.start)} to ${fmtDay(w.end)}`,
      '',
      `Good-job hearts: ${w.hearts} (${plural(w.goodDays, 'good day')} out of ${w.heartsByDay.length})`,
      `Missions done: ${w.missions} (${w.points} points)`,
      `Sleep: ${w.nights ? `${w.avgSleep.toFixed(1)} h average over ${plural(w.nights, 'night')}` : 'not logged this week'}`,
      `Work hours: ${w.hours.toFixed(1)} of ${w.target} h`,
      `Streak: ${plural(currentStreak(state, date), 'day')}. Level ${level.level}, ${level.title}`,
    ];
    if (waiting.length) {
      lines.push('', 'Waiting on co-parent:');
      waiting.forEach((m) => lines.push(`- ${m.title}${m.due ? ` (due ${fmtDay(m.due)})` : ''}`));
    }
    if (notes.length) {
      lines.push('', 'Handoff notes:');
      notes.forEach((n) => lines.push(`- ${n.text}`));
    }
    return lines.join('\n');
  }

  // ---------- badges ----------

  const BADGES = [
    { id: 'first', title: 'First Mission', desc: 'Complete a mission', icon: 'star', test: (s) => s.completions.length >= 1 },
    { id: 'machine', title: 'Mission Machine', desc: 'Complete 25 missions', icon: 'trophy', test: (s) => s.completions.length >= 25 },
    { id: 'streak3', title: 'On a Roll', desc: 'Log something 3 days in a row', icon: 'flame', test: (s, c) => c.best >= 3 },
    { id: 'streak7', title: 'Unstoppable', desc: 'Log something 7 days in a row', icon: 'flame', test: (s, c) => c.best >= 7 },
    { id: 'full', title: 'Full Hearts', desc: 'Fill all five hearts in one day', icon: 'heart', test: (s, c) => c.fullDay },
    { id: 'sleep', title: 'Sleep Champ', desc: 'Hit your sleep goal 5 nights', icon: 'moon', test: (s) => s.sleep.filter((n) => sleepHours(n.bed, n.wake) >= s.settings.sleepGoal).length >= 5 },
    { id: 'water', title: 'Hydro Hero', desc: 'Hit your water goal 3 days', icon: 'drop', test: (s) => Object.values(s.water).filter((n) => n >= s.settings.waterGoal).length >= 3 },
    { id: 'work', title: 'Work Week Done', desc: 'Hit your weekly work target', icon: 'case', test: (s, c) => c.workWeek },
    { id: 'team', title: 'Team Player', desc: '5 co-parent missions or notes', icon: 'people', test: (s) => s.completions.filter((x) => x.who === 'Co-parent').length + s.handoffs.length >= 5 },
    { id: 'treat', title: 'Treat Yourself', desc: 'Redeem a reward', icon: 'gift', test: (s) => s.redeemed.length >= 1 },
  ];

  // Unlocks any badges now earned and returns the newly unlocked ones.
  function evaluateBadges(state, today) {
    const pending = BADGES.filter((b) => !state.badges[b.id]);
    if (!pending.length) return [];

    const days = [...activeDates(state)].filter((d) => d <= today);
    const weeks = new Map();
    state.shifts.forEach((s) => {
      const key = weekStart(s.date);
      weeks.set(key, (weeks.get(key) || 0) + s.hours);
    });
    const ctx = {
      best: bestStreak(state, today),
      fullDay: days.some((d) => heartsOn(state, d) >= HEART_COUNT),
      workWeek: [...weeks.values()].some((h) => h >= state.settings.jobTarget),
    };

    const unlocked = pending.filter((b) => b.test(state, ctx));
    unlocked.forEach((b) => { state.badges[b.id] = today; });
    return unlocked;
  }

  return {
    WHO, TYPES, REPEATS, MEAL_TYPES, THEMES, HEART_COUNT, DEFAULT_SETTINGS, BADGES, LEVEL_TITLES,
    uid, pad, ymd, hm, parseYmd, isYmd, isHm, addDays, weekStart, inWeek, fmtDay, plural, sum, sortedDesc,
    clampNum, clampInt, sleepHours,
    freshState, normalizeState,
    isDone, isOverdue, sortMissions, completeMission, uncompleteMission,
    earnedPoints, spentPoints, balance, xpFor, levelInfo,
    activeDates, currentStreak, bestStreak,
    heartChecks, heartsOn, moodFor, greeting, nudge,
    weekSummary, buildReport, evaluateBadges,
  };
});

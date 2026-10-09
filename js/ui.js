/*
 * Sahara UI: renders the state from core.js and wires up every tap.
 * All the rules live in core.js; this file only draws and reacts.
 */
(() => {
  'use strict';

  const C = window.SaharaCore;
  const P = window.SaharaPixel;
  const { isDone, isOverdue, fmtDay, plural, sortedDesc, sleepHours } = C;

  const STORE_KEY = 'sahara.v1';
  const TABS = ['today', 'missions', 'sleep', 'food', 'job', 'coparent'];
  const FILTERS = ['All', 'Me', 'Co-parent', 'Kids', 'Job'];
  const REMOVABLE = ['missions', 'rewards', 'sleep', 'meals', 'shifts', 'handoffs'];
  const CONFETTI = ['#ff4d8d', '#ffd166', '#5fd3b0', '#7bc8ff', '#ff9f43'];

  // ---------- helpers ----------

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const today = () => C.ymd(new Date());
  const emptyRow = (msg) => `<li class="empty">${esc(msg)}</li>`;
  const removeBtn = (kind, id, label) => (
    `<button type="button" class="icon-btn" data-act="remove" data-kind="${kind}" data-id="${id}" aria-label="Delete ${esc(label)}">✕</button>`
  );
  const dayLetter = (date) => C.parseYmd(date).toLocaleDateString(undefined, { weekday: 'narrow' });
  const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- state ----------

  let damagedBackup = false;

  function loadState() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch { /* storage blocked */ }
    if (!raw) return C.freshState();
    try {
      return C.normalizeState(JSON.parse(raw));
    } catch {
      // keep the unreadable text around instead of overwriting it on the next save
      try { localStorage.setItem(`${STORE_KEY}.damaged`, raw); } catch { /* ignore */ }
      damagedBackup = true;
      return C.freshState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      toast('Could not save on this device. Export a backup.');
    }
  }

  let state = loadState();
  let missionFilter = 'All';
  let editingId = null;
  let lastDay = today();
  let installPrompt = null;
  let toastTimer = null;
  let toastFn = null;

  const progress = () => ({
    level: C.levelInfo(C.earnedPoints(state)).level,
    hearts: C.heartsOn(state, today()),
  });
  let lastProgress = progress();

  // Save, redraw, and celebrate anything new: level ups, full hearts, badges.
  function commit() {
    const unlocked = C.evaluateBadges(state, today());
    saveState();
    renderAll();

    const now = progress();
    const news = [];
    if (now.level > lastProgress.level) {
      news.push(`Level ${now.level}: ${C.levelInfo(C.earnedPoints(state)).title}`);
    } else if (now.hearts >= C.HEART_COUNT && lastProgress.hearts < C.HEART_COUNT) {
      news.push('All five hearts!');
    }
    unlocked.forEach((b) => news.push(`Badge: ${b.title}`));
    lastProgress = now;

    if (news.length) {
      rain();
      sfx.level();
      setTimeout(() => toast(news.join(' · ')), 1300); // after the action's own toast
    }
  }

  // Deletes, imports and resets can be undone from the toast.
  function withUndo(message, change) {
    const before = JSON.stringify(state);
    change();
    commit();
    toast(message, {
      label: 'Undo',
      fn: () => {
        state = C.normalizeState(JSON.parse(before));
        lastProgress = progress();
        applyTheme();
        syncSettingsForm();
        commit();
        toast('Restored');
      },
    });
  }

  // ---------- toast, sound, celebration ----------

  function toast(msg, action) {
    const el = $('#toast');
    $('#toastMsg').textContent = msg;
    const btn = $('#toastAction');
    btn.hidden = !action;
    if (action) btn.textContent = action.label;
    toastFn = action ? action.fn : null;
    el.classList.toggle('has-action', Boolean(action));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5500 : 2200);
  }

  const sfx = (() => {
    let ctx = null;
    const tone = (freq, at, dur, vol = 0.05) => {
      if (!state.settings.sound) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + at;
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch { /* audio not available */ }
    };
    return {
      coin: () => { tone(988, 0, 0.07); tone(1319, 0.07, 0.2); },
      undo: () => tone(330, 0, 0.1),
      tap: () => tone(660, 0, 0.05, 0.03),
      level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.14)),
    };
  })();

  const buzz = () => { if (navigator.vibrate) navigator.vibrate(12); };

  // A little ring of pixels, with chunky stepped motion.
  function burst(x, y) {
    if (!motionOk() || !document.body.animate) return;
    for (let i = 0; i < 16; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.cssText = `left:${x - 4}px;top:${y - 4}px;background:${CONFETTI[i % CONFETTI.length]}`;
      document.body.append(p);
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const dist = 40 + Math.random() * 70;
      p.animate(
        [
          { transform: 'translate(0, 0)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 24}px)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 350, easing: 'steps(7, end)' }
      ).onfinish = () => p.remove();
    }
  }

  // Hearts falling down the screen for the big moments.
  function rain() {
    if (!motionOk() || !document.body.animate) return;
    for (let i = 0; i < 26; i++) {
      const h = document.createElement('div');
      h.className = 'rain-heart';
      h.style.left = `${Math.random() * 94}vw`;
      h.innerHTML = P.heart(Math.random() > 0.2);
      document.body.append(h);
      h.animate(
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: `translateY(${window.innerHeight + 60}px)`, opacity: 0.9 },
        ],
        { duration: 1400 + Math.random() * 1400, delay: Math.random() * 600, easing: 'steps(18, end)', fill: 'backwards' }
      ).onfinish = () => h.remove();
    }
  }

  function pulseMeter() {
    if (!motionOk()) return;
    const meter = $('#meter');
    meter.classList.remove('pop');
    void meter.offsetWidth; // restart the animation
    meter.classList.add('pop');
  }

  // ---------- rendering ----------

  function renderAll() {
    renderHeader();
    renderToday();
    renderMissions();
    renderRewards();
    renderSleep();
    renderFood();
    renderJob();
    renderCoParent();
    renderSoundButton();
  }

  // Columns for the little charts. value null draws an empty column with a dash.
  function barChart(items, { max, goal = 0, tone = '' }) {
    const pct = (v) => Math.min(100, (v / max) * 100);
    return items.map((it) => `
      <div class="bar-col">
        <span class="bar-val">${it.value === null ? '–' : esc(it.text)}</span>
        <div class="bar-track">
          ${goal ? `<i class="goal" style="bottom:${pct(goal)}%"></i>` : ''}
          <div class="bar-fill ${it.good ? 'good' : tone}" style="height:${it.value === null ? 0 : pct(it.value)}%"></div>
        </div>
        <span class="bar-day">${esc(it.label)}</span>
      </div>`).join('');
  }

  function renderHeader() {
    const d = today();
    const hearts = C.heartsOn(state, d);
    const balance = C.balance(state);
    const streak = C.currentStreak(state, d);

    $('#tagline').textContent = fmtDay(d);
    $('#hearts').innerHTML = Array.from({ length: C.HEART_COUNT }, (_, i) => P.heart(i < hearts)).join('');
    $('#meterLabel').textContent = `${hearts}/${C.HEART_COUNT} hearts today`;
    $('#points').innerHTML = `${P.heart(true)}<span>${balance}</span>`;
    $('#points').title = `${balance} love points to spend on rewards`;
    $('#streakChip').innerHTML = `${P.icon('flame')}<span>${streak}</span>`;
    $('#streakChip').title = streak ? `${plural(streak, 'day')} in a row` : 'No streak yet. Log something today.';
  }

  function renderToday() {
    const d = today();
    const now = new Date();
    const checks = C.heartChecks(state, d);
    const hearts = checks.filter((c) => c.ok).length;
    const mood = C.moodFor(hearts);
    const level = C.levelInfo(C.earnedPoints(state));
    const tip = C.nudge(state, now);
    const sparks = mood === 'sparkle' ? ['s1', 's2', 's3'].map((s) => P.icon('sparkle', `spark ${s}`)).join('') : '';

    $('#hero').innerHTML = `
      <div class="hero-art" data-mood="${mood}">${P.hero(mood)}${sparks}</div>
      <div>
        <p class="greet">${esc(C.greeting(now.getHours()))}</p>
        ${tip.tab
    ? `<button type="button" class="bubble" data-act="tab" data-value="${tip.tab}">${esc(tip.text)}</button>`
    : `<p class="bubble">${esc(tip.text)}</p>`}
      </div>
      <div class="hero-level">
        <div class="level-row">
          <span class="level-tag">LV ${level.level}</span>
          <span class="level-name">${esc(level.title)}</span>
          <span class="xp-text">${level.into}/${level.span} xp</span>
        </div>
        <div class="bar-long xp" role="progressbar" aria-label="Progress to the next level"
          aria-valuemin="0" aria-valuemax="${level.span}" aria-valuenow="${level.into}">
          <div class="bar-long-fill" style="width:${Math.round(level.pct * 100)}%"></div>
        </div>
      </div>`;

    $('#checkList').innerHTML = checks.map((c) => `
      <li>
        <button type="button" class="check-btn${c.ok ? ' ok' : ''}" data-act="tab" data-value="${c.tab}">
          ${P.heart(c.ok)}
          <span class="check-label">${esc(c.label)}</span>
          <span class="check-detail">${esc(c.detail)}</span>
        </button>
      </li>`).join('');

    const w = C.weekSummary(state, d);
    const dayItems = w.days.map((day, i) => {
      const past = i < w.heartsByDay.length;
      return { label: dayLetter(day), value: past ? w.heartsByDay[i] : null, text: past ? String(w.heartsByDay[i]) : '' };
    });
    $('#weekCard').innerHTML = `
      <div class="stats">
        <div class="stat"><span class="stat-num">${w.hearts}</span><span class="stat-label">hearts</span></div>
        <div class="stat"><span class="stat-num">${w.missions}</span><span class="stat-label">missions</span></div>
        <div class="stat"><span class="stat-num">${w.nights ? w.avgSleep.toFixed(1) : '–'}</span><span class="stat-label">avg sleep h</span></div>
        <div class="stat"><span class="stat-num">${w.hours.toFixed(1)}</span><span class="stat-label">work h</span></div>
      </div>
      <div class="bars">${barChart(dayItems, { max: C.HEART_COUNT, goal: 3, tone: 'hearts' })}</div>
      <p class="muted">Hearts each day. The dashed line marks a good day (3 hearts). ${plural(w.goodDays, 'good day')} so far.</p>`;

    const next = C.sortMissions(state.missions.filter((m) => !isDone(m, d)), d).slice(0, 3);
    $('#upNext').innerHTML = next.length
      ? next.map(missionRow).join('')
      : emptyRow('Nothing open. Add a mission when you think of one.');

    $('#badgeGrid').innerHTML = C.BADGES.map((b) => {
      const got = state.badges[b.id];
      return `
        <div class="badge${got ? '' : ' locked'}" title="${esc(b.desc)}">
          <span class="badge-art">${P.icon(got ? b.icon : 'lock')}</span>
          <span>${esc(b.title)}</span>
          <span class="badge-desc">${got ? esc(fmtDay(got)) : esc(b.desc)}</span>
        </div>`;
    }).join('');
    $('#badgeNote').textContent = `${Object.keys(state.badges).length} of ${C.BADGES.length} unlocked.`;
  }

  function missionRow(m) {
    const d = today();
    const done = isDone(m, d);
    const overdue = isOverdue(m, d);
    const chips = [
      `<span class="chip">${esc(m.who)}</span>`,
      `<span class="chip">${esc(m.type)}</span>`,
      `<span class="chip pts">+${m.pts}</span>`,
      m.repeat ? `<span class="chip repeat">${m.repeat === 'daily' ? 'Daily' : 'Weekly'}</span>` : '',
      m.due ? `<span class="chip${overdue ? ' warn' : ''}">${overdue ? 'Overdue · ' : ''}${esc(fmtDay(m.due))}</span>` : '',
    ].join('');
    return `
      <li class="item${done ? ' done' : ''}">
        <button type="button" class="check" data-act="toggle" data-id="${m.id}" aria-pressed="${done}"
          aria-label="${done ? 'Undo' : 'Complete'}: ${esc(m.title)}">${done ? '✓' : ''}</button>
        <button type="button" class="item-main" data-act="edit" data-id="${m.id}" aria-label="Edit ${esc(m.title)}">
          <span class="item-title">${esc(m.title)}</span>
          <span class="chips">${chips}</span>
        </button>
        ${removeBtn('missions', m.id, m.title)}
      </li>`;
  }

  function renderMissions() {
    $('#filters').innerHTML = FILTERS.map((f) => (
      `<button type="button" class="chip-btn" data-act="filter" data-value="${f}" aria-pressed="${f === missionFilter}">${f}</button>`
    )).join('');

    const matches = (m) => missionFilter === 'All'
      || (missionFilter === 'Job' ? m.type === 'Job' : m.who === missionFilter);
    const list = C.sortMissions(state.missions.filter(matches), today());
    $('#missionList').innerHTML = list.length
      ? list.map(missionRow).join('')
      : emptyRow('Nothing here yet. Add a mission above ♥');
  }

  function renderRewards() {
    const balance = C.balance(state);
    $('#rewardList').innerHTML = state.rewards.length
      ? state.rewards.map((r) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(r.title)}</div>
            <div class="chips"><span class="chip pts">${r.cost} pts</span></div>
          </div>
          <button type="button" class="btn small" data-act="redeem" data-id="${r.id}"${balance < r.cost ? ' disabled' : ''}>Redeem</button>
          ${removeBtn('rewards', r.id, r.title)}
        </li>`).join('')
      : emptyRow('Add a treat you actually want ♥');

    const recent = state.redeemed.slice(-3).reverse();
    $('#redeemedNote').textContent = recent.length ? `Recent treats: ${recent.map((r) => r.title).join(', ')}` : '';
  }

  function renderSleep() {
    const goal = state.settings.sleepGoal;
    const nights = Array.from({ length: 7 }, (_, i) => {
      const date = C.addDays(today(), i - 6);
      const night = state.sleep.find((s) => s.date === date);
      const hours = night ? sleepHours(night.bed, night.wake) : null;
      return { label: dayLetter(date), value: hours, text: hours === null ? '' : hours.toFixed(1), good: hours !== null && hours >= goal };
    });
    $('#sleepChart').innerHTML = barChart(nights, { max: Math.max(10, Math.ceil(goal) + 1), goal });

    const logged = nights.filter((n) => n.value !== null);
    const avg = logged.length ? C.sum(logged, (n) => n.value) / logged.length : 0;
    const atGoal = logged.filter((n) => n.good).length;
    $('#sleepAvg').textContent = logged.length
      ? `Average ${avg.toFixed(1)} h over ${plural(logged.length, 'night')}. ${atGoal} at your ${goal} h goal (dashed line).`
      : 'No nights logged this week yet.';

    $('#sleepList').innerHTML = state.sleep.length
      ? sortedDesc(state.sleep, (s) => s.date).slice(0, 30).map((s) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(fmtDay(s.date))} · ${sleepHours(s.bed, s.wake).toFixed(1)} h</div>
            <div class="chips"><span class="chip">${s.bed} → ${s.wake}</span></div>
            <div class="hearts-sm" role="img" aria-label="Rested ${s.rest} out of 5">
              ${Array.from({ length: 5 }, (_, i) => P.heart(i < s.rest)).join('')}
            </div>
          </div>
          ${removeBtn('sleep', s.id, 'night')}
        </li>`).join('')
      : emptyRow('No sleep logged yet.');
  }

  function renderFood() {
    const d = today();
    const logged = new Set(state.meals.filter((m) => m.date === d).map((m) => m.type));
    $('#mealSlots').innerHTML = C.MEAL_TYPES.map((t) => (
      `<div class="slot${logged.has(t) ? ' on' : ''}">${P.heart(logged.has(t))}<span>${t}</span></div>`
    )).join('');

    const goal = state.settings.waterGoal;
    const glasses = state.water[d] || 0;
    $('#waterDots').innerHTML = Array.from({ length: Math.max(goal, glasses) }, (_, i) => (
      `<span class="dot${i < glasses ? ' on' : ''}"></span>`
    )).join('');
    $('#waterLabel').textContent = glasses >= goal ? `Water goal hit (${glasses} glasses) ♥` : `${glasses}/${goal} glasses today`;
    $('#waterDown').disabled = glasses === 0;
    $('#waterUp').disabled = glasses >= 30;

    const meals = sortedDesc(state.meals, (m) => m.date + m.time).slice(0, 50);
    $('#mealList').innerHTML = meals.length
      ? meals.map((m) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(m.what)}</div>
            <div class="chips">
              <span class="chip">${esc(m.type)}</span>
              <span class="chip">${esc(fmtDay(m.date))} · ${m.time}</span>
            </div>
          </div>
          ${removeBtn('meals', m.id, m.what)}
        </li>`).join('')
      : emptyRow('No meals logged yet.');
  }

  function renderJob() {
    const d = today();
    const w = C.weekSummary(state, d);
    const openJobs = state.missions.filter((m) => m.type === 'Job' && !isDone(m, d)).length;
    const left = w.target - w.hours;

    $('#jobWeek').textContent = `Week of ${fmtDay(w.start)}`;
    $('#jobTotal').textContent = `${w.hours.toFixed(1)} / ${w.target} h`;
    $('#jobFill').style.width = `${Math.min(100, (w.hours / w.target) * 100)}%`;
    $('#jobBar').setAttribute('aria-valuenow', String(Math.round(w.hours * 10) / 10));
    $('#jobBar').setAttribute('aria-valuemax', String(w.target));
    $('#jobNote').textContent = left <= 0
      ? `Target hit ♥ ${plural(w.daysWorked, 'day')} worked. ${plural(openJobs, 'job mission')} still open.`
      : `${left.toFixed(1)} h to go. ${plural(w.daysWorked, 'day')} worked so far. ${plural(openJobs, 'job mission')} open.`;

    const maxHours = Math.max(8, ...w.hoursByDay);
    $('#jobChart').innerHTML = barChart(
      w.days.map((day, i) => ({
        label: dayLetter(day),
        value: w.hoursByDay[i] > 0 ? w.hoursByDay[i] : null,
        text: String(w.hoursByDay[i]),
      })),
      { max: maxHours }
    );
    $('#jobTarget').value = state.settings.jobTarget;

    $('#shiftList').innerHTML = state.shifts.length
      ? sortedDesc(state.shifts, (s) => s.date).slice(0, 50).map((s) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(fmtDay(s.date))} · ${s.hours} h</div>
            ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
          </div>
          ${removeBtn('shifts', s.id, 'shift')}
        </li>`).join('')
      : emptyRow('No shifts logged yet.');
  }

  function renderCoParent() {
    const d = today();
    const waiting = C.sortMissions(state.missions.filter((m) => m.who === 'Co-parent' && !isDone(m, d)), d);
    $('#coList').innerHTML = waiting.length ? waiting.map(missionRow).join('') : emptyRow('Nothing waiting on your co-parent.');

    $('#handoffList').innerHTML = state.handoffs.length
      ? sortedDesc(state.handoffs, (n) => n.date + n.time).map((n) => `
        <li class="item">
          <div class="item-body">
            <div class="note">${esc(n.text)}</div>
            <div class="chips"><span class="chip">${esc(fmtDay(n.date))} · ${n.time}</span></div>
          </div>
          ${removeBtn('handoffs', n.id, 'note')}
        </li>`).join('')
      : emptyRow('No handoff notes yet.');

    $('#reportText').value = C.buildReport(state, d);
    $('#shareBtn').hidden = !navigator.share;
  }

  function renderSoundButton() {
    const on = state.settings.sound;
    $('#soundBtn').innerHTML = P.icon(on ? 'speakerOn' : 'speakerOff');
    $('#soundBtn').setAttribute('aria-pressed', String(on));
    $('#soundBtn').setAttribute('aria-label', on ? 'Sound effects on' : 'Sound effects off');
  }

  // ---------- settings + theme ----------

  function applyTheme() {
    const theme = state.settings.theme;
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  function syncSettingsForm() {
    const f = $('#settingsForm').elements;
    const s = state.settings;
    f.missionGoal.value = s.missionGoal;
    f.mealGoal.value = s.mealGoal;
    f.waterGoal.value = s.waterGoal;
    f.sleepGoal.value = s.sleepGoal;
    f.theme.value = s.theme;
    f.sound.checked = s.sound;
  }

  // ---------- navigation ----------

  function showTab(name) {
    const tab = TABS.includes(name) ? name : 'today';
    $$('.tab').forEach((sec) => { sec.hidden = sec.id !== `tab-${tab}`; });
    $$('.tabbar [data-act="tab"]').forEach((btn) => {
      if (btn.dataset.value === tab) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    document.body.dataset.tab = tab;
    try { history.replaceState(null, '', `#${tab}`); } catch { /* not allowed on some file:// pages */ }
    window.scrollTo(0, 0);
  }

  // ---------- mission editing ----------

  function syncRepeat() {
    const f = $('#missionForm').elements;
    f.due.disabled = f.repeat.value !== '';
    if (f.due.disabled) f.due.value = '';
  }

  function endEdit() {
    editingId = null;
    $('#missionForm').reset();
    syncRepeat();
    $('#missionFormTitle').textContent = 'New mission';
    $('#missionSubmit').textContent = 'Add mission';
    $('#missionCancel').hidden = true;
  }

  function startEdit(id) {
    const m = state.missions.find((x) => x.id === id);
    if (!m) return;
    editingId = id;
    showTab('missions');
    const f = $('#missionForm').elements;
    f.title.value = m.title;
    f.who.value = m.who;
    f.type.value = m.type;
    f.pts.value = String(m.pts);
    f.repeat.value = m.repeat;
    f.due.value = m.due;
    syncRepeat();
    $('#missionFormTitle').textContent = 'Edit mission';
    $('#missionSubmit').textContent = 'Save changes';
    $('#missionCancel').hidden = false;
    $('#missionForm').scrollIntoView({ block: 'start' });
    f.title.focus();
  }

  // ---------- backup ----------

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sahara-backup-${today()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup saved');
  }

  async function importBackup(file) {
    let incoming;
    try {
      if (file.size > 5_000_000) throw new Error('too big');
      incoming = C.normalizeState(JSON.parse(await file.text()));
    } catch {
      toast('That file is not a Sahara backup');
      return;
    }
    const summary = `${plural(incoming.missions.length, 'mission')}, ${plural(incoming.sleep.length, 'night')}, ${plural(incoming.meals.length, 'meal')}`;
    if (!window.confirm(`Replace everything on this device with this backup (${summary})?`)) return;
    withUndo('Backup imported', () => {
      state = incoming;
      lastProgress = progress();
      applyTheme();
      syncSettingsForm();
    });
  }

  // ---------- actions (anything with data-act) ----------

  const actions = {
    tab: (el) => showTab(el.dataset.value),

    filter: (el) => {
      missionFilter = el.dataset.value;
      renderMissions();
    },

    toggle: (el) => {
      const id = el.dataset.id;
      const d = today();
      const m = state.missions.find((x) => x.id === id);
      if (!m) return;

      if (isDone(m, d)) {
        if (C.uncompleteMission(state, id, d)) {
          commit();
          sfx.undo();
        }
        return;
      }

      const rect = el.getBoundingClientRect(); // the button is replaced when we redraw
      const c = C.completeMission(state, id, d, new Date().toISOString());
      if (!c) return;
      commit();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      pulseMeter();
      sfx.coin();
      buzz();
      toast(`+${c.pts} points ♥`);
    },

    edit: (el) => startEdit(el.dataset.id),
    cancelEdit: () => endEdit(),

    remove: (el) => {
      const { kind, id } = el.dataset;
      if (!REMOVABLE.includes(kind)) return;
      withUndo('Deleted', () => {
        state[kind] = state[kind].filter((x) => x.id !== id);
        if (kind === 'missions' && editingId === id) endEdit();
      });
    },

    redeem: (el) => {
      const r = state.rewards.find((x) => x.id === el.dataset.id);
      if (!r) return;
      if (C.balance(state) < r.cost) {
        toast('Not enough points yet');
        return;
      }
      state.redeemed.push({ id: C.uid(), title: r.title, cost: r.cost, at: new Date().toISOString() });
      commit();
      sfx.coin();
      toast(`Enjoy: ${r.title}`);
    },

    water: (el) => {
      const d = today();
      const next = Math.min(30, Math.max(0, (state.water[d] || 0) + Number(el.dataset.value)));
      if (next > 0) state.water[d] = next;
      else delete state.water[d];
      commit();
      sfx.tap();
    },

    sound: () => {
      state.settings.sound = !state.settings.sound;
      saveState();
      renderSoundButton();
      syncSettingsForm();
      sfx.tap();
      toast(state.settings.sound ? 'Sound on' : 'Sound off');
    },

    copy: async () => {
      try {
        await navigator.clipboard.writeText($('#reportText').value);
        toast('Report copied');
      } catch {
        $('#reportText').select();
        toast('Press Ctrl+C or Cmd+C to copy');
      }
    },

    share: async () => {
      try {
        await navigator.share({ title: 'Sahara weekly report', text: $('#reportText').value });
      } catch { /* closed without sharing */ }
    },

    export: () => exportBackup(),
    import: () => $('#importFile').click(),

    reset: () => {
      if (!window.confirm('Erase all missions, logs, points and badges on this device? You can undo right after.')) return;
      withUndo('Everything erased', () => {
        state = C.freshState();
        lastProgress = progress();
        endEdit();
        applyTheme();
        syncSettingsForm();
      });
    },

    install: async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      $('#installBtn').hidden = true;
    },

    toastAction: () => {
      const fn = toastFn;
      toastFn = null;
      $('#toast').classList.remove('show');
      if (fn) fn();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    const action = el && actions[el.dataset.act];
    if (action) action(el);
  });

  // ---------- forms ----------

  const mealGuess = (hour) => (hour < 10 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 17 ? 'Snack' : hour < 21 ? 'Dinner' : 'Snack');

  // Sensible starting values: today's date, now, and last night's usual bed and wake times.
  function applyFormDefaults() {
    const d = today();
    const now = new Date();
    const last = sortedDesc(state.sleep, (s) => s.date)[0];
    const sleep = $('#sleepForm').elements;
    sleep.date.value = d;
    sleep.date.max = d;
    sleep.bed.value = last ? last.bed : '23:00';
    sleep.wake.value = last ? last.wake : '07:00';
    $('#shiftForm').elements.date.value = d;
    const meal = $('#mealForm').elements;
    meal.time.value = C.hm(now);
    meal.type.value = mealGuess(now.getHours());
  }

  function bindForms() {
    $('#missionForm').elements.repeat.addEventListener('change', syncRepeat);

    $('#missionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const title = String(f.get('title')).trim();
      if (!title) return;
      const repeat = C.REPEATS.includes(f.get('repeat')) ? f.get('repeat') : '';
      const fields = {
        title,
        who: f.get('who'),
        type: f.get('type'),
        pts: Number(f.get('pts')),
        repeat,
        due: repeat ? '' : String(f.get('due') || ''),
      };

      const m = editingId && state.missions.find((x) => x.id === editingId);
      if (m) {
        const wasDone = isDone(m, today());
        Object.assign(m, fields);
        m.done = !m.repeat && wasDone;
        endEdit();
        commit();
        toast('Mission updated');
        return;
      }
      state.missions.push({ id: C.uid(), done: false, doneOn: '', doneAt: '', ...fields });
      e.currentTarget.reset();
      syncRepeat();
      commit();
      toast('Mission added');
    });

    $('#rewardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const title = String(f.get('title')).trim();
      const cost = C.clampInt(f.get('cost'), 1, 999, 0);
      if (!title || !cost) return;
      state.rewards.push({ id: C.uid(), title, cost });
      e.currentTarget.reset();
      commit();
      toast('Reward added');
    });

    $('#sleepForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const night = {
        id: C.uid(),
        date: String(f.get('date')),
        bed: String(f.get('bed')),
        wake: String(f.get('wake')),
        rest: C.clampInt(f.get('rest'), 1, 5, 3),
      };
      if (!C.isYmd(night.date) || !C.isHm(night.bed) || !C.isHm(night.wake)) return;
      if (sleepHours(night.bed, night.wake) === 0) {
        toast('Bed and wake time are the same');
        return;
      }
      // one night per morning: saving again replaces the earlier entry
      state.sleep = state.sleep.filter((s) => s.date !== night.date).concat(night);
      commit();
      applyFormDefaults();
      toast(`Night saved · ${sleepHours(night.bed, night.wake).toFixed(1)} h`);
    });

    $('#mealForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const what = String(f.get('what')).trim();
      if (!what) return;
      state.meals.push({ id: C.uid(), date: today(), time: String(f.get('time')), type: String(f.get('type')), what });
      e.currentTarget.reset();
      applyFormDefaults();
      commit();
      sfx.tap();
      toast('Meal logged');
    });

    $('#shiftForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const hours = C.clampNum(f.get('hours'), 0, 24, 0);
      const date = String(f.get('date'));
      if (hours <= 0 || !C.isYmd(date)) return;
      state.shifts.push({ id: C.uid(), date, hours, note: String(f.get('note') || '').trim() });
      e.currentTarget.reset();
      applyFormDefaults();
      commit();
      sfx.tap();
      toast('Shift logged');
    });

    $('#jobTarget').addEventListener('change', (e) => {
      state.settings.jobTarget = C.clampNum(e.target.value, 1, 80, state.settings.jobTarget);
      commit();
    });

    $('#handoffForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = String(new FormData(e.currentTarget).get('text')).trim();
      if (!text) return;
      const now = new Date();
      state.handoffs.push({ id: C.uid(), date: C.ymd(now), time: C.hm(now), text });
      e.currentTarget.reset();
      commit();
      sfx.tap();
      toast('Note added');
    });

    $('#settingsForm').addEventListener('change', (e) => {
      const f = e.currentTarget.elements;
      const s = state.settings;
      s.missionGoal = C.clampInt(f.missionGoal.value, 1, 20, s.missionGoal);
      s.mealGoal = C.clampInt(f.mealGoal.value, 1, 8, s.mealGoal);
      s.waterGoal = C.clampInt(f.waterGoal.value, 1, 20, s.waterGoal);
      s.sleepGoal = C.clampNum(f.sleepGoal.value, 4, 12, s.sleepGoal);
      s.theme = C.THEMES.includes(f.theme.value) ? f.theme.value : 'auto';
      s.sound = f.sound.checked;
      applyTheme();
      syncSettingsForm();
      commit();
    });

    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // so choosing the same file again still fires
      if (file) importBackup(file);
    });
  }

  // ---------- keeping "today" fresh ----------

  function refreshDay() {
    const d = today();
    if (d !== lastDay) {
      lastDay = d;
      lastProgress = progress();
      applyFormDefaults();
    }
    renderAll();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  setInterval(() => { if (today() !== lastDay) refreshDay(); }, 60_000);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('#installBtn').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    $('#installBtn').hidden = true;
  });

  // ---------- start ----------

  function init() {
    $$('[data-icon]').forEach((el) => { el.innerHTML = P.icon(el.dataset.icon); });
    applyTheme();
    syncSettingsForm();
    bindForms();
    applyFormDefaults();
    evaluateOnLoad();
    renderAll();
    showTab(location.hash.slice(1));
    if (damagedBackup) toast('Saved data looked damaged. A copy was kept and you are starting fresh.');

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  // Badges earned before this version existed (or after an import) unlock quietly.
  function evaluateOnLoad() {
    if (C.evaluateBadges(state, today()).length) saveState();
  }

  init();
})();

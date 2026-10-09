(() => {
  'use strict';

  const STORE_KEY = 'sahara.v1';
  const DAILY_GOAL = 5;   // missions per day that fill the heart row
  const WATER_GOAL = 8;   // glasses per day
  const SLEEP_GOAL = 7;   // hours a night

  // 9x8 pixel heart. Each X is one filled pixel.
  const HEART_ROWS = [
    '.XX...XX.',
    'XXXX.XXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];
  const HEART_PATH = HEART_ROWS
    .flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'X' ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join('');

  const FILTERS = ['All', 'Me', 'Co-parent', 'Kids', 'Job'];

  // ---------- helpers ----------

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = () => ymd(new Date());
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const weekStart = (s) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }; // Monday
  const inWeek = (s, start) => s >= start && s <= addDays(start, 6);
  const fmtDay = (s) => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const sortedDesc = (arr, key) => [...arr].sort((a, b) => key(b).localeCompare(key(a)));

  const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sleepHours = (bed, wake) => {
    let mins = toMinutes(wake) - toMinutes(bed);
    if (mins <= 0) mins += 24 * 60; // woke up after midnight
    return mins / 60;
  };

  const pixelHeart = (on = true) => (
    `<svg class="pixel-heart${on ? '' : ' off'}" viewBox="0 0 9 8" shape-rendering="crispEdges" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`
  );
  const emptyRow = (msg) => `<li class="empty">${msg}</li>`;
  const removeBtn = (kind, id, label) => (
    `<button type="button" class="icon-btn" data-act="remove" data-kind="${kind}" data-id="${id}" aria-label="Delete ${esc(label)}">✕</button>`
  );

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- state ----------

  const freshState = () => ({
    missions: [],
    rewards: [],
    redeemed: [],
    sleep: [],
    meals: [],
    water: {},
    shifts: [],
    handoffs: [],
    jobTarget: 37.5,
  });

  function loadState() {
    try {
      return { ...freshState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch {
      return freshState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      toast('Could not save on this device');
    }
  }

  let state = loadState();
  let missionFilter = 'All';

  const earnedPoints = () => state.missions.reduce((sum, m) => sum + (m.done ? m.pts : 0), 0);
  const spentPoints = () => state.redeemed.reduce((sum, r) => sum + r.cost, 0);
  const balance = () => earnedPoints() - spentPoints();

  const byMissionOrder = (a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return b.doneAt.localeCompare(a.doneAt);
    return (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31');
  };
  const matchesFilter = (m) => {
    if (missionFilter === 'All') return true;
    if (missionFilter === 'Job') return m.type === 'Job';
    return m.who === missionFilter;
  };

  // ---------- render ----------

  function renderAll() {
    renderHeader();
    renderMissions();
    renderRewards();
    renderSleep();
    renderFood();
    renderJob();
    renderCoParent();
  }

  function renderHeader() {
    const doneToday = state.missions.filter((m) => m.done && m.doneOn === today()).length;
    const filled = Math.min(DAILY_GOAL, doneToday);
    $('#hearts').innerHTML = Array.from({ length: DAILY_GOAL }, (_, i) => pixelHeart(i < filled)).join('');
    $('#meterLabel').textContent = doneToday >= DAILY_GOAL
      ? 'Full hearts today!'
      : `${doneToday}/${DAILY_GOAL} missions today`;
    $('#points').innerHTML = `${pixelHeart(true)}<span>${balance()}</span>`;
    $('#points').title = `${balance()} love points you can spend on rewards`;
  }

  function missionRow(m) {
    const overdue = !m.done && m.due && m.due < today();
    const dueChip = m.due
      ? `<span class="chip${overdue ? ' warn' : ''}">${overdue ? 'Overdue · ' : ''}${fmtDay(m.due)}</span>`
      : '';
    return `
      <li class="item${m.done ? ' done' : ''}">
        <button type="button" class="check" data-act="toggle" data-id="${m.id}" aria-pressed="${m.done}"
          aria-label="${m.done ? 'Undo' : 'Complete'}: ${esc(m.title)}">${m.done ? '✓' : ''}</button>
        <div class="item-body">
          <div class="item-title">${esc(m.title)}</div>
          <div class="chips">
            <span class="chip">${esc(m.who)}</span>
            <span class="chip">${esc(m.type)}</span>
            <span class="chip pts">+${m.pts}</span>
            ${dueChip}
          </div>
        </div>
        ${removeBtn('missions', m.id, m.title)}
      </li>`;
  }

  function renderMissions() {
    $('#filters').innerHTML = FILTERS.map((f) => (
      `<button type="button" class="chip-btn" data-act="filter" data-value="${f}" aria-pressed="${f === missionFilter}">${f}</button>`
    )).join('');

    const list = state.missions.filter(matchesFilter).sort(byMissionOrder);
    $('#missionList').innerHTML = list.length
      ? list.map(missionRow).join('')
      : emptyRow('Nothing here yet. Add a mission above ♥');
  }

  function renderRewards() {
    const bal = balance();
    $('#rewardList').innerHTML = state.rewards.length
      ? state.rewards.map((r) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(r.title)}</div>
            <div class="chips"><span class="chip pts">${r.cost} pts</span></div>
          </div>
          <button type="button" class="btn small" data-act="redeem" data-id="${r.id}"${bal < r.cost ? ' disabled' : ''}>Redeem</button>
          ${removeBtn('rewards', r.id, r.title)}
        </li>`).join('')
      : emptyRow('Add a treat you actually want ♥');

    const recent = state.redeemed.slice(-3).reverse();
    $('#redeemedNote').textContent = recent.length
      ? `Recent treats: ${recent.map((r) => r.title).join(', ')}`
      : '';
  }

  function renderSleep() {
    const nights = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today(), i - 6);
      return { date, night: state.sleep.find((s) => s.date === date) };
    });

    $('#sleepChart').innerHTML = nights.map(({ date, night }) => {
      const h = night ? sleepHours(night.bed, night.wake) : 0;
      const pct = Math.min(100, (h / 10) * 100);
      const day = parseYmd(date).toLocaleDateString(undefined, { weekday: 'narrow' });
      return `
        <div class="bar-col">
          <span class="bar-val">${night ? h.toFixed(1) : '–'}</span>
          <div class="bar-track"><div class="bar-fill${h >= SLEEP_GOAL ? ' good' : ''}" style="height:${pct}%"></div></div>
          <span class="bar-day">${day}</span>
        </div>`;
    }).join('');

    const hours = nights.filter((n) => n.night).map((n) => sleepHours(n.night.bed, n.night.wake));
    const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
    $('#sleepAvg').textContent = hours.length
      ? `Average ${avg.toFixed(1)} h over ${plural(hours.length, 'night')}. ${avg >= SLEEP_GOAL ? 'Solid ♥' : `Aim for ${SLEEP_GOAL}+ h.`}`
      : 'No nights logged this week yet.';

    $('#sleepList').innerHTML = state.sleep.length
      ? sortedDesc(state.sleep, (s) => s.date).slice(0, 30).map((s) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${fmtDay(s.date)} · ${sleepHours(s.bed, s.wake).toFixed(1)} h</div>
            <div class="chips"><span class="chip">${s.bed} → ${s.wake}</span></div>
            <div class="hearts-sm" role="img" aria-label="Rested ${s.rest} out of 5">
              ${Array.from({ length: 5 }, (_, i) => pixelHeart(i < s.rest)).join('')}
            </div>
          </div>
          ${removeBtn('sleep', s.id, 'night')}
        </li>`).join('')
      : emptyRow('No sleep logged yet.');
  }

  function renderFood() {
    const count = state.water[today()] || 0;
    $('#waterDots').innerHTML = Array.from({ length: WATER_GOAL }, (_, i) => (
      `<span class="dot${i < count ? ' on' : ''}"></span>`
    )).join('');
    $('#waterLabel').textContent = count >= WATER_GOAL
      ? 'Water goal hit ♥'
      : `${count}/${WATER_GOAL} glasses today`;
    $('#waterDown').disabled = count === 0;
    $('#waterUp').disabled = count >= WATER_GOAL;

    const meals = sortedDesc(state.meals, (m) => m.date + m.time).slice(0, 50);
    $('#mealList').innerHTML = meals.length
      ? meals.map((m) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${esc(m.what)}</div>
            <div class="chips">
              <span class="chip">${esc(m.type)}</span>
              <span class="chip">${fmtDay(m.date)} · ${m.time}</span>
            </div>
          </div>
          ${removeBtn('meals', m.id, m.what)}
        </li>`).join('')
      : emptyRow('No meals logged yet.');
  }

  function renderJob() {
    const start = weekStart(today());
    const shifts = state.shifts.filter((s) => inWeek(s.date, start));
    const total = shifts.reduce((sum, s) => sum + s.hours, 0);
    const days = new Set(shifts.map((s) => s.date)).size;
    const openJobs = state.missions.filter((m) => m.type === 'Job' && !m.done).length;
    const target = state.jobTarget;

    $('#jobWeek').textContent = `Week of ${fmtDay(start)}`;
    $('#jobTotal').textContent = `${total.toFixed(1)} / ${target} h`;
    $('#jobFill').style.width = `${Math.min(100, (total / target) * 100)}%`;
    $('#jobNote').textContent = total >= target
      ? `Target hit ♥ ${plural(days, 'day')} worked. ${plural(openJobs, 'job mission')} still open.`
      : `${(target - total).toFixed(1)} h to go. ${plural(days, 'day')} worked so far. ${plural(openJobs, 'job mission')} open.`;

    $('#shiftList').innerHTML = state.shifts.length
      ? sortedDesc(state.shifts, (s) => s.date).slice(0, 50).map((s) => `
        <li class="item">
          <div class="item-body">
            <div class="item-title">${fmtDay(s.date)} · ${s.hours} h</div>
            ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
          </div>
          ${removeBtn('shifts', s.id, 'shift')}
        </li>`).join('')
      : emptyRow('No shifts logged yet.');
  }

  function renderCoParent() {
    const waiting = state.missions.filter((m) => m.who === 'Co-parent' && !m.done).sort(byMissionOrder);
    $('#coList').innerHTML = waiting.length
      ? waiting.map(missionRow).join('')
      : emptyRow('Nothing waiting on your co-parent.');

    $('#handoffList').innerHTML = state.handoffs.length
      ? sortedDesc(state.handoffs, (n) => n.date + n.time).map((n) => `
        <li class="item">
          <div class="item-body">
            <div class="note">${esc(n.text)}</div>
            <div class="chips"><span class="chip">${fmtDay(n.date)} · ${n.time}</span></div>
          </div>
          ${removeBtn('handoffs', n.id, 'note')}
        </li>`).join('')
      : emptyRow('No handoff notes yet.');

    $('#reportText').value = buildReport();
  }

  function buildReport() {
    const start = weekStart(today());
    const end = addDays(start, 6);
    const done = state.missions.filter((m) => m.done && inWeek(m.doneOn, start));
    const waiting = state.missions.filter((m) => m.who === 'Co-parent' && !m.done);
    const notes = state.handoffs.filter((n) => inWeek(n.date, start));
    const hours = state.shifts.filter((s) => inWeek(s.date, start)).reduce((sum, s) => sum + s.hours, 0);
    const nights = state.sleep.filter((s) => inWeek(s.date, start)).map((s) => sleepHours(s.bed, s.wake));
    const avgSleep = nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : 0;
    const points = done.reduce((sum, m) => sum + m.pts, 0);

    const lines = [
      `Sahara weekly report, ${fmtDay(start)} to ${fmtDay(end)}`,
      '',
      `Missions done: ${done.length} (${points} points)`,
      `Work hours: ${hours.toFixed(1)} of ${state.jobTarget} h`,
      `Sleep: ${nights.length ? `${avgSleep.toFixed(1)} h average over ${plural(nights.length, 'night')}` : 'not logged this week'}`,
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

  // ---------- actions ----------

  function celebrate() {
    const meter = $('#meter');
    meter.classList.remove('pop');
    void meter.offsetWidth; // restart the animation
    meter.classList.add('pop');
  }

  function showTab(name) {
    $$('.tab').forEach((sec) => { sec.hidden = sec.id !== `tab-${name}`; });
    $$('[data-act="tab"]').forEach((btn) => {
      if (btn.dataset.value === name) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  const actions = {
    tab: (el) => showTab(el.dataset.value),

    filter: (el) => {
      missionFilter = el.dataset.value;
      renderMissions();
    },

    toggle: (el) => {
      const m = state.missions.find((x) => x.id === el.dataset.id);
      if (!m) return;
      m.done = !m.done;
      m.doneOn = m.done ? today() : '';
      m.doneAt = m.done ? new Date().toISOString() : '';
      saveState();
      renderAll();
      if (m.done) {
        celebrate();
        toast(`+${m.pts} points ♥`);
      }
    },

    redeem: (el) => {
      const r = state.rewards.find((x) => x.id === el.dataset.id);
      if (!r) return;
      if (balance() < r.cost) {
        toast('Not enough points yet');
        return;
      }
      state.redeemed.push({ id: uid(), title: r.title, cost: r.cost, at: new Date().toISOString() });
      saveState();
      renderAll();
      toast(`Enjoy: ${r.title}`);
    },

    water: (el) => {
      const d = today();
      const next = (state.water[d] || 0) + Number(el.dataset.value);
      state.water[d] = Math.min(WATER_GOAL, Math.max(0, next));
      saveState();
      renderAll();
    },

    remove: (el) => {
      const { kind, id } = el.dataset;
      state[kind] = state[kind].filter((x) => x.id !== id);
      saveState();
      renderAll();
    },

    copy: async () => {
      const text = $('#reportText').value;
      try {
        await navigator.clipboard.writeText(text);
        toast('Report copied');
      } catch {
        $('#reportText').select();
        toast('Press Ctrl+C / Cmd+C to copy');
      }
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    const action = el && actions[el.dataset.act];
    if (action) action(el);
  });

  // ---------- forms ----------

  function bindForms() {
    $('#missionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const title = String(f.get('title')).trim();
      if (!title) return;
      state.missions.push({
        id: uid(),
        title,
        who: f.get('who'),
        type: f.get('type'),
        pts: Number(f.get('pts')),
        due: f.get('due') || '',
        done: false,
        doneOn: '',
        doneAt: '',
      });
      saveState();
      e.currentTarget.reset();
      renderAll();
      toast('Mission added');
    });

    $('#rewardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const title = String(f.get('title')).trim();
      const cost = Math.round(Number(f.get('cost')));
      if (!title || !(cost > 0)) return;
      state.rewards.push({ id: uid(), title, cost });
      saveState();
      e.currentTarget.reset();
      renderAll();
      toast('Reward added');
    });

    $('#sleepForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const night = {
        id: uid(),
        date: f.get('date'),
        bed: f.get('bed'),
        wake: f.get('wake'),
        rest: Number(f.get('rest')),
      };
      // one night per morning: saving again replaces the earlier entry
      state.sleep = state.sleep.filter((s) => s.date !== night.date).concat(night);
      saveState();
      renderAll();
      toast(`Night saved · ${sleepHours(night.bed, night.wake).toFixed(1)} h`);
    });

    $('#mealForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const what = String(f.get('what')).trim();
      if (!what) return;
      state.meals.push({ id: uid(), date: today(), time: f.get('time'), type: f.get('type'), what });
      saveState();
      e.currentTarget.reset();
      $('#mealForm [name=time]').value = hm(new Date());
      renderAll();
      toast('Meal logged');
    });

    $('#shiftForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const hours = Number(f.get('hours'));
      if (!(hours > 0)) return;
      state.shifts.push({ id: uid(), date: f.get('date'), hours, note: String(f.get('note') || '').trim() });
      saveState();
      e.currentTarget.reset();
      $('#shiftForm [name=date]').value = today();
      renderAll();
      toast('Shift logged');
    });

    $('#jobTarget').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (v > 0) {
        state.jobTarget = v;
        saveState();
        renderAll();
      } else {
        e.target.value = state.jobTarget;
      }
    });

    $('#handoffForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const text = String(f.get('text')).trim();
      if (!text) return;
      const now = new Date();
      state.handoffs.push({ id: uid(), date: ymd(now), time: hm(now), text });
      saveState();
      e.currentTarget.reset();
      renderAll();
      toast('Note added');
    });
  }

  // ---------- init ----------

  function setFavicon() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 8" shape-rendering="crispEdges"><path fill="#ff4d8d" d="${HEART_PATH}"/></svg>`;
    $('#favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function init() {
    setFavicon();
    $('#sleepForm [name=date]').value = today();
    $('#sleepForm [name=bed]').value = '23:00';
    $('#sleepForm [name=wake]').value = '07:00';
    $('#shiftForm [name=date]').value = today();
    $('#mealForm [name=time]').value = hm(new Date());
    $('#jobTarget').value = state.jobTarget;
    bindForms();
    renderAll();
    showTab('missions');
  }

  init();
})();

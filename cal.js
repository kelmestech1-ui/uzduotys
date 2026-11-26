/* Dienotvarkė: dienos ir savaitės kalendorius, užimtumas formoje, nuoroda į Google kalendorių */
const CAL = { startH: 7, endH: 20, hourPx: 56, weekHourPx: 44 };
const WD_SHORT = ['Sk', 'Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št'];
const MONTHS_N = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];
const DURS = [[15, '15 min'], [30, '30 min'], [60, '1 val.'], [90, '1,5 val.'], [120, '2 val.']];

function hm2m(s) { const p = String(s).split(':').map(Number); return p[0] * 60 + (p[1] || 0); }
function m2hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function mondayOf(d) { return addD(d, -((dObj(d).getDay() + 6) % 7)); }
function tDay(t) { return t.remind ? t.remind.slice(0, 10) : t.due; }
function tStartM(t) { return hm2m(t.remind.slice(11, 16)); }
function tEndM(t) { return tStartM(t) + Math.max(t.dur || 30, 15); }
function nowM() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function calTasks() {
  let ts = S.tasks;
  if (canAssign() && S.person !== '*') ts = ts.filter(t => t.to === S.person);
  return ts;
}

function evCls(t) {
  if (t.status === DONE) return 'done';
  if (tDay(t) && tDay(t) < S.today) return 'over';
  return t.prio === 'Svarbi' ? 'imp' : '';
}

function whoTag(t) {
  return canAssign() && S.person === '*' && t.to !== S.me.name ? '<span class="evwho">' + esc(t.to) + '</span>' : '';
}

/* Persidengiantys įvykiai dedami šalia vienas kito */
function layoutEvents(list) {
  const evs = list.map(t => ({ t: t, st: tStartM(t), en: tEndM(t) })).sort((a, b) => a.st - b.st || b.en - a.en);
  const out = [];
  let cluster = [], clEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(ev => {
      let i = lanes.findIndex(end => end <= ev.st);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = ev.en; ev.lane = i;
    });
    cluster.forEach(ev => { ev.lanes = lanes.length; out.push(ev); });
    cluster = []; clEnd = -1;
  };
  evs.forEach(ev => { if (cluster.length && ev.st >= clEnd) flush(); cluster.push(ev); clEnd = Math.max(clEnd, ev.en); });
  if (cluster.length) flush();
  return out;
}

function hoursRange(timed) {
  let s = CAL.startH, e = CAL.endH;
  timed.forEach(t => { s = Math.min(s, Math.floor(tStartM(t) / 60)); e = Math.max(e, Math.ceil(tEndM(t) / 60)); });
  return { s: Math.max(0, s), e: Math.min(24, e) };
}

function renderCal() {
  if (!S.calDate) S.calDate = S.today;
  if (!S.calMode) S.calMode = 'day';
  const ts = calTasks();
  const d = S.calDate, mon = mondayOf(d), o = dObj(d);
  const arrow = dir => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let h = '<div class="cal">';
  h += '<div class="cal-top"><button class="calnav" data-cal="prev" aria-label="Atgal">' + arrow(-1) + '</button>' +
    '<div class="cal-month">' + MONTHS_N[o.getMonth()] + ' <span>' + o.getFullYear() + '</span></div>' +
    '<button class="calnav" data-cal="next" aria-label="Pirmyn">' + arrow(1) + '</button>' +
    (d !== S.today ? '<button class="caltoday" data-cal="today">Šiandien</button>' : '') +
    '<div class="seg"><button data-calmode="day" class="' + (S.calMode === 'day' ? 'on' : '') + '">Diena</button>' +
    '<button data-calmode="week" class="' + (S.calMode === 'week' ? 'on' : '') + '">Savaitė</button></div></div>';
  h += '<div class="wstrip">';
  for (let i = 0; i < 7; i++) {
    const day = addD(mon, i);
    const n = ts.filter(t => tDay(t) === day && t.status !== DONE).length;
    h += '<button class="wsd' + (day === d ? ' sel' : '') + (day === S.today ? ' tod' : '') + '" data-day="' + day + '">' +
      '<span>' + WD_SHORT[dObj(day).getDay()] + '</span><b>' + dObj(day).getDate() + '</b><i>' + (n ? '<em></em>'.repeat(Math.min(n, 3)) : '') + '</i></button>';
  }
  h += '</div>';
  h += S.calMode === 'week' ? weekGrid(ts, mon) : dayGrid(ts, d);
  h += '<p class="caltip">Paspauskite tuščią laiką – sukursite užduotį tam laikui.</p></div>';
  $('#list').innerHTML = h;
}

function dayGrid(ts, d) {
  const all = ts.filter(t => !t.remind && t.due === d);
  const timed = ts.filter(t => t.remind && t.remind.slice(0, 10) === d);
  const r = hoursRange(timed), px = CAL.hourPx;
  let h = '<div class="allday"><div class="ad-l">Visą dieną</div><div class="ad-list">' +
    (all.length ? all.map(t => '<button class="ad-item ' + evCls(t) + '" data-open="' + esc(t.id) + '">' +
      (t.prio === 'Svarbi' ? '<span class="flag">!</span> ' : '') + esc(t.title) + whoTag(t) + '</button>').join('') : '<span class="ad-none">nėra</span>') +
    '</div></div>';
  h += '<div class="grid" style="height:' + ((r.e - r.s) * px) + 'px">';
  for (let hh = r.s; hh < r.e; hh++) h += '<div class="hr" style="top:' + ((hh - r.s) * px) + 'px"><span>' + hh + ':00</span></div>';
  h += '<div class="evarea">';
  for (let m = r.s * 60; m < r.e * 60; m += 30) {
    h += '<button class="slot" data-slot="' + d + ' ' + m2hm(m) + '" style="top:' + ((m - r.s * 60) / 60 * px) + 'px;height:' + (px / 2) + 'px" aria-label="Nauja ' + m2hm(m) + '"></button>';
  }
  layoutEvents(timed).forEach(ev => {
    const top = (ev.st - r.s * 60) / 60 * px, ht = Math.max((ev.en - ev.st) / 60 * px - 2, 22);
    const t = ev.t;
    h += '<button class="ev ' + evCls(t) + (ht < 40 ? ' short' : '') + '" data-open="' + esc(t.id) + '" style="top:' + top + 'px;height:' + ht + 'px;left:' +
      (ev.lane / ev.lanes * 100) + '%;width:calc(' + (100 / ev.lanes) + '% - 3px)">' +
      '<b>' + m2hm(ev.st) + '</b> ' + (t.prio === 'Svarbi' ? '<span class="flag">!</span> ' : '') + esc(t.title) +
      (t.client ? '<span class="evcl">' + esc(t.client) + '</span>' : '') + whoTag(t) + '</button>';
  });
  if (d === S.today) {
    const nm = nowM();
    if (nm >= r.s * 60 && nm <= r.e * 60) h += '<div class="nowline" style="top:' + ((nm - r.s * 60) / 60 * px) + 'px"></div>';
  }
  h += '</div></div>';
  return h;
}

function weekGrid(ts, mon) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addD(mon, i));
  const timedAll = ts.filter(t => t.remind && days.indexOf(t.remind.slice(0, 10)) >= 0);
  const r = hoursRange(timedAll), px = CAL.weekHourPx;
  let h = '<div class="wk-ad"><div class="gut">be laiko</div>' + days.map(day => {
    const n = ts.filter(t => !t.remind && t.due === day && t.status !== DONE).length;
    return n ? '<button class="wk-adn" data-day="' + day + '" data-calmode-to="day">' + n + '</button>' : '<div></div>';
  }).join('') + '</div>';
  h += '<div class="grid week" style="height:' + ((r.e - r.s) * px) + 'px">';
  for (let hh = r.s; hh < r.e; hh++) h += '<div class="hr" style="top:' + ((hh - r.s) * px) + 'px"><span>' + hh + '</span></div>';
  h += '<div class="wcols">';
  days.forEach(day => {
    h += '<div class="wcol' + (day === S.today ? ' tod' : '') + '">';
    for (let m = r.s * 60; m < r.e * 60; m += 60) {
      h += '<button class="slot" data-slot="' + day + ' ' + m2hm(m) + '" style="top:' + ((m - r.s * 60) / 60 * px) + 'px;height:' + px + 'px" aria-label="Nauja ' + day + ' ' + m2hm(m) + '"></button>';
    }
    layoutEvents(timedAll.filter(t => t.remind.slice(0, 10) === day)).forEach(ev => {
      const top = (ev.st - r.s * 60) / 60 * px, ht = Math.max((ev.en - ev.st) / 60 * px - 2, 16);
      h += '<button class="ev mini ' + evCls(ev.t) + '" data-open="' + esc(ev.t.id) + '" style="top:' + top + 'px;height:' + ht + 'px;left:' +
        (ev.lane / ev.lanes * 100) + '%;width:calc(' + (100 / ev.lanes) + '% - 2px)" title="' + esc(m2hm(ev.st) + ' ' + ev.t.title) + '">' + esc(ev.t.title) + '</button>';
    });
    if (day === S.today) {
      const nm = nowM();
      if (nm >= r.s * 60 && nm <= r.e * 60) h += '<div class="nowline" style="top:' + ((nm - r.s * 60) / 60 * px) + 'px"></div>';
    }
    h += '</div>';
  });
  h += '</div></div>';
  return h;
}

/* Kalendoriaus paspaudimai (kviečiama iš sąrašo paspaudimų tvarkyklės). Grąžina true, jei sutvarkyta. */
function calClick(e) {
  if (S.tab !== 'cal') return false;
  const nav = e.target.closest('[data-cal]');
  if (nav) {
    const step = S.calMode === 'week' ? 7 : 1;
    if (nav.dataset.cal === 'today') S.calDate = S.today;
    else S.calDate = addD(S.calDate, nav.dataset.cal === 'prev' ? -step : step);
    renderCal(); return true;
  }
  const mode = e.target.closest('[data-calmode]');
  if (mode) { S.calMode = mode.dataset.calmode; renderCal(); return true; }
  const day = e.target.closest('[data-day]');
  if (day) { S.calDate = day.dataset.day; if (day.dataset.calmodeTo) S.calMode = day.dataset.calmodeTo; renderCal(); return true; }
  const slot = e.target.closest('[data-slot]');
  if (slot) {
    const p = slot.dataset.slot.split(' ');
    openForm(null, { due: p[0], remind: p[0] + 'T' + p[1], dur: 30, to: canAssign() && S.person !== '*' ? S.person : S.me.name });
    return true;
  }
  const op = e.target.closest('[data-open]');
  if (op) { openDetail(op.dataset.open); return true; }
  return false;
}

/* Formoje: pasirinktos dienos užimtumas ir laisvi laikai */
function renderBusy() {
  const el = $('#busy'); if (!el) return;
  const day = $('#fDue').value || ($('#fRemind').value || '').slice(0, 10);
  if (!day) { el.innerHTML = ''; return; }
  const to = getTo();
  const people = Array.isArray(to) ? to : [to || S.me.name];
  const items = S.tasks.filter(t => t.id !== S.editId && t.status !== DONE && people.indexOf(t.to) >= 0 && tDay(t) === day);
  const timed = items.filter(t => t.remind).sort((a, b) => tStartM(a) - tStartM(b));
  const dur = Number($('#fDur').value) || 30;
  const ranges = timed.map(t => [tStartM(t), tEndM(t)]);
  const free = [];
  for (let m = 8 * 60; m + dur <= 18 * 60; m += 30) {
    if (day === S.today && m <= nowM()) continue;
    if (!ranges.some(rg => m < rg[1] && m + dur > rg[0])) free.push(m2hm(m));
  }
  const sel = ($('#fRemind').value || '').slice(11, 16);
  const whoTxt = people.length === 1 && people[0] === S.me.name ? 'Jūsų' : people.join(', ') + ':';
  let h = '<div class="busy-h">' + esc(whoTxt) + ' užimtumas ' + esc(fmtDue(day)) + '</div>';
  h += timed.length
    ? '<div class="busy-list">' + timed.map(t => '<div><b>' + m2hm(tStartM(t)) + '–' + m2hm(tEndM(t)) + '</b> ' + esc(t.title) +
      (people.length > 1 ? ' <span class="muted">' + esc(t.to) + '</span>' : '') + '</div>').join('') + '</div>'
    : '<div class="busy-none">Laiku suplanuotų darbų nėra.</div>';
  const untimed = items.length - timed.length;
  if (untimed) h += '<div class="busy-none">Dar ' + untimed + ' be konkretaus laiko.</div>';
  h += '<div class="busy-h2">Laisvas laikas (' + (DURS.find(x => x[0] === dur) || [0, dur + ' min'])[1] + ')</div>' +
    '<div class="qrow" data-q="free">' + (free.length
      ? free.map(f => '<button class="q' + (f === sel ? ' on' : '') + '" data-v="' + f + '">' + f + '</button>').join('')
      : '<span class="busy-none">8–18 val. laisvo laiko nėra</span>') + '</div>';
  el.innerHTML = h;
}

/* Nuoroda „Į Google kalendorių“ */
function gcalUrl(t) {
  let dates;
  if (t.remind) {
    const st = t.remind.slice(0, 16).replace(/[-:]/g, '').replace(/[ T]/, 'T') + '00';
    const endM = tStartM(t) + (t.dur || 30);
    const endDay = endM >= 1440 ? addD(t.remind.slice(0, 10), 1) : t.remind.slice(0, 10);
    dates = st + '/' + endDay.replace(/-/g, '') + 'T' + m2hm(endM % 1440).replace(':', '') + '00';
  } else if (t.due) {
    dates = t.due.replace(/-/g, '') + '/' + addD(t.due, 1).replace(/-/g, '');
  } else return '';
  const details = [t.desc, t.phone ? 'Tel. ' + t.phone : '', t.email].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent((t.client ? t.client + ': ' : '') + t.title) +
    '&dates=' + dates + '&ctz=Europe/Vilnius' + (details ? '&details=' + encodeURIComponent(details) : '');
}

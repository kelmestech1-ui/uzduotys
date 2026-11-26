/* Pardavimų užduotys – programėlė */
const CFG = self.APP_CONFIG || {};
const $ = s => document.querySelector(s);
const S = {
  pin: '', me: null, users: [], clients: [], tasks: [], today: '',
  inbox: [], sent: [], prefs: { quiet: false, evening: true },
  tab: 'open', person: '*', statsPeriod: 'week', statsView: 'results', forgotDays: 14, pending: 0,
  onAct: null, detailId: null, msgHooked: false, installEvt: null, swipedAt: 0
};
const REPEATS = ['Ne', 'Kasdien', 'Darbo dienomis', 'Kas savaitę', 'Kas mėnesį'];
const WD = ['Sk', 'Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št'];
const WDL = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];
const DONE = 'Atlikta';
const MONTHS_G = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

/* ---------- pagalbinės ---------- */
function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function loadJSON(k) { try { return JSON.parse(load(k) || 'null'); } catch (e) { return null; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function errMsg(e) { return String((e && e.message) || e || 'Klaida').replace(/^Error:\s*/, ''); }
function find(id) { return S.tasks.find(t => t.id === id); }
function canAssign() { return !!(S.me && (S.me.boss || S.me.lead)); }
function tel(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }

let toastT;
function toast(msg, action) {
  const t = $('#toast'), b = $('#toastBtn');
  $('#toastMsg').textContent = msg;
  if (action) { b.textContent = action.label; b.onclick = () => { t.classList.remove('show', 'act'); action.fn(); }; b.classList.remove('hidden'); t.classList.add('act'); }
  else { b.classList.add('hidden'); t.classList.remove('act'); }
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show', 'act'), action ? 5000 : 2800);
}

/* ---------- serveris ---------- */
function busy(d) {
  S.pending = Math.max(0, S.pending + d);
  $('#bar').classList.toggle('on', S.pending > 0);
}

async function call(action, payload) {
  if (!CFG.API_URL) throw new Error('Faile config.js neįrašytas API_URL');
  busy(1);
  try {
    let r;
    try {
      r = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ pin: S.pin, action: action, p: payload || {} }),
        redirect: 'follow'
      });
    } catch (e) {
      const er = new Error('Nėra ryšio su serveriu'); er.net = true; throw er;
    }
    let j;
    try { j = await r.json(); } catch (e) {
      const er = new Error('Serveris grąžino netikėtą atsakymą (patikrinkite Apps Script diegimą: prieiga „Bet kas“)'); er.net = true; throw er;
    }
    if (!j.ok) { const er = new Error(j.error || 'Klaida'); er.auth = !!j.auth; throw er; }
    return j.data;
  } finally { busy(-1); }
}

/* ---------- datos ---------- */
function dObj(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function dStr(o) { return o.getFullYear() + '-' + String(o.getMonth() + 1).padStart(2, '0') + '-' + String(o.getDate()).padStart(2, '0'); }
function addD(s, n) { const o = dObj(s); o.setDate(o.getDate() + n); return dStr(o); }
function fmtDue(s) {
  if (!s) return '';
  if (s === S.today) return 'šiandien';
  if (s === addD(S.today, 1)) return 'rytoj';
  if (s === addD(S.today, -1)) return 'vakar';
  return s.slice(5).replace('-', '.') + ' ' + WD[dObj(s).getDay()];
}
function fmtWhen(s) { return s ? fmtDue(s.slice(0, 10)) + ' ' + s.slice(11, 16) : ''; }

/* ---------- prisijungimas ---------- */
function showApp() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#hello').textContent = 'Labas, ' + S.me.name;
  $('#people').classList.toggle('hidden', !canAssign());
  $('#msgBtn').classList.toggle('hidden', !S.me.boss);
  $('#setBtn').classList.toggle('hidden', !S.me.boss);
  $('#statsTab').classList.toggle('hidden', !S.me.boss);
  $('#hint').classList.toggle('hidden', !!load('ut_hint_x'));
  renderPushBar();
}

async function login(pin) {
  S.pin = pin; $('#loginErr').textContent = ''; $('#loginBtn').disabled = true;
  try {
    const r = await call('login');
    S.me = r.me; S.users = r.users || [];
    store('ut_pin', pin); store('ut_me', { me: S.me, users: S.users });
    showApp();
    apply(r);
    if (pushState() === 'granted') enablePush(false);
  } catch (e) {
    const cached = loadJSON('ut_me'), data = loadJSON('ut_data');
    if (e.net && load('ut_pin') === pin && cached && data) {
      S.me = cached.me; S.users = cached.users; showApp(); apply(data, true);
      toast('Nėra ryšio – rodomi paskutiniai duomenys');
      return;
    }
    if (e.auth) store('ut_pin', null);
    S.pin = '';
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    $('#loginErr').textContent = errMsg(e);
  } finally { $('#loginBtn').disabled = false; }
}

function logout(msg) {
  const token = load('ut_token');
  if (token && S.pin) call('unsubscribe', { token: token }).catch(() => {});
  ['ut_pin', 'ut_me', 'ut_data', 'ut_token'].forEach(k => store(k, null));
  S.pin = ''; S.me = null; S.tasks = []; S.person = '*'; S.tab = 'open';
  closeSheet(); setBadge(0);
  $('#pin').value = '';
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#loginErr').textContent = msg || '';
}

async function refresh() {
  if (!S.pin || !S.me) return;
  try { apply(await call('list')); }
  catch (e) { if (e.auth) logout(errMsg(e)); else toast(errMsg(e)); }
}

function apply(r, fromCache) {
  S.tasks = r.tasks || []; S.today = r.today;
  if (r.inbox) S.inbox = r.inbox;
  if (r.sent) S.sent = r.sent;
  if (r.prefs) S.prefs = r.prefs;
  if (r.templates) S.templates = r.templates;
  if (r.clients) {
    S.clients = r.clients;
    $('#clientList').innerHTML = S.clients.map(c => '<option value="' + esc(c.n) + '"></option>').join('');
  }
  if (!fromCache) store('ut_data', { tasks: S.tasks, today: S.today, clients: S.clients, inbox: S.inbox, sent: S.sent, prefs: S.prefs, templates: S.templates });
  const o = dObj(S.today);
  $('#dateLine').innerHTML = '<span class="wd">' + WDL[o.getDay()].replace(/^./, c => c.toUpperCase()) + '</span>' +
    '<span class="dm">' + MONTHS_G[o.getMonth()] + ' ' + o.getDate() + ' d.</span>';
  if (S.tab !== 'stats') render();
  else renderPeople();
  setBadge(S.tasks.filter(t => t.to === S.me.name && t.status !== DONE && t.due && t.due <= S.today).length);
}

function setBadge(n) {
  try {
    if (n && navigator.setAppBadge) navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch (e) {}
}

/* ---------- sąrašas ---------- */
function cmp(a, b) {
  return (a.due || '9999').localeCompare(b.due || '9999') ||
    ((b.prio === 'Svarbi') - (a.prio === 'Svarbi')) ||
    (a.remind || '99').localeCompare(b.remind || '99') ||
    a.created.localeCompare(b.created);
}

function render() {
  renderPeople();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab || (b.dataset.tab === 'open' && S.tab === 'done')));
  if (S.tab === 'stats') { loadStats(S.statsPeriod); return; }
  if (S.tab === 'cal') { renderCal(); return; }
  if (S.tab === 'clients') { renderClients(); return; }
  let ts = S.tasks;
  if (canAssign() && S.person !== '*') ts = ts.filter(t => t.to === S.person);
  const summary = canAssign() && S.tab === 'open' ? summaryCard(ts) : '';
  if (canAssign() && S.person === '*') ts = groupTasks(ts);
  const open = ts.filter(t => t.status !== DONE);
  const nowCount = open.filter(t => t.due && t.due <= S.today).length;
  $('#cntOpen').textContent = nowCount ? '(' + nowCount + ')' : '';
  let html = '';
  if (S.tab === 'done') {
    const done = ts.filter(t => t.status === DONE).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
    html = done.length ? group('Atliktos per 30 dienų', '', done) : empty('Atliktų užduočių dar nėra', '📭');
  } else {
    const T = S.today, T1 = addD(T, 1);
    const sorted = open.slice().sort(cmp);
    const g = (title, cls, f) => { const a = sorted.filter(f); return a.length ? group(title, cls, a) : ''; };
    // Pagrindiniame sąraše – tik pradelstos ir šiandienos; vėlesnės paslėptos po mygtuku
    html = g('Pradelsta', 'over', t => t.due && t.due < T) +
      g('Šiandien', 'today', t => t.due === T);
    const later = sorted.filter(t => !t.due || t.due > T);
    if (!html) html = empty(later.length ? 'Šiandienai užduočių nebeliko!' : 'Visos užduotys atliktos!', '🎉');
    if (later.length) {
      const showLater = load('ut_later') === '1';
      html += '<button class="laterbtn" data-later="1">' + (showLater ? 'Slėpti kitas užduotis' : 'Kitos užduotys (' + later.length + ')') +
        '<span class="muted small">' + (showLater ? '' : ' – rytoj, vėliau, be termino') + '</span></button>';
      if (showLater) {
        html += g('Rytoj', '', t => t.due === T1) +
          g('Vėliau', '', t => t.due > T1) +
          g('Be termino', '', t => !t.due);
      }
    }
    html = inboxHtml() + summary + html;
  }
  const seg = '<div class="seg workseg"><button data-tab="open" class="' + (S.tab === 'open' ? 'on' : '') + '">Aktyvios</button>' +
    '<button data-tab="done" class="' + (S.tab === 'done' ? 'on' : '') + '">Atliktos</button></div>';
  $('#list').innerHTML = (S.tab === 'open' ? inboxHtmlOnce(html) : seg + html);
}

/* Aktyvių sąraše perjungiklis eina po žinučių ir suvestinės */
function inboxHtmlOnce(html) {
  const seg = '<div class="seg workseg"><button data-tab="open" class="on">Aktyvios</button><button data-tab="done">Atliktos</button></div>';
  return seg + html;
}

/* Vadovo žinutės, kurių vadybininkas dar nepatvirtino */
function inboxHtml() {
  return S.inbox.map(m => '<div class="inbox"><div class="ib-h">📣 ' + esc(m.from) + ' · ' + esc(fmtWhen(m.at)) + '</div>' +
    '<div class="ib-t">' + esc(m.text) + '</div><button class="btn primary sm" data-ack="' + esc(m.id) + '">Supratau ✓</button></div>').join('');
}

/* Vadovo dienos kortelė */
function summaryCard(ts) {
  const doneT = ts.filter(t => t.status === DONE && t.doneAt.slice(0, 10) === S.today && t.to !== S.me.name).length;
  const open = ts.filter(t => t.status !== DONE && t.to !== S.me.name);
  const left = open.filter(t => t.due === S.today).length;
  const late = open.filter(t => t.due && t.due < S.today).length;
  const unseen = open.filter(t => t.type === 'Užduotis' && t.by === S.me.name && !t.seen).length;
  return '<div class="stat sum"><div class="nm">' + (S.me.boss ? 'Šiandien komandoje' : 'Mano paskirtos užduotys') + '</div><div class="row">' +
    '<div><div class="v grn">' + doneT + '</div><div class="l">atlikta</div></div>' +
    '<div><div class="v">' + left + '</div><div class="l">liko šiandien</div></div>' +
    '<div><div class="v ' + (late ? 'red' : '') + '">' + late + '</div><div class="l">vėluoja</div></div>' +
    '<div><div class="v ' + (unseen ? 'amb' : '') + '">' + unseen + '</div><div class="l">nematė</div></div></div></div>';
}

/* Ta pati užduotis keliems žmonėms – vadovui rodoma kaip viena kortelė */
function groupTasks(list) {
  const out = [], map = {};
  list.forEach(t => {
    if (!t.group) { out.push(t); return; }
    let g = map[t.group];
    if (!g) {
      g = map[t.group] = { isGroup: true, group: t.group, id: 'g:' + t.group, members: [], title: t.title, client: t.client, phone: t.phone,
        due: t.due, remind: t.remind, prio: t.prio, repeat: t.repeat, created: t.created, type: 'Užduotis', by: t.by, comments: 0 };
      out.push(g);
    }
    g.members.push(t);
  });
  Object.keys(map).forEach(k => {
    const g = map[k];
    const done = g.members.filter(m => m.status === DONE);
    g.doneCount = done.length;
    g.status = done.length === g.members.length ? DONE : 'Aktyvi';
    g.doneAt = done.map(m => m.doneAt).sort().pop() || '';
    g.unseen = g.members.filter(m => m.status !== DONE && !m.seen).length;
    g.comments = g.members.reduce((s, m) => s + (m.comments || 0), 0);
  });
  return out;
}

function renderPeople() {
  if (!canAssign()) return;
  $('#people').classList.toggle('hidden', S.tab === 'stats');
  const T = S.today;
  const over = n => S.tasks.filter(t => t.status !== DONE && t.due && t.due < T && (n === '*' || t.to === n)).length;
  const chip = (n, label) => {
    const o = over(n);
    return '<button class="chip ' + (S.person === n ? 'active' : '') + '" data-person="' + esc(n) + '">' + esc(label) +
      (o ? '<span class="b">' + o + '</span>' : '') + '</button>';
  };
  $('#people').innerHTML = chip('*', 'Visi') + S.users.map(u => chip(u, u === S.me.name ? 'Aš' : u)).join('');
}

function group(title, cls, arr) {
  return '<section class="group ' + cls + '"><h3 class="gtitle">' + title + '<span class="gc">' + arr.length + '</span></h3>' +
    '<div class="glist">' + arr.map(card).join('') + '</div></section>';
}

function empty(msg, ico) { return '<div class="empty"><div>' + ico + '</div>' + msg + '</div>'; }

function card(t) {
  if (t.isGroup) return groupCard(t);
  const isDone = t.status === DONE;
  const cls = isDone ? 'done' : (t.due && t.due < S.today ? 'over' : t.due === S.today ? 'today' : '');
  const meta = [];
  if (t.due && !isDone) meta.push(esc('📅 ' + fmtDue(t.due)));
  if (t.remind && !isDone) meta.push(esc('⏰ ' + t.remind.slice(11, 16)));
  if (canAssign() && t.to !== S.me.name) meta.push(esc('→ ' + t.to));
  if (t.type === 'Užduotis' && t.by !== S.me.name) meta.push(esc('👤 ' + t.by));
  if (canAssign() && t.type === 'Užduotis' && t.to !== S.me.name && !isDone) meta.push(t.seen ? '👁' : '<span class="unseen">◌ nematė</span>');
  if (S.me.boss && t.type === 'Priminimas' && t.to !== S.me.name) meta.push('asmeninis');
  if (t.repeat !== 'Ne') meta.push('🔁');
  if (t.comments) meta.push('💬 ' + t.comments);
  if (isDone) meta.push(esc('✓ ' + fmtWhen(t.doneAt)));
  return '<div class="sw" data-id="' + esc(t.id) + '"><div class="sw-bg"><span class="sw-l">✓ Atlikta</span><span class="sw-r">Rytoj →</span></div>' +
    '<div class="card ' + cls + '">' +
    '<button class="check" data-check="' + esc(t.id) + '" ' + (t.canDone ? '' : 'disabled') + '>' + (isDone ? '✓' : '') + '</button>' +
    '<div class="cbody"><div class="ctitle">' + (t.prio === 'Svarbi' ? '<span class="flag">!</span> ' : '') + esc(t.title) + '</div>' +
    (t.client ? '<div class="cclient">🏢 ' + esc(t.client) + '</div>' : '') +
    (meta.length ? '<div class="cmeta">' + meta.map(m => '<span>' + m + '</span>').join('') + '</div>' : '') + '</div>' +
    (t.phone && !isDone ? '<a class="callbtn" href="' + esc(tel(t.phone)) + '" title="Skambinti">📞</a>' : '') +
    '</div></div>';
}

function groupCard(g) {
  const isDone = g.status === DONE;
  const cls = isDone ? 'done' : (g.due && g.due < S.today ? 'over' : g.due === S.today ? 'today' : '');
  const meta = [];
  if (g.due && !isDone) meta.push(esc('📅 ' + fmtDue(g.due)));
  meta.push('<b>👥 ' + g.doneCount + '/' + g.members.length + ' atliko</b>');
  if (g.unseen && !isDone) meta.push('<span class="unseen">◌ nematė ' + g.unseen + '</span>');
  if (g.comments) meta.push('💬 ' + g.comments);
  return '<div class="sw" data-group="' + esc(g.group) + '"><div class="card ' + cls + '">' +
    '<div class="gicon">👥</div>' +
    '<div class="cbody"><div class="ctitle">' + (g.prio === 'Svarbi' ? '<span class="flag">!</span> ' : '') + esc(g.title) + '</div>' +
    (g.client ? '<div class="cclient">🏢 ' + esc(g.client) + '</div>' : '') +
    '<div class="cmeta">' + meta.map(m => '<span>' + m + '</span>').join('') + '</div>' +
    '<div class="meter"><i style="width:' + Math.round(g.doneCount / g.members.length * 100) + '%"></i></div></div></div></div>';
}

function openGroup(gid) {
  const members = S.tasks.filter(t => t.group === gid);
  if (!members.length) return closeSheet();
  const g = members[0];
  const openN = members.filter(m => m.status !== DONE).length;
  let h = '<div class="sh-head"><h2>👥 ' + esc(g.title) + '</h2><button class="icon" data-close>✕</button></div>';
  if (g.client) h += '<div class="clientbox"><div class="cn">🏢 ' + esc(g.client) + '</div></div>';
  h += '<dl class="info"><dt>Terminas</dt><dd>' + esc(g.due ? fmtDue(g.due) + ' (' + g.due + ')' : 'be termino') + '</dd>' +
    '<dt>Atliko</dt><dd>' + (members.length - openN) + ' iš ' + members.length + '</dd></dl>';
  h += '<div class="section">Kas kaip</div>' + members.slice().sort((a, b) => (a.status === DONE) - (b.status === DONE) || a.to.localeCompare(b.to, 'lt')).map(m =>
    '<div class="mrow" data-open="' + esc(m.id) + '"><span class="mn">' + esc(m.to) + '</span><span class="ms">' +
    (m.status === DONE ? '<span class="grn">✓ ' + esc(fmtWhen(m.doneAt)) + '</span>' : m.seen ? '👁 matė' : '<span class="unseen">◌ nematė</span>') +
    (m.comments ? ' · 💬 ' + m.comments : '') + '</span><span class="muted">›</span></div>').join('');
  h += '<div class="actions">' + (openN ? '<button class="btn primary" data-act="nudgeAll">⏰ Paraginti nepadariusius (' + openN + ')</button>' : '') + '</div>' +
    '<div class="actions"><button class="btn danger" data-act="delAll">Ištrinti visiems</button></div>';
  openSheet(h, async (act, btn) => {
    if (act === 'delAll' && !btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Tikrai ištrinti visiems? Spauskite dar kartą'; return; }
    btn.disabled = true;
    try {
      if (act === 'nudgeAll') { const r = await call('nudgeGroup', { group: gid }); apply(r); closeSheet(); toast('Paraginta: ' + r.nudged); }
      if (act === 'delAll') { apply(await call('deleteGroup', { group: gid })); closeSheet(); toast('Ištrinta'); }
    } catch (e) { btn.disabled = false; toast(errMsg(e)); }
  });
}

/* ---------- braukimas ---------- */
let SW = null;
function swipeReset(s) {
  if (!s) return;
  s.card.style.transition = 'transform .2s'; s.card.style.transform = '';
  s.w.classList.remove('to-done', 'to-later', 'armed');
}
$('#list').addEventListener('touchstart', e => {
  const w = e.target.closest('.sw');
  if (!w || !w.dataset.id || S.tab !== 'open' || e.touches.length > 1) { SW = null; return; }
  const t = e.touches[0];
  SW = { w: w, card: w.querySelector('.card'), x: t.clientX, y: t.clientY, dx: 0, on: false };
}, { passive: true });
$('#list').addEventListener('touchmove', e => {
  if (!SW) return;
  const t = e.touches[0];
  const dx = t.clientX - SW.x, dy = t.clientY - SW.y;
  if (!SW.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { SW = null; return; }
    if (Math.abs(dx) < 12) return;
    SW.on = true; SW.card.style.transition = 'none';
  }
  e.preventDefault();
  SW.dx = dx;
  SW.card.style.transform = 'translateX(' + dx + 'px)';
  SW.w.classList.toggle('to-done', dx > 0);
  SW.w.classList.toggle('to-later', dx < 0);
  SW.w.classList.toggle('armed', Math.abs(dx) > 90);
}, { passive: false });
$('#list').addEventListener('touchend', () => {
  const s = SW; SW = null;
  if (!s || !s.on) return;
  S.swipedAt = Date.now();
  const id = s.w.dataset.id;
  const t = find(id);
  if (s.dx > 90 && t && t.canDone) {
    s.card.style.transition = 'transform .18s'; s.card.style.transform = 'translateX(110%)';
    setTimeout(() => toggleDone(id, null), 170);
  } else if (s.dx < -90 && t && t.canEdit) {
    s.card.style.transition = 'transform .18s'; s.card.style.transform = 'translateX(-110%)';
    setTimeout(() => postpone(id, 1), 170);
  } else {
    if (s.dx < -90) toast('Vadovo paskirtos užduoties atidėti negalima');
    swipeReset(s);
  }
});
$('#list').addEventListener('touchcancel', () => { swipeReset(SW); SW = null; });

/* ---------- veiksmai ---------- */
async function toggleDone(id, comment) {
  const t = find(id); if (!t || !t.canDone) return;
  const done = t.status !== DONE;
  const prev = { status: t.status, doneAt: t.doneAt };
  t.status = done ? DONE : 'Aktyvi'; t.doneAt = done ? S.today + ' ' : '';
  closeSheet(); render();
  if (done && t.client) openNextStep(t);
  try {
    const p = { id: id, done: done };
    if (comment) p.comment = comment;
    apply(await call('done', p));
    if (done) toast('✓ Atlikta', t.repeat === 'Ne' ? { label: 'Atšaukti', fn: () => toggleDone(id) } : null);
    else toast('Grąžinta į aktyvias');
  } catch (e) { Object.assign(t, prev); render(); toast(errMsg(e)); }
}

async function postpone(id, days) {
  try {
    apply(await call('postpone', { id: id, days: days }));
    toast(days === 1 ? 'Atidėta į rytoj' : 'Atidėta ' + days + ' d.');
  } catch (e) { render(); toast(errMsg(e)); }
}

function openSheet(html, onAct) {
  $('#sheetBody').innerHTML = html; S.onAct = onAct;
  $('#sheet').classList.remove('hidden');
  document.body.classList.add('sheet-open');
  $('#sheetBody').scrollTop = 0;
}
function closeSheet() { $('#sheet').classList.add('hidden'); document.body.classList.remove('sheet-open'); S.onAct = null; S.detailId = null; }

/* ---------- užduoties kortelė ---------- */
function openDetail(id) {
  const t = find(id); if (!t) return;
  const isDone = t.status === DONE;
  const info = [];
  if (canAssign()) info.push(['Kam', t.to === S.me.name ? 'Man' : t.to]);
  if (t.by !== t.to) info.push(['Paskyrė', t.by]);
  info.push(['Terminas', t.due ? fmtDue(t.due) + ' (' + t.due + ')' : 'be termino']);
  if (t.remind) info.push(['Laikas', fmtWhen(t.remind) + (t.dur ? '–' + m2hm(tEndM(t)) : '')]);
  if (t.repeat !== 'Ne') info.push(['Kartojasi', t.repeat]);
  if (t.type === 'Užduotis' && t.by !== t.to) info.push(['Matė', t.seen ? fmtWhen(t.seen) : 'dar neatidarė']);
  info.push(['Sukurta', fmtWhen(t.created)]);
  if (isDone) info.push(['Atlikta', fmtWhen(t.doneAt)]);

  let h = '<div class="sh-head"><h2>' + (t.prio === 'Svarbi' ? '<span class="flag">!</span> ' : '') + esc(t.title) + '</h2><button class="icon" data-close>✕</button></div>';
  if (t.client || t.phone || t.email) {
    h += '<div class="clientbox">' + (t.client ? '<div class="cn">🏢 ' + esc(t.client) + '</div>' : '') +
      '<div class="small muted">' + [t.phone, t.email].filter(Boolean).map(esc).join(' · ') + '</div>' +
      '<div class="actions">' +
      (t.phone ? '<a class="btn primary sm" href="' + esc(tel(t.phone)) + '">📞 Skambinti</a><a class="btn soft sm" href="' + esc(tel(t.phone).replace('tel:', 'sms:')) + '">💬 SMS</a>' : '') +
      (t.email ? '<a class="btn soft sm" href="mailto:' + esc(t.email) + '">✉️ Rašyti</a>' : '') +
      '</div></div>';
  }
  if (t.desc) h += '<p class="desc">' + esc(t.desc) + '</p>';
  const gc = !isDone && gcalUrl(t);
  if (gc) h += '<div class="actions"><a class="btn soft sm" href="' + esc(gc) + '" target="_blank" rel="noopener">Įkelti į Google kalendorių</a></div>';
  h += '<dl class="info">' + info.map(x => '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>').join('') + '</dl>';
  if (t.canDone) {
    h += '<div class="actions">' +
      (isDone ? '<button class="btn" data-act="reopen">↺ Grąžinti į aktyvias</button>' : '<button class="btn primary" data-act="done">✓ Atlikta</button>') + '</div>';
  }
  if ((S.me.boss || t.by === S.me.name) && !isDone && t.to !== S.me.name) {
    h += '<div class="actions"><button class="btn soft" data-act="nudge">⏰ Paraginti ' + esc(t.to) + '</button></div>';
  }
  if (t.canEdit && !isDone) {
    h += '<div class="actions"><button class="btn" data-act="p1">Rytoj</button><button class="btn" data-act="p7">+7 d.</button><button class="btn" data-act="edit">✎ Redaguoti</button></div>';
  }
  h += '<div class="section">Pokalbis</div><div class="thread" id="thread"><div class="muted small">Kraunama…</div></div>' +
    '<div class="chat"><textarea id="cText" placeholder="Rašykite žinutę…"></textarea><button class="btn primary" data-act="send">➤</button></div>';
  if (t.canDelete) h += '<div class="actions"><button class="btn danger" data-act="del">Ištrinti</button></div>';
  openSheet(h, (act, btn) => detailAction(t, act, btn));
  S.detailId = id;
  call('comments', { id: id }).then(list => { if (S.detailId === id) renderThread(list); })
    .catch(e => { if (S.detailId === id) $('#thread').innerHTML = '<div class="muted small">' + esc(errMsg(e)) + '</div>'; });
}

function renderThread(list) {
  const el = $('#thread'); if (!el) return;
  el.innerHTML = list.length ? list.map(c =>
    '<div class="bub' + (c.mine ? ' mine' : '') + '"><div class="who">' + esc(c.mine ? 'Jūs' : c.who) + ' · ' + esc(fmtWhen(c.at)) + '</div>' + esc(c.text) + '</div>').join('')
    : '<div class="muted small">Žinučių dar nėra. Parašykite klausimą ar informaciją – kitas žmogus gaus pranešimą.</div>';
}

async function detailAction(t, act, btn) {
  const txt = $('#cText') ? $('#cText').value.trim() : '';
  if (act === 'done' || act === 'reopen') return toggleDone(t.id, act === 'done' ? txt : null);
  if (act === 'edit') return openForm(t);
  if (act === 'nudge') {
    btn.disabled = true;
    try { apply(await call('nudge', { id: t.id })); toast('⏰ ' + t.to + ' gavo priminimą'); call('comments', { id: t.id }).then(renderThread).catch(() => {}); }
    catch (e) { btn.disabled = false; toast(errMsg(e)); }
    return;
  }
  if (act === 'send') {
    if (!txt) return;
    btn.disabled = true;
    try {
      const r = await call('addComment', { id: t.id, text: txt });
      $('#cText').value = '';
      renderThread(r.comments); apply(r.list);
    } catch (e) { toast(errMsg(e)); }
    btn.disabled = false;
    return;
  }
  if (act === 'del' && !btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Tikrai ištrinti? Spauskite dar kartą'; return; }
  closeSheet();
  try {
    if (act === 'p1' || act === 'p7') await postpone(t.id, act === 'p1' ? 1 : 7);
    else if (act === 'del') { apply(await call('delete', { id: t.id })); toast('Ištrinta'); }
  } catch (e) { toast(errMsg(e)); }
}

/* ---------- nauja / redaguoti ---------- */
function openForm(t, preset) {
  const isNew = !t;
  S.editId = t ? t.id : null;
  const v = t ? Object.assign({}, t) : Object.assign({
    title: '', desc: '', due: S.today, remind: '', prio: 'Įprasta', repeat: 'Ne', client: '', phone: '', email: '',
    to: canAssign() && S.person !== '*' ? S.person : S.me.name
  }, preset || {});
  const head = isNew ? (canAssign() ? 'Nauja užduotis' : 'Naujas priminimas') : 'Redaguoti';
  let h = '<div class="sh-head"><h2>' + head + '</h2><button class="icon" data-close>✕</button></div>';
  if (isNew) {
    h += templatesRow();
    h += '<input type="text" id="fTitle" class="smart" maxlength="300" autocomplete="off" value="' + esc(v.title) + '" placeholder="Ką reikia padaryti?">' +
      '<div class="tip">Rašykite paprastai: <b>rytoj</b>, <b>penktadienį</b>, <b>12.05</b>, <b>10:00</b>, <b>!</b> – svarbi, <b>#klientas</b>' +
      (canAssign() ? ', <b>@vardas</b>' : '') + ', <b>kas savaitę</b>. 🎤 Galite diktuoti klaviatūros mikrofonu.</div>' +
      '<div class="preview" id="preview"></div>';
  } else {
    h += '<label>Ką reikia padaryti?</label><input type="text" id="fTitle" maxlength="300" value="' + esc(v.title) + '">';
  }
  if (canAssign() && isNew) {
    const sel = Array.isArray(v.to) ? v.to : [v.to];
    h += '<label>Kam <span class="muted small">(galima keliems)</span></label><div class="qrow" data-q="to" id="fTo"><button class="q" data-v="*">👥 Visiems</button>' +
      S.users.map(u => '<button class="q' + (sel.indexOf(u) >= 0 ? ' on' : '') + '" data-v="' + esc(u) + '">' + esc(u === S.me.name ? 'Sau' : u) + '</button>').join('') + '</div>';
  } else if (canAssign()) {
    h += '<label>Kam</label><select id="fTo" data-f>' + S.users.map(u =>
      '<option value="' + esc(u) + '"' + (u === v.to ? ' selected' : '') + '>' + esc(u === S.me.name ? u + ' (sau)' : u) + '</option>').join('') + '</select>';
  }
  h += '<label>Klientas (nebūtina)</label><input type="text" id="fClient" list="clientList" autocomplete="off" data-f value="' + esc(v.client) + '" placeholder="Įmonė ar asmuo">' +
    '<div class="row2"><div><label>Telefonas</label><input type="tel" id="fPhone" data-f value="' + esc(v.phone) + '" placeholder="+370…"></div>' +
    '<div><label>El. paštas</label><input type="email" id="fEmail" data-f value="' + esc(v.email) + '"></div></div>';
  h += '<label>Terminas</label><input type="date" id="fDue" data-f value="' + esc(v.due) + '">' +
    '<div class="qrow" data-q="due"><button class="q" data-v="0">Šiandien</button><button class="q" data-v="1">Rytoj</button>' +
    '<button class="q" data-v="mon">Pirmadienį</button><button class="q" data-v="7">Po savaitės</button><button class="q" data-v="">Be termino</button></div>';
  h += '<label>Priminti (nebūtina)</label><input type="datetime-local" id="fRemind" data-f value="' + esc((v.remind || '').replace(' ', 'T')) + '">' +
    '<div class="qrow" data-q="rem"><button class="q" data-v="09:00">9:00</button><button class="q" data-v="12:00">12:00</button>' +
    '<button class="q" data-v="15:00">15:00</button><button class="q" data-v="">Nepriminti</button></div>';
  const dur0 = v.dur || 30;
  h += '<label>Trukmė <span class="muted small">(kalendoriui)</span></label><div class="qrow" data-q="dur">' +
    DURS.map(x => '<button class="q' + (x[0] === dur0 ? ' on' : '') + '" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<input type="hidden" id="fDur" value="' + dur0 + '"><div id="busy" class="busy"></div>';
  h += '<label>Kartoti</label><select id="fRepeat" data-f>' + REPEATS.map(r => '<option' + (r === v.repeat ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>';
  h += '<label class="toggle"><input type="checkbox" id="fPrio" data-f' + (v.prio === 'Svarbi' ? ' checked' : '') + '> Svarbi užduotis</label>';
  h += '<label>Pastabos</label><textarea id="fDesc" placeholder="Papildoma informacija (nebūtina)">' + esc(v.desc) + '</textarea>';
  h += '<div class="actions"><button class="btn primary wide" data-act="save">' + (isNew ? 'Pridėti' : 'Išsaugoti') + '</button></div>';
  openSheet(h, (act, btn) => formAction(t, act, btn));

  // Rankiniu būdu pakeistų laukų greitas įrašymas nebeperrašo
  document.querySelectorAll('#sheetBody [data-f]').forEach(el => {
    el.addEventListener('input', () => { el.dataset.touched = '1'; });
    el.addEventListener('change', () => { el.dataset.touched = '1'; });
  });
  $('#fClient').addEventListener('change', fillClient);
  ['#fDue', '#fRemind'].forEach(id => { $(id).addEventListener('change', renderBusy); $(id).addEventListener('input', renderBusy); });
  if (preset) {
    [['due', '#fDue'], ['remind', '#fRemind'], ['client', '#fClient'], ['phone', '#fPhone'], ['email', '#fEmail']].forEach(k => {
      if (preset[k[0]]) $(k[1]).dataset.touched = '1';
    });
    if (preset.to && $('#fTo')) $('#fTo').dataset.touched = '1';
    if (preset.prio) $('#fPrio').dataset.touched = '1';
  }
  renderBusy();
  if (isNew) {
    S.parsed = null;
    $('#fTitle').addEventListener('input', onSmartInput);
    if (v.title) onSmartInput();
    setTimeout(() => { const f = $('#fTitle'); if (f) f.focus(); }, 60);
  }
}

function fillClient() {
  const c = S.clients.find(x => x.n.toLowerCase() === $('#fClient').value.trim().toLowerCase());
  if (!c) return;
  if (c.p && !$('#fPhone').value) $('#fPhone').value = c.p;
  if (c.e && !$('#fEmail').value) $('#fEmail').value = c.e;
}

function setIfFree(id, val) {
  const el = $(id); if (!el || el.dataset.touched) return;
  if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
}

function onSmartInput() {
  const q = parseQuick($('#fTitle').value, { today: S.today, now: new Date(), users: canAssign() ? S.users : [], clients: S.clients });
  S.parsed = q;
  setIfFree('#fDue', q.due || S.today);
  setIfFree('#fRemind', q.remind || '');
  setIfFree('#fPrio', q.prio);
  setIfFree('#fRepeat', q.repeat || 'Ne');
  if (canAssign() && q.to) setToChips(q.to === '*' ? toOthers() : [q.to]);
  setIfFree('#fClient', q.client || '');
  const c = q.client && S.clients.find(x => x.n === q.client);
  setIfFree('#fPhone', q.phone || (c && c.p) || '');
  setIfFree('#fEmail', (c && c.e) || '');
  const pv = [];
  if (q.due) pv.push('📅 ' + fmtDue(q.due));
  if (q.time) pv.push('⏰ ' + q.time);
  if (q.prio) pv.push('❗ svarbi');
  if (q.client) pv.push('🏢 ' + q.client);
  if (q.phone) pv.push('📞 ' + q.phone);
  if (q.to) pv.push(q.to === '*' ? '👥 visiems' : '👤 ' + q.to);
  if (q.repeat) pv.push('🔁 ' + q.repeat.toLowerCase());
  $('#preview').innerHTML = pv.map(x => '<span class="pv">' + esc(x) + '</span>').join('');
  renderBusy();
}

function toOthers() { return S.users.filter(u => u !== S.me.name); }

function setToChips(names, force) {
  const box = $('#fTo'); if (!box || box.tagName === 'SELECT' || (box.dataset.touched && !force)) return;
  box.querySelectorAll('.q').forEach(b => b.classList.toggle('on', b.dataset.v !== '*' && names.indexOf(b.dataset.v) >= 0));
  syncAllChip();
}

function syncAllChip() {
  const box = $('#fTo'); if (!box) return;
  const others = Array.from(box.querySelectorAll('.q')).filter(b => b.dataset.v !== '*' && b.dataset.v !== S.me.name);
  box.querySelector('.q[data-v="*"]').classList.toggle('on', others.length > 0 && others.every(b => b.classList.contains('on')));
}

function getTo() {
  const box = $('#fTo');
  if (!box) return '';
  if (box.tagName === 'SELECT') return box.value;
  const on = Array.from(box.querySelectorAll('.q.on')).map(b => b.dataset.v).filter(v => v !== '*');
  return on.length ? on : [S.me.name];
}

function quick(kind, val, btn) {
  if (kind === 'to') {
    const box = $('#fTo');
    if (val === '*') {
      const allOn = btn.classList.contains('on');
      box.querySelectorAll('.q').forEach(b => b.classList.toggle('on', !allOn && b.dataset.v !== '*' && b.dataset.v !== S.me.name));
      if (allOn) box.querySelector('.q[data-v="' + CSS.escape(S.me.name) + '"]').classList.add('on');
    } else btn.classList.toggle('on');
    syncAllChip();
    box.dataset.touched = '1';
    renderBusy();
    return;
  }
  if (kind === 'dur') {
    btn.parentElement.querySelectorAll('.q').forEach(b => b.classList.toggle('on', b === btn));
    $('#fDur').value = val;
    renderBusy();
    return;
  }
  if (kind === 'free') {
    $('#fRemind').value = ($('#fDue').value || S.today) + 'T' + val;
    $('#fRemind').dataset.touched = '1';
    renderBusy();
    return;
  }
  if (kind === 'due') {
    let d = '';
    if (val === 'mon') { const wd = dObj(S.today).getDay(); d = addD(S.today, ((8 - wd) % 7) || 7); }
    else if (val !== '') d = addD(S.today, Number(val));
    $('#fDue').value = d; $('#fDue').dataset.touched = '1';
    renderBusy();
  } else if (kind === 'rem') {
    $('#fRemind').value = val ? ($('#fDue').value || S.today) + 'T' + val : '';
    $('#fRemind').dataset.touched = '1';
    renderBusy();
  } else {
    btn.parentElement.querySelectorAll('.q').forEach(b => b.classList.toggle('on', b === btn));
    if (kind === 'stage') $('#dStage').value = val;
  }
}

async function formAction(t, act, btn) {
  if (act !== 'save') return;
  const raw = $('#fTitle').value.trim();
  const title = !t && S.parsed ? (S.parsed.title || raw) : raw;
  const p = {
    id: t ? t.id : '',
    title: title,
    desc: $('#fDesc').value.trim(),
    to: getTo(),
    client: $('#fClient').value.trim(),
    phone: $('#fPhone').value.trim(),
    email: $('#fEmail').value.trim(),
    due: $('#fDue').value,
    remind: $('#fRemind').value,
    prio: $('#fPrio').checked ? 'Svarbi' : 'Įprasta',
    repeat: $('#fRepeat').value,
    dur: $('#fRemind').value ? (Number($('#fDur').value) || 30) : 0
  };
  if (!p.title) { toast('Įrašykite, ką reikia padaryti'); $('#fTitle').focus(); return; }
  if (p.repeat !== 'Ne' && !p.due) { toast('Pasikartojančiai užduočiai reikia termino'); return; }
  btn.disabled = true;
  try {
    apply(await call('save', p));
    closeSheet(); S.tab = 'open'; render();
    toast(t ? 'Išsaugota' : (Array.isArray(p.to) && p.to.length > 1 ? 'Paskirta ' + p.to.length + ' žmonėms ✓' : 'Pridėta ✓'));
  } catch (e) { btn.disabled = false; toast(errMsg(e)); }
}

/* ---------- kitas žingsnis po atlikimo ---------- */
function openNextStep(t) {
  const who = canAssign() && t.to !== S.me.name ? t.to : S.me.name;
  let h = '<div class="sh-head"><h2>✓ Atlikta! Kitas žingsnis?</h2><button class="icon" data-close>✕</button></div>' +
    '<div class="clientbox"><div class="cn">🏢 ' + esc(t.client) + '</div><div class="small muted">Suplanuokite, kada vėl susisiekti – kad klientas nebūtų pamirštas.</div></div>' +
    '<label>Kas toliau?</label><input type="text" id="nTitle" maxlength="300" value="Perskambinti">' +
    '<div class="qrow" data-q="nsWhat"><button class="q" data-v="Perskambinti">📞 Perskambinti</button><button class="q" data-v="Išsiųsti pasiūlymą">📄 Pasiūlymas</button>' +
    '<button class="q" data-v="Susitikimas">🤝 Susitikimas</button><button class="q" data-v="Pasiteirauti dėl sprendimo">❓ Sprendimas</button></div>' +
    '<label>Kada?</label><div class="qrow" data-q="nsDue"><button class="q" data-v="1">Rytoj</button><button class="q" data-v="2">Po 2 d.</button>' +
    '<button class="q on" data-v="3">Po 3 d.</button><button class="q" data-v="7">Po savaitės</button><button class="q" data-v="14">Po 2 sav.</button><button class="q" data-v="30">Po mėn.</button></div>' +
    '<label>Priminti</label><div class="qrow" data-q="nsTime"><button class="q on" data-v="">Be laiko</button><button class="q" data-v="09:00">9:00</button>' +
    '<button class="q" data-v="11:00">11:00</button><button class="q" data-v="14:00">14:00</button><button class="q" data-v="16:00">16:00</button></div>' +
    '<div class="actions"><button class="btn primary" data-act="plan">Suplanuoti</button><button class="btn" data-act="skip">Nereikia</button></div>';
  openSheet(h, async (act, btn) => {
    if (act === 'skip') return closeSheet();
    if (act !== 'plan') return;
    const dEl = $('[data-q=nsDue] .q.on'), tEl = $('[data-q=nsTime] .q.on');
    const days = dEl ? Number(dEl.dataset.v) : 3;
    const time = tEl ? tEl.dataset.v : '';
    const due = addD(S.today, days);
    btn.disabled = true;
    try {
      apply(await call('save', {
        title: $('#nTitle').value.trim() || 'Susisiekti', to: who,
        client: t.client, phone: t.phone, email: t.email,
        due: due, remind: time ? due + 'T' + time : '', prio: 'Įprasta', repeat: 'Ne'
      }));
      closeSheet(); toast('Suplanuota: ' + fmtDue(due));
    } catch (e) { btn.disabled = false; toast(errMsg(e)); }
  });
}

/* ---------- statistika ir klientų ataskaita (vadovui) ---------- */
function statsHeader() {
  const seg = '<div class="tabs" style="margin-top:12px"><button data-sview="results" class="' + (S.statsView === 'results' ? 'active' : '') + '">📊 Rezultatai</button>' +
    '<button data-sview="clients" class="' + (S.statsView === 'clients' ? 'active' : '') + '">🏢 Pamiršti klientai</button></div>';
  const chips = S.statsView === 'results'
    ? [['week', 'Ši savaitė'], ['last', 'Praėjusi'], ['month', '30 dienų']].map(p =>
      '<button class="chip ' + (p[0] === S.statsPeriod ? 'active' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>').join('')
    : [14, 30, 60].map(d => '<button class="chip ' + (d === S.forgotDays ? 'active' : '') + '" data-fdays="' + d + '">≥ ' + d + ' d.</button>').join('');
  return seg + '<div class="chips" style="padding-top:10px">' + chips + '</div>';
}

async function loadStats(period) {
  if (period) S.statsPeriod = period;
  if (S.statsView === 'clients') return loadForgotten();
  $('#list').innerHTML = statsHeader() + '<div class="empty">Skaičiuojama…</div>';
  try {
    const r = await call('stats', { period: S.statsPeriod });
    if (S.tab !== 'stats' || S.statsView !== 'results') return;
    let h = statsHeader() + '<div class="gtitle" style="margin:8px 20px">' + esc(r.label) + ' · ' + esc(r.from.slice(5)) + '–' + esc(r.to.slice(5)) + '</div>';
    if (!r.rows.length) h += empty('Šiuo laikotarpiu duomenų nėra', '📊');
    r.rows.forEach(x => {
      h += '<div class="stat"><div class="nm">' + esc(x.name) + '</div><div class="row">' +
        '<div><div class="v grn">' + x.done + '</div><div class="l">atlikta</div></div>' +
        '<div><div class="v">' + (x.pct == null ? '–' : x.pct + '%') + '</div><div class="l">laiku</div></div>' +
        '<div><div class="v ' + (x.late ? 'red' : '') + '">' + x.late + '</div><div class="l">vėluoja</div></div>' +
        '<div><div class="v">' + x.open + '</div><div class="l">aktyvių</div></div></div>' +
        (x.pct != null ? '<div class="meter"><i style="width:' + x.pct + '%"></i></div>' : '') + '</div>';
    });
    h += dealStatsHtml(r.deals);
    $('#list').innerHTML = h;
  } catch (e) {
    if (S.tab === 'stats') $('#list').innerHTML = statsHeader() + empty(esc(errMsg(e)), '⚠️');
  }
}

async function loadForgotten() {
  $('#list').innerHTML = statsHeader() + '<div class="empty">Ieškoma…</div>';
  try {
    const r = await call('clientsReport', { days: S.forgotDays });
    if (S.tab !== 'stats' || S.statsView !== 'clients') return;
    S.forgot = r.rows;
    let h = statsHeader() + '<div class="tip" style="margin:4px 20px 10px">Klientai be suplanuoto kito žingsnio, su kuriais nebendrauta ≥ ' + r.days + ' d. Iš viso: <b>' + r.total + '</b></div>';
    if (!r.rows.length) h += empty('Pamirštų klientų nėra – puiku!', '👏');
    h += r.rows.map((c, i) => '<div class="stat fc"><div class="fc-b"><div class="nm">🏢 ' + esc(c.n) + '</div><div class="small muted">' +
      (c.last ? 'Paskutinis kontaktas prieš ' + c.ago + ' d.' + (c.who ? ' · ' + esc(c.who) : '') : 'Kontakto dar nebuvo') + '</div>' +
      '<div class="actions"><button class="btn soft sm" data-assign="' + i + '">＋ Skirti užduotį</button></div></div>' +
      (c.p ? '<a class="callbtn" href="' + esc(tel(c.p)) + '">📞</a>' : '') + '</div>').join('');
    $('#list').innerHTML = h;
  } catch (e) {
    if (S.tab === 'stats') $('#list').innerHTML = statsHeader() + empty(esc(errMsg(e)), '⚠️');
  }
}

/* ---------- nustatymai (vadovui) ---------- */
function openSettings() {
  const p = S.prefs || {};
  let h = '<div class="sh-head"><h2>⚙️ Pranešimų nustatymai</h2><button class="icon" data-close>✕</button></div>' +
    '<label class="toggle"><input type="checkbox" id="pQuiet"' + (p.quiet ? ' checked' : '') + '> 🤫 Tylus režimas</label>' +
    '<div class="tip">Pranešimai tik apie svarbius dalykus: atliktas ❗ svarbias užduotis, vėlavimus ⚠️ ir žinutes 💬. Kitos atliktos užduotys – vakaro suvestinėje.</div>' +
    '<label class="toggle"><input type="checkbox" id="pEvening"' + (p.evening !== false ? ' checked' : '') + '> 🌙 Vakaro suvestinė (~17 val.)</label>' +
    '<div class="tip">Viena žinutė: kiek atlikta šiandien, kiek liko, kas vėluoja, ko dar nematė.</div>' +
    '<div class="tip" style="margin-top:16px">📊 Mėnesio ataskaita el. paštu ateina automatiškai pirmą mėnesio darbo dieną, savaitės rezultatai – pirmadienio rytą.</div>';
  openSheet(h, () => {});
  const save = async () => {
    try { S.prefs = await call('prefs', { set: { quiet: $('#pQuiet').checked, evening: $('#pEvening').checked } }); toast('Išsaugota'); }
    catch (e) { toast(errMsg(e)); }
  };
  $('#pQuiet').onchange = save; $('#pEvening').onchange = save;
}

/* ---------- vadovo žinutė komandai ---------- */
function openBroadcast() {
  const others = S.users.filter(u => u !== S.me.name);
  let h = '<div class="sh-head"><h2>📣 Žinutė komandai</h2><button class="icon" data-close>✕</button></div>';
  h += '<label>Kam</label><select id="bTo"><option value="*">Visiems</option>' + others.map(u => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join('') + '</select>';
  h += '<label>Žinutė</label><textarea id="bText" maxlength="500" placeholder="Pvz., Rytoj 9:00 susirinkimas"></textarea>';
  h += '<p class="muted small">Ateis pranešimu į telefoną. Kas pranešimų neįsijungęs – gaus el. laišką.</p>';
  h += '<div class="actions"><button class="btn primary wide" data-act="send">Siųsti</button></div>';
  if (S.sent.length) {
    h += '<div class="section">Išsiųstos žinutės</div>' + S.sent.map(m => {
      const n = m.to.filter(x => m.read[x]).length;
      return '<details class="sent"><summary><span class="st">' + esc(m.text) + '</span><span class="sr ' + (n === m.to.length ? 'grn' : '') + '">' +
        (n === m.to.length ? '✓ ' : '') + 'Perskaitė ' + n + '/' + m.to.length + '</span></summary><div class="small muted">' + esc(fmtWhen(m.at)) + '</div>' +
        m.to.map(x => '<div class="mrow"><span class="mn">' + esc(x) + '</span><span class="ms">' + (m.read[x] ? '<span class="grn">✓ ' + esc(fmtWhen(m.read[x])) + '</span>' : '<span class="unseen">◌ dar neperskaitė</span>') + '</span></div>').join('') +
        '</details>';
    }).join('');
  }
  openSheet(h, async (act, btn) => {
    if (act !== 'send') return;
    const text = $('#bText').value.trim();
    if (!text) { toast('Įrašykite žinutę'); return; }
    btn.disabled = true;
    try {
      const r = await call('broadcast', { to: $('#bTo').value, text: text });
      apply(r);
      closeSheet();
      toast('Išsiųsta: ' + r.phone + ' į telefoną' + (r.mail ? ', ' + r.mail + ' el. paštu' : ''));
    } catch (e) { btn.disabled = false; toast(errMsg(e)); }
  });
  setTimeout(() => $('#bText').focus(), 60);
}

/* ---------- pranešimai į telefoną ---------- */
function pushConfigured() {
  return !!(CFG.VAPID_KEY && CFG.FIREBASE && CFG.FIREBASE.apiKey && typeof firebase !== 'undefined');
}

function pushState() {
  if (!pushConfigured()) return 'off';
  if (IS_IOS && !STANDALONE) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function renderPushBar() {
  const bar = $('#pushBar');
  const st = pushState();
  const dismissed = load('ut_pushbar_x') === st;
  let h = '', warn = false;
  if (st === 'default') {
    h = '<span>🔔 Įjunkite pranešimus, kad sužinotumėte apie naujas užduotis</span><button class="btn primary sm" id="pushOn">Įjungti</button>';
  } else if (st === 'ios-install' && !dismissed) {
    h = '<span>📲 Kad gautumėte pranešimus: <b>Bendrinti</b> ⬆︎ → <b>„Į pradžios ekraną“</b>, tada atidarykite programėlę iš ten.</span><button class="x" id="pushX">✕</button>';
  } else if (st === 'denied' && !dismissed) {
    warn = true;
    h = '<span>🔕 Pranešimai užblokuoti. Įjunkite juos telefono nustatymuose šiai programėlei.</span><button class="x" id="pushX">✕</button>';
  } else if (S.installEvt && !STANDALONE) {
    h = '<span>📲 Įdiekite programėlę į telefoną</span><button class="btn primary sm" id="installBtn">Įdiegti</button>';
  }
  bar.innerHTML = h;
  bar.classList.toggle('warn', warn);
  bar.classList.toggle('hidden', !h);
  const on = $('#pushOn'); if (on) on.onclick = () => enablePush(true);
  const x = $('#pushX'); if (x) x.onclick = () => { store('ut_pushbar_x', st); renderPushBar(); };
  const ib = $('#installBtn'); if (ib) ib.onclick = async () => { S.installEvt.prompt(); try { await S.installEvt.userChoice; } catch (e) {} S.installEvt = null; renderPushBar(); };
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = IS_IOS ? 'iPhone' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'Kita';
  return os + (STANDALONE ? ' (programėlė)' : ' (naršyklė)');
}

async function enablePush(ask) {
  try {
    if (pushState() !== 'granted') {
      if (!ask || pushState() !== 'default') { renderPushBar(); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { renderPushBar(); toast('Pranešimai neleisti'); return; }
    }
    const reg = await navigator.serviceWorker.ready;
    if (!firebase.apps.length) firebase.initializeApp(CFG.FIREBASE);
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: CFG.VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error('Negautas pranešimų žetonas');
    await call('subscribe', { token: token, device: deviceName() });
    store('ut_token', token);
    if (!S.msgHooked) {
      S.msgHooked = true;
      messaging.onMessage(p => {
        const n = (p && p.notification) || {};
        toast((n.title ? n.title + ': ' : '') + (n.body || ''));
        refresh();
        if (S.detailId) call('comments', { id: S.detailId }).then(renderThread).catch(() => {});
      });
    }
    if (ask) toast('🔔 Pranešimai įjungti');
  } catch (e) {
    console.error(e);
    if (ask) toast('Nepavyko įjungti pranešimų: ' + errMsg(e));
  }
  renderPushBar();
}

/* ---------- įvykiai ---------- */
$('#loginBtn').onclick = () => { const p = $('#pin').value.trim(); if (p) login(p); };
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
$('#logoutBtn').onclick = () => logout();
$('#refreshBtn').onclick = () => refresh().then(() => toast('Atnaujinta'));
$('#msgBtn').onclick = openBroadcast;
$('#setBtn').onclick = openSettings;
$('#fab').onclick = () => openForm(null);
$('#hintX').onclick = () => { store('ut_hint_x', '1'); $('#hint').classList.add('hidden'); };
$('#people').addEventListener('click', e => {
  const b = e.target.closest('[data-person]'); if (!b) return;
  S.person = b.dataset.person; render();
});
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  if (b.dataset.tab === 'clients') S.clientRows = null;
  S.tab = b.dataset.tab; render();
});
$('#list').addEventListener('click', e => {
  if (Date.now() - S.swipedAt < 400) return;
  if (e.target.closest('a')) return; // skambinti
  if (calClick(e)) return;
  if (e.target.closest('[data-later]')) { store('ut_later', load('ut_later') === '1' ? '0' : '1'); render(); return; }
  if (clientsClick(e)) return;
  const tb = e.target.closest('[data-tab]');
  if (tb) { S.tab = tb.dataset.tab; render(); return; }
  const per = e.target.closest('[data-period]');
  if (per) { loadStats(per.dataset.period); return; }
  const sv = e.target.closest('[data-sview]');
  if (sv) { S.statsView = sv.dataset.sview; loadStats(); return; }
  const fd = e.target.closest('[data-fdays]');
  if (fd) { S.forgotDays = Number(fd.dataset.fdays); loadForgotten(); return; }
  const as = e.target.closest('[data-assign]');
  if (as) {
    const c = S.forgot[Number(as.dataset.assign)];
    openForm(null, { title: '', client: c.n, phone: c.p, email: c.e, to: c.who && S.users.indexOf(c.who) >= 0 ? c.who : S.me.name });
    return;
  }
  const ack = e.target.closest('[data-ack]');
  if (ack) {
    const id = ack.dataset.ack;
    S.inbox = S.inbox.filter(m => m.id !== id); render();
    call('ackMsg', { id: id }).then(r => apply(r)).catch(err => toast(errMsg(err)));
    return;
  }
  const gw = e.target.closest('[data-group]');
  if (gw) { openGroup(gw.dataset.group); return; }
  const c = e.target.closest('[data-check]');
  if (c) { if (!c.disabled) toggleDone(c.dataset.check, null); return; }
  const w = e.target.closest('.sw');
  if (w) openDetail(w.dataset.id);
});
$('#sheet').addEventListener('click', e => {
  if (e.target.classList.contains('sheet-bg') || e.target.closest('[data-close]')) return closeSheet();
  const tp = e.target.closest('[data-tpl]');
  if (tp) { applyTemplate(Number(tp.dataset.tpl)); return; }
  const q = e.target.closest('.q');
  if (q && q.parentElement.dataset.q) {
    const kind = q.parentElement.dataset.q;
    if (kind === 'nsWhat') { $('#nTitle').value = q.dataset.v; return; }
    quick(kind, q.dataset.v, q); return;
  }
  const mo = e.target.closest('[data-open]');
  if (mo) { openDetail(mo.dataset.open); return; }
  const a = e.target.closest('[data-act]');
  if (a && S.onAct) S.onAct(a.dataset.act, a);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5 * 60 * 1000);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; if (S.me) renderPushBar(); });

/* ---------- paleidimas ---------- */
(function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.error('SW:', e));
  const saved = load('ut_pin');
  const cached = loadJSON('ut_me'), data = loadJSON('ut_data');
  if (saved && cached && data) {
    S.pin = saved; S.me = cached.me; S.users = cached.users;
    showApp(); apply(data, true);
    login(saved);
  } else if (saved) {
    $('#login').classList.add('hidden'); login(saved);
  } else {
    setTimeout(() => $('#pin').focus(), 100);
  }
})();

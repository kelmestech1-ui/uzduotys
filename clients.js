/* Klientai: sąrašas, kliento kortelė su istorija, sandoriai, užduočių šablonai */
const STAGE_LIST = ['Naujas', 'Pasiūlymas', 'Derybos', 'Laimėta', 'Pralaimėta'];

function fmtEur(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'; }
function stageCls(st) { return 'st' + Math.max(0, STAGE_LIST.indexOf(st)); }
function agoTxt(n) { return n === 0 ? 'šiandien' : n === 1 ? 'vakar' : 'prieš ' + n + ' d.'; }

/* ---------- sąrašas ---------- */
async function loadClients() {
  $('#list').innerHTML = '<div class="empty">Kraunama…</div>';
  try {
    const r = await call('clients');
    S.clientRows = r.rows;
    S.clientOpts = r.opts || S.clientOpts || { cats: [], sources: [] };
    if (S.tab === 'clients') renderClients();
  } catch (e) {
    if (S.tab === 'clients') $('#list').innerHTML = '<div class="empty"><div>⚠️</div>' + esc(errMsg(e)) + '</div>';
  }
}

function renderClients() {
  if (!S.clientRows) { loadClients(); return; }
  const f = S.cFilter || 'all';
  const chip = (k, l) => '<button class="chip ' + (f === k ? 'active' : '') + '" data-cfilter="' + k + '">' + l + '</button>';
  $('#list').innerHTML = '<div class="clients">' +
    '<div class="csearch"><input type="text" id="cSearch" placeholder="Ieškoti kliento…" autocomplete="off" value="' + esc(S.cQuery || '') + '">' +
    '<button class="btn primary sm" data-cnew="1">+ Naujas</button></div>' +
    '<div class="chips cchips">' + chip('all', 'Visi') + chip('nonext', 'Be kito žingsnio') + chip('deals', 'Su sandoriais') +
    chip('retail', 'Mažmena') + chip('wholesale', 'Didmena') + chip('order', 'Laikas užsakyti') + '</div>' +
    creatorSelect() + '<div id="cList"></div></div>';
  $('#cSearch').addEventListener('input', e => { S.cQuery = e.target.value; renderClientList(); });
  $('#cBy').addEventListener('change', e => { S.cBy = e.target.value; renderClientList(); });
  $('#cCat').addEventListener('change', e => { S.cCat = e.target.value; renderClientList(); });
  renderClientList();
}

/* Filtras „Vadybininkas“: pirmiausia aš, tada kiti pagal abėcėlę */
function creatorSelect() {
  const names = Array.from(new Set(S.clientRows.map(c => c.by).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'lt'));
  const others = names.filter(n => n !== S.me.name);
  const opt = (v, l) => '<option value="' + esc(v) + '"' + ((S.cBy || '') === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const cats = Array.from(new Set(((S.clientOpts || {}).cats || []).concat(
    S.clientRows.reduce((a, c) => a.concat((c.cats || '').split(',').map(x => x.trim()).filter(Boolean)), []))));
  const copt = (v, l) => '<option value="' + esc(v) + '"' + ((S.cCat || '') === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  return '<div class="cby"><select id="cBy" aria-label="Vadybininkas">' + opt('', 'Visi vadybininkai') + opt(S.me.name, 'Aš (' + S.me.name + ')') +
    others.map(n => opt(n, n)).join('') + '</select><select id="cCat" aria-label="Kategorija">' + copt('', 'Visos kategorijos') +
    cats.map(c => copt(c, c)).join('') + '</select></div>';
}

function renderClientList() {
  const el = $('#cList'); if (!el) return;
  const q = foldLt((S.cQuery || '').trim());
  const f = S.cFilter || 'all';
  let rows = S.clientRows.filter(c => !q || foldLt(c.n).includes(q) || (c.p || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));
  if (S.cBy) rows = rows.filter(c => c.by === S.cBy);
  if (S.cCat) rows = rows.filter(c => (c.cats || '').split(',').map(x => x.trim()).indexOf(S.cCat) >= 0);
  if (f === 'nonext') rows = rows.filter(c => !c.next).sort((a, b) => (b.ago == null ? -1 : b.ago) - (a.ago == null ? -1 : a.ago));
  else if (f === 'deals') rows = rows.filter(c => c.dealsOpen).sort((a, b) => b.dealsSum - a.dealsSum);
  else if (f === 'retail') rows = rows.filter(c => c.type === 'Mažmena').sort((a, b) => a.n.localeCompare(b.n, 'lt'));
  else if (f === 'wholesale') rows = rows.filter(c => c.type === 'Didmena').sort((a, b) => a.n.localeCompare(b.n, 'lt'));
  else if (f === 'order') rows = rows.filter(c => c.orderDue).sort((a, b) => a.n.localeCompare(b.n, 'lt'));
  else rows = rows.slice().sort((a, b) => a.n.localeCompare(b.n, 'lt'));
  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div>🔍</div>' + (q ? 'Nerasta. Spauskite „+ Naujas“, kad pridėtumėte klientą.' : 'Klientų dar nėra – jie atsiras, kai įrašysite klientą prie užduoties.') + '</div>';
    return;
  }
  el.innerHTML = '<div class="glist">' + rows.slice(0, 200).map(c => {
    const next = c.next
      ? '<span class="cnext">→ ' + esc(c.next.due ? fmtDue(c.next.due) : 'be termino') + ': ' + esc(c.next.title) + '</span>'
      : '<span class="cnone">Kitas žingsnis nesuplanuotas</span>';
    const last = c.last ? '<span>Paskutinis kontaktas ' + agoTxt(c.ago) + (c.who ? ', ' + esc(c.who) : '') + '</span>' : '';
    const by = c.by && !S.cBy ? '<span>Vadybininkas: ' + esc(c.by === S.me.name ? 'jūs' : c.by) + '</span>' : '';
    const tags = (c.type ? '<span class="tag ' + (c.type === 'Didmena' ? 'tw' : 'tr') + '">' + esc(c.type) + '</span>' : '') +
      (c.orderDue ? '<span class="tag tdue">Laikas užsakyti</span>' : '');
    return '<div class="crow" data-client="' + esc(c.n) + '"><div class="cbody"><div class="ctitle">' + esc(c.n) + tags + '</div>' +
      '<div class="cmeta">' + next + last + by + (c.dealsOpen ? '<span class="cdeal">' + c.dealsOpen + ' sand. · ' + fmtEur(c.dealsSum) + '</span>' : '') + '</div></div>' +
      (c.p ? '<a class="callbtn" href="' + esc(tel(c.p)) + '" title="Skambinti">📞</a>' : '') + '</div>';
  }).join('') + '</div>' + (rows.length > 200 ? '<p class="caltip">Rodoma 200 iš ' + rows.length + ' – patikslinkite paiešką.</p>' : '');
}

/* Paspaudimai skirtuke „Klientai“. Grąžina true, jei sutvarkyta. */
function clientsClick(e) {
  if (S.tab !== 'clients') return false;
  const fl = e.target.closest('[data-cfilter]');
  if (fl) { S.cFilter = fl.dataset.cfilter; renderClients(); return true; }
  if (e.target.closest('[data-cnew]')) { openNewClient(); return true; }
  const row = e.target.closest('[data-client]');
  if (row) { openClient(row.dataset.client); return true; }
  return false;
}

/* ---------- kliento kortelė ---------- */
async function openClient(name) {
  openSheet('<div class="sh-head"><h2>' + esc(name) + '</h2><button class="icon" data-close>✕</button></div><div class="muted">Kraunama…</div>', () => {});
  S.cardName = name;
  try {
    const d = await call('client', { name: name });
    if (S.cardName === name) renderClientCard(d);
  } catch (e) { toast(errMsg(e)); closeSheet(); }
}

function renderClientCard(d) {
  S.card = d; S.cardName = d.client.n;
  const c = d.client;
  let h = '<div class="sh-head"><h2>' + esc(c.n) + '</h2><button class="icon" data-close>✕</button></div>';
  const tags = [c.type, c.cats, c.src ? 'Šaltinis: ' + c.src : ''].filter(Boolean);
  h += '<div class="clientbox">' + (tags.length ? '<div class="ctags">' + tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>' : '') +
    '<div class="small muted">' + ([c.p, c.e].filter(Boolean).map(esc).join(' · ') || 'Kontaktų nėra') + '</div>' +
    (c.code || c.vat || c.addr ? '<div class="cco">' + [c.code ? 'Įm. k. ' + esc(c.code) : '', c.vat ? 'PVM ' + esc(c.vat) : ''].filter(Boolean).join(' · ') +
      (c.addr ? '<br><a href="https://maps.google.com/?q=' + encodeURIComponent(c.addr) + '" target="_blank" rel="noopener">📍 ' + esc(c.addr) + '</a>' : '') + '</div>' : '') +
    '<div class="actions">' +
    (c.p ? '<a class="btn primary sm" href="' + esc(tel(c.p)) + '">📞 Skambinti</a><a class="btn soft sm" href="' + esc(tel(c.p).replace('tel:', 'sms:')) + '">💬 SMS</a>' : '') +
    (c.e ? '<a class="btn soft sm" href="mailto:' + esc(c.e) + '">✉️ Rašyti</a>' : '') +
    '<button class="btn soft sm" data-act="editc">✎ Duomenys</button></div></div>';
  if (c.contacts && c.contacts.length) {
    h += '<div class="section">Kontaktiniai asmenys</div>' + c.contacts.map(k =>
      '<div class="ctrow-v"><div class="cbody"><div class="htitle">' + esc(k.n || '—') + (k.r ? ' <span class="muted small">' + esc(k.r) + '</span>' : '') + '</div>' +
      '<div class="cmeta">' + [k.p, k.e].filter(Boolean).map(esc).map(x => '<span>' + x + '</span>').join('') + '</div></div>' +
      (k.p ? '<a class="callbtn" href="' + esc(tel(k.p)) + '">📞</a>' : '') + (k.e ? '<a class="callbtn" href="mailto:' + esc(k.e) + '">✉️</a>' : '') + '</div>').join('');
  }
  if (c.cycle || c.type === 'Didmena') {
    const ago = c.lastOrder ? Math.round((dObj(S.today) - dObj(c.lastOrder)) / 864e5) : null;
    const due = c.cycle && ago != null && ago >= c.cycle;
    h += '<div class="section">Užsakymai</div><div class="rhythm' + (due ? ' due' : '') + '">' +
      (c.cycle ? 'Įprastai užsako kas <b>' + c.cycle + ' d.</b>' : 'Užsakymo ciklas nenustatytas (✎ Duomenys)') +
      '<br>' + (c.lastOrder ? 'Paskutinis užsakymas: <b>' + esc(fmtDue(c.lastOrder)) + '</b> (' + agoTxt(ago) + ')' : 'Užsakymų dar neužregistruota') +
      (due ? '<br><b>Laikas paklausti dėl užsakymo</b>' : '') +
      '<div class="actions"><button class="btn soft sm" data-act="ordered">✓ Užsakė šiandien</button></div></div>';
  }

  h += '<div class="section">Nauja užduotis su šiuo klientu</div><div class="qrow tplbtns">' +
    (d.templates || []).map((t, i) => '<button class="q" data-act="tpl" data-i="' + i + '">' + esc(t.n) + '</button>').join('') +
    '<button class="q" data-act="newtask">+ Kita…</button></div>';

  h += '<div class="section">Suplanuota</div>' + (d.open.length ? d.open.map(t => histRow(t, true)).join('') :
    '<div class="cnone-box">Kitas žingsnis nesuplanuotas – pasirinkite šabloną aukščiau.</div>');

  h += '<div class="section sec-row">Sandoriai <button class="btn soft sm" data-act="newdeal">+ Naujas sandoris</button></div>';
  h += d.deals.length ? d.deals.map((x, i) =>
    '<div class="deal" ' + (x.canEdit ? 'data-act="deal" data-i="' + i + '"' : '') + '><div class="cbody"><div class="ctitle">' + esc(x.title) + '</div>' +
    '<div class="cmeta"><span>' + esc(x.owner) + '</span><span>atnaujinta ' + esc(x.updated ? fmtDue(x.updated) : '') + '</span>' +
    (x.deposit ? '<span>avansas ' + fmtEur(x.deposit) + '</span>' : '') +
    (x.delivery && x.stage !== 'Pralaimėta' ? '<span>pristatymas ' + esc(fmtDue(x.delivery)) + '</span>' : '') +
    (x.validTo && (x.stage === 'Pasiūlymas' || x.stage === 'Derybos') ? '<span class="' + (x.validTo < S.today ? 'late' : '') + '">galioja iki ' + esc(fmtDue(x.validTo)) + '</span>' : '') +
    (x.reason ? '<span>priežastis: ' + esc(x.reason) + '</span>' : '') + '</div></div>' +
    '<div class="dright"><b>' + fmtEur(x.amount) + '</b><span class="stage ' + stageCls(x.stage) + '">' + esc(x.stage) + '</span></div></div>').join('')
    : '<div class="busy-none">Sandorių nėra.</div>';

  h += '<div class="section">Istorija</div>' + (d.history.length ? d.history.map(t => histRow(t, false)).join('') :
    '<div class="busy-none">Atliktų užduočių su šiuo klientu dar nėra.</div>');
  openSheet(h, (act, btn) => clientCardAction(act, btn));
}

function histRow(t, open) {
  const when = open ? (t.due ? fmtDue(t.due) + (t.remind ? ' ' + t.remind.slice(11, 16) : '') : 'be termino') : fmtWhen(t.doneAt);
  return '<div class="hrow' + (t.canOpen ? '" data-open="' + esc(t.id) : '') + '"><div class="hwhen' + (open && t.due && t.due < S.today ? ' late' : '') + '">' + esc(when) + '</div>' +
    '<div class="cbody"><div class="htitle">' + (open ? '' : '✓ ') + esc(t.title) + '</div><div class="cmeta"><span>' + esc(t.to) + '</span>' +
    (t.lastComment ? '<span class="hcom">💬 ' + esc(t.lastComment) + '</span>' : '') + '</div></div></div>';
}

function tplPreset(tp, c) {
  const due = addD(S.today, tp.days || 0);
  return {
    title: tp.text, client: c.n, phone: c.p, email: c.e, due: due,
    remind: tp.time ? due + 'T' + tp.time : '', dur: tp.dur || 30, prio: tp.prio ? 'Svarbi' : 'Įprasta', to: S.me.name
  };
}

async function clientCardAction(act, btn) {
  const d = S.card, c = d.client;
  if (act === 'tpl') return openForm(null, tplPreset(d.templates[Number(btn.dataset.i)], c));
  if (act === 'newtask') return openForm(null, { client: c.n, phone: c.p, email: c.e, to: S.me.name });
  if (act === 'newdeal') return openDeal(null, c.n);
  if (act === 'deal') return openDeal(d.deals[Number(btn.dataset.i)], c.n);
  if (act === 'editc') return openClientEdit(d);
  if (act === 'ordered') {
    btn.disabled = true;
    try { renderClientCard(await call('saveClient', { name: c.n, orderedToday: true })); S.clientRows = null; toast('Užsakymas užregistruotas'); }
    catch (e) { btn.disabled = false; toast(errMsg(e)); }
  }
}

/* ---------- kliento duomenų forma ---------- */
function chipsHtml(q, list, sel, multi) {
  const on = v => multi ? sel.indexOf(v) >= 0 : sel === v;
  return '<div class="qrow" data-q="' + q + '"' + (multi ? ' data-multi="1"' : '') + '>' +
    list.map(v => '<button class="q' + (on(v) ? ' on' : '') + '" data-v="' + esc(v) + '">' + esc(v) + '</button>').join('') + '</div>';
}
function chipVals(q) { return Array.from(document.querySelectorAll('[data-q="' + q + '"] .q.on')).map(b => b.dataset.v); }

function contactRow(k) {
  k = k || {};
  return '<div class="ctrow"><div class="row2"><div><input type="text" class="ck-n" placeholder="Vardas" value="' + esc(k.n) + '"></div>' +
    '<div><input type="text" class="ck-r" placeholder="Pareigos" value="' + esc(k.r) + '"></div></div>' +
    '<div class="row2"><div><input type="tel" class="ck-p" placeholder="Telefonas" value="' + esc(k.p) + '"></div>' +
    '<div><input type="email" class="ck-e" placeholder="El. paštas" value="' + esc(k.e) + '"></div></div>' +
    '<button class="x ck-x" data-act="rmc" title="Pašalinti">✕</button></div>';
}

function openClientEdit(d) {
  const c = d.client, o = d.opts || {};
  const cats = (c.cats || '').split(',').map(x => x.trim()).filter(Boolean);
  let h = '<div class="sh-head"><h2>' + esc(c.n) + '</h2><button class="icon" data-close>✕</button></div>' +
    '<div class="row2"><div><label>Telefonas</label><input type="tel" id="ccPhone" value="' + esc(c.p) + '"></div>' +
    '<div><label>El. paštas</label><input type="email" id="ccEmail" value="' + esc(c.e) + '"></div></div>' +
    '<label>Tipas</label>' + chipsHtml('ctype', ['Mažmena', 'Didmena'], c.type || '') +
    '<label>Kategorija <span class="muted small">(galima kelias)</span></label>' + chipsHtml('ccats', o.cats || [], cats, true) +
    '<label>Iš kur atėjo</label>' + chipsHtml('csrc', o.sources || [], c.src || '') +
    '<div class="section">Įmonės duomenys</div>' +
    '<div class="row2"><div><label>Įmonės kodas</label><input type="text" id="ccCode" inputmode="numeric" value="' + esc(c.code) + '"></div>' +
    '<div><label>PVM kodas</label><input type="text" id="ccVat" value="' + esc(c.vat) + '"></div></div>' +
    '<label>Adresas</label><input type="text" id="ccAddr" value="' + esc(c.addr) + '">' +
    '<label>Įprastai užsako kas … dienų <span class="muted small">(didmenai; 0 – nesekti)</span></label>' +
    '<div class="qrow" data-q="ccycle">' + [0, 7, 14, 30, 45, 60, 90].map(n =>
      '<button class="q' + ((c.cycle || 0) === n ? ' on' : '') + '" data-v="' + n + '">' + (n ? n + ' d.' : 'Nesekti') + '</button>').join('') + '</div>' +
    '<div class="section">Kontaktiniai asmenys</div><div id="ccList">' + (c.contacts || []).map(contactRow).join('') + '</div>' +
    '<button class="btn soft sm" data-act="addc">+ Pridėti asmenį</button>' +
    '<div class="actions"><button class="btn primary" data-act="savec">Išsaugoti</button><button class="btn" data-act="back">Atgal</button></div>';
  openSheet(h, async (a, b) => {
    if (a === 'back') return renderClientCard(d);
    if (a === 'addc') { $('#ccList').insertAdjacentHTML('beforeend', contactRow()); return; }
    if (a === 'rmc') { b.closest('.ctrow').remove(); return; }
    if (a !== 'savec') return;
    const contacts = Array.from(document.querySelectorAll('#ccList .ctrow')).map(r => ({
      n: r.querySelector('.ck-n').value.trim(), r: r.querySelector('.ck-r').value.trim(),
      p: r.querySelector('.ck-p').value.trim(), e: r.querySelector('.ck-e').value.trim()
    }));
    b.disabled = true;
    try {
      renderClientCard(await call('saveClient', {
        name: c.n, phone: $('#ccPhone').value.trim(), email: $('#ccEmail').value.trim(),
        type: chipVals('ctype')[0] || '', cats: chipVals('ccats'), src: chipVals('csrc')[0] || '',
        code: $('#ccCode').value.trim(), vat: $('#ccVat').value.trim(), addr: $('#ccAddr').value.trim(),
        cycle: Number(chipVals('ccycle')[0] || 0), contacts: contacts
      }));
      S.clientRows = null; toast('Išsaugota');
    } catch (e) { b.disabled = false; toast(errMsg(e)); }
  });
}

/* ---------- naujas klientas ---------- */
function openNewClient() {
  let h = '<div class="sh-head"><h2>Naujas klientas</h2><button class="icon" data-close>✕</button></div>' +
    '<label>Pavadinimas arba vardas</label><input type="text" id="ncName" value="' + esc(S.cQuery || '') + '">' +
    '<div class="row2"><div><label>Telefonas</label><input type="tel" id="ncPhone" placeholder="+370…"></div>' +
    '<div><label>El. paštas</label><input type="email" id="ncEmail"></div></div>' +
    '<label>Tipas</label>' + chipsHtml('ctype', ['Mažmena', 'Didmena'], '') +
    '<label>Iš kur atėjo</label>' + chipsHtml('csrc', ((S.clientOpts || {}).sources) || [], '') +
    '<div class="actions"><button class="btn primary wide" data-act="save">Pridėti klientą</button></div>';
  openSheet(h, async (a, b) => {
    if (a !== 'save') return;
    const name = $('#ncName').value.trim();
    if (!name) { toast('Įrašykite pavadinimą'); return; }
    b.disabled = true;
    try {
      const d = await call('saveClient', { name: name, phone: $('#ncPhone').value.trim(), email: $('#ncEmail').value.trim(),
        type: chipVals('ctype')[0] || '', src: chipVals('csrc')[0] || '' });
      S.clientRows = null; S.cQuery = '';
      renderClientCard(d);
      if (S.tab === 'clients') loadClients();
    } catch (e) { b.disabled = false; toast(errMsg(e)); }
  });
  setTimeout(() => $('#ncName').focus(), 60);
}

/* ---------- sandoris ---------- */
function openDeal(x, client) {
  const st = x ? x.stage : 'Naujas';
  let h = '<div class="sh-head"><h2>' + (x ? 'Sandoris' : 'Naujas sandoris') + '</h2><button class="icon" data-close>✕</button></div>' +
    '<div class="clientbox"><div class="cn">' + esc(client) + '</div></div>' +
    '<label>Kas parduodama</label><input type="text" id="dTitle" value="' + esc(x ? x.title : '') + '" placeholder="Pvz., Husqvarna TE 300 + apranga">' +
    '<label>Suma, €</label><input type="text" id="dAmount" inputmode="decimal" value="' + (x && x.amount ? x.amount : '') + '" placeholder="0">' +
    '<label>Etapas</label><div class="qrow stages" data-q="stage">' + STAGE_LIST.map(s =>
      '<button class="q ' + stageCls(s) + (s === st ? ' on' : '') + '" data-v="' + s + '">' + s + '</button>').join('') + '</div>' +
    '<input type="hidden" id="dStage" value="' + esc(st) + '">' +
    '<div id="dReasonBox"' + (st === 'Pralaimėta' ? '' : ' class="hidden"') + '><label>Kodėl pralaimėta?</label>' +
    chipsHtml('dreason', ((S.card || {}).opts || {}).reasons || [], x ? x.reason || '' : '') + '</div>' +
    '<div id="dValidBox"' + (st === 'Pasiūlymas' || st === 'Derybos' ? '' : ' class="hidden"') + '><label>Pasiūlymas galioja iki</label>' +
    '<input type="date" id="dValid" value="' + esc(x ? x.validTo || '' : '') + '">' +
    '<div class="qrow" data-q="dvalid"><button class="q" data-v="7">+7 d.</button><button class="q" data-v="14">+14 d.</button><button class="q" data-v="30">+30 d.</button></div></div>' +
    '<div class="row2"><div><label>Avansas, €</label><input type="text" id="dDeposit" inputmode="decimal" value="' + (x && x.deposit ? x.deposit : '') + '" placeholder="0"></div>' +
    '<div><label>Pristatymo data</label><input type="date" id="dDelivery" value="' + esc(x ? x.delivery || '' : '') + '"></div></div>' +
    '<div class="tip">Nurodžius pristatymo datą ar pasiūlymo galiojimą, jūsų darbuose atsiras priminimai.</div>';
  if (S.me.boss) {
    const owner = x ? x.owner : S.me.name;
    h += '<label>Atsakingas</label><select id="dOwner">' + S.users.map(u => '<option' + (u === owner ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '</select>';
  }
  h += '<div class="actions"><button class="btn primary" data-act="save">Išsaugoti</button><button class="btn" data-act="back">Atgal į klientą</button></div>' +
    (x ? '<div class="actions"><button class="btn danger" data-act="del">Ištrinti sandorį</button></div>' : '');
  openSheet(h, async (a, b) => {
    if (a === 'back') return renderClientCard(S.card);
    if (a === 'del' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tikrai ištrinti? Spauskite dar kartą'; return; }
    if (a !== 'save' && a !== 'del') return;
    b.disabled = true;
    try {
      let d;
      if (a === 'del') d = await call('deleteDeal', { id: x.id });
      else {
        const p = { id: x ? x.id : '', client: client, title: $('#dTitle').value.trim(), amount: $('#dAmount').value, stage: $('#dStage').value,
          reason: chipVals('dreason')[0] || '', validTo: $('#dValid').value, deposit: $('#dDeposit').value, delivery: $('#dDelivery').value };
        if (p.stage === 'Pralaimėta' && !p.reason) { b.disabled = false; toast('Pasirinkite, kodėl pralaimėta'); return; }
        if (!p.title) { b.disabled = false; toast('Įrašykite, kas parduodama'); return; }
        if ($('#dOwner')) p.owner = $('#dOwner').value;
        d = await call('saveDeal', p);
      }
      S.clientRows = null;
      renderClientCard(d);
      toast(a === 'del' ? 'Ištrinta' : ($('#dStage') && $('#dStage').value === 'Laimėta' ? '🏆 Sveikiname!' : 'Išsaugota'));
    } catch (e) { b.disabled = false; toast(errMsg(e)); }
  });
}

/* ---------- šablonai formoje ---------- */
function templatesRow() {
  if (!S.templates || !S.templates.length) return '';
  return '<div class="tplrow">' + S.templates.map((t, i) => '<button class="tpl" data-tpl="' + i + '">' + esc(t.n) + '</button>').join('') + '</div>';
}

function applyTemplate(i) {
  const t = S.templates[i]; if (!t) return;
  const due = addD(S.today, t.days || 0);
  $('#fTitle').value = t.text;
  $('#fDue').value = due; $('#fDue').dataset.touched = '1';
  $('#fRemind').value = t.time ? due + 'T' + t.time : ''; $('#fRemind').dataset.touched = '1';
  $('#fPrio').checked = !!t.prio; $('#fPrio').dataset.touched = '1';
  if (t.dur) {
    $('#fDur').value = t.dur;
    document.querySelectorAll('[data-q=dur] .q').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === t.dur));
  }
  onSmartInput();
  $('#fTitle').focus();
}

/* ---------- sandoriai statistikoje (vadovui) ---------- */
function dealStatsHtml(ds) {
  if (!ds) return '';
  const pipeSum = ds.pipe.reduce((a, p) => a + p.sum, 0);
  let h = '<div class="stat"><div class="nm">Atviri sandoriai · ' + fmtEur(pipeSum) + '</div>' +
    ds.pipe.map(p => '<div class="pipe"><span class="stage ' + stageCls(p.stage) + '">' + p.stage + '</span><span>' + p.count + '</span><b>' + fmtEur(p.sum) + '</b></div>').join('') + '</div>';
  if (ds.sources && ds.sources.length) {
    h += '<div class="stat"><div class="nm">Iš kur ateina pirkėjai (laimėti)</div>' + ds.sources.map(x =>
      '<div class="pipe"><span class="pn">' + esc(x.src) + '</span><span>' + x.count + '</span><b>' + fmtEur(x.sum) + '</b></div>').join('') + '</div>';
  }
  if (ds.reasons && ds.reasons.length) {
    const tot = ds.reasons.reduce((a, r) => a + r.count, 0);
    h += '<div class="stat"><div class="nm">Kodėl pralaimime</div>' + ds.reasons.map(x =>
      '<div class="pipe"><span class="pn">' + esc(x.reason) + '</span><span>' + x.count + '</span><b>' + Math.round(x.count / tot * 100) + ' %</b></div>').join('') + '</div>';
  }
  if (ds.people.length) {
    h += '<div class="stat"><div class="nm">Uždaryti per laikotarpį</div>' + ds.people.map(p =>
      '<div class="pipe"><span class="pn">' + esc(p.name) + '</span><span>🏆 ' + p.won + (p.lost ? ' · ✕ ' + p.lost : '') + '</span><b>' + fmtEur(p.wonSum) + '</b></div>').join('') + '</div>';
  }
  return h;
}

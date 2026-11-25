/* Greitas įrašymas: iš sakinio išrenka terminą, laiką, svarbą, klientą, telefoną, atsakingą ir kartojimą.
   Pvz.: „Paskambinti #Medis rytoj 10:00 !“, „Pasiūlymas @Jonas iki penktadienio“, „Ataskaita kas pirmadienį 9 val.“ */
(function (root) {
  const FOLD = { 'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's', 'ų': 'u', 'ū': 'u', 'ž': 'z' };
  const fold = s => s.toLowerCase().replace(/[ąčęėįšųūž]/g, c => FOLD[c]);
  const WD = ['sekmadien', 'pirmadien', 'antradien', 'treciadien', 'ketvirtadien', 'penktadien', 'sestadien'];
  const MONTHS = ['sausio', 'vasario', 'kovo', 'balandzio', 'geguzes', 'birzelio', 'liepos', 'rugpjucio', 'rugsejo', 'spalio', 'lapkricio', 'gruodzio'];
  const WD_RE = '(' + WD.join('|') + ')[a-z]*';

  function pad(n) { return String(n).padStart(2, '0'); }
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function add(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return ds(d); }
  function addMonth(s) { const d = parseDay(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ds(d); }
  function nextWd(today, wd, allowToday) {
    let diff = (wd - parseDay(today).getDay() + 7) % 7;
    if (diff === 0 && !allowToday) diff = 7;
    return add(today, diff);
  }
  function validDate(y, m, d) { const x = new Date(y, m - 1, d); return x.getMonth() === m - 1 && x.getDate() === d ? ds(x) : ''; }
  function future(today, m, d) {
    const y = Number(today.slice(0, 4));
    let s = validDate(y, m, d);
    if (s && s < today) s = validDate(y + 1, m, d);
    return s;
  }

  function parseQuick(text, opt) {
    opt = opt || {};
    const today = opt.today;
    const now = opt.now || new Date();
    let orig = String(text || '');
    let f = fold(orig);
    const r = { title: '', due: '', time: '', remind: '', prio: false, to: '', repeat: '', client: '', phone: '' };

    // Randa šabloną sulankstytame tekste ir išpjauna tą pačią vietą iš originalo
    function take(re) {
      const m = re.exec(f);
      if (!m) return null;
      const s = m.index, e = s + m[0].length;
      const o = orig.slice(s, e);
      orig = orig.slice(0, s) + ' ' + orig.slice(e);
      f = f.slice(0, s) + ' ' + f.slice(e);
      m.orig = o;
      return m;
    }
    let m;

    // Kartojimas
    if ((m = take(new RegExp('\\bkas\\s+' + WD_RE)))) { r.repeat = 'Kas savaitę'; r.due = nextWd(today, WD.indexOf(m[1]), true); }
    else if ((m = take(/\b(kasdien[a-z]*|kas\s+dien[a-z]*)/))) r.repeat = 'Kasdien';
    else if ((m = take(/\bdarbo\s+dienomis\b/))) r.repeat = 'Darbo dienomis';
    else if ((m = take(/\bkas\s+savait[a-z]*/))) r.repeat = 'Kas savaitę';
    else if ((m = take(/\bkas\s+menes[a-z]*/))) r.repeat = 'Kas mėnesį';

    // Klientas: #Medis arba #"UAB Medis"
    if ((m = take(/#"([^"]+)"|#([^\s#@!]+)/))) {
      const raw = m.orig.replace(/^#"?|"$/g, '').replace(/[,.;:]+$/, '');
      const list = opt.clients || [];
      const k = fold(raw);
      const hit = list.find(c => fold(c.n) === k) || list.find(c => fold(c.n).startsWith(k)) || list.find(c => fold(c.n).includes(k));
      r.client = hit ? hit.n : raw;
      if (hit && hit.p) r.phone = hit.p;
    }

    // Atsakingas: @Jonas
    if ((m = take(/@([^\s#@!,]+)/))) {
      const k = fold(m.orig.slice(1));
      if (/^vis/.test(k) && (opt.users || []).length) r.to = '*';
      else {
        const u = (opt.users || []).find(n => fold(n).startsWith(k));
        if (u) r.to = u;
      }
    }

    // Telefonas
    if ((m = take(/(?:\+370|\b8)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{3}\b/))) r.phone = m.orig.trim();

    // Laikas: 10:00, 9.30 val., 10 val.
    if ((m = take(/\b(?:apie\s+|ties\s+|nuo\s+)?(\d{1,2}):(\d{2})\b/)) && +m[1] < 24 && +m[2] < 60) r.time = pad(+m[1]) + ':' + m[2];
    else if ((m = take(/\b(?:apie\s+|ties\s+)?(\d{1,2})(?:[.:](\d{2}))?\s*val[a-z]*\.?/)) && +m[1] < 24) r.time = pad(+m[1]) + ':' + (m[2] || '00');

    // Data
    const P = '\\b(?:iki\\s+|ne\\s+veliau\\s+kaip\\s+)?';
    if (!r.due) {
      if (take(new RegExp(P + 'siandien[a-z]*'))) r.due = today;
      else if (take(new RegExp(P + 'rytoj[a-z]*'))) r.due = add(today, 1);
      else if (take(new RegExp(P + 'poryt[a-z]*'))) r.due = add(today, 2);
      else if ((m = take(/\b(?:po|per)\s+(\d{1,3})\s*(?:dien[a-z]*|d\.?)(?=\s|$|[,;])/))) r.due = add(today, +m[1]);
      else if ((m = take(/\b(?:po|per)\s+(\d{1,2})\s*sav[a-z]*\.?/))) r.due = add(today, 7 * m[1]);
      else if (take(/\b(?:po|per)\s+savait[a-z]*/)) r.due = add(today, 7);
      else if (take(/\b(?:po|per)\s+menes[a-z]*/)) r.due = addMonth(today);
      else if (take(/\b(?:kit[a-z]*|ateinanci[a-z]*)\s+savait[a-z]*/)) r.due = nextWd(today, 1, false);
      else if ((m = take(new RegExp(P + '(?:kit[a-z]*\\s+|ateinant[a-z]*\\s+)?' + WD_RE)))) r.due = nextWd(today, WD.indexOf(m[1]), false);
      else if ((m = take(new RegExp(P + '(' + MONTHS.join('|') + ')\\s+(\\d{1,2})(?:\\s*d\\.?)?')))) r.due = future(today, MONTHS.indexOf(m[1]) + 1, +m[2]);
      else if ((m = take(new RegExp(P + '(\\d{1,2})\\s*d\\.?\\s+(' + MONTHS.join('|') + ')')))) r.due = future(today, MONTHS.indexOf(m[2]) + 1, +m[1]);
      else if ((m = take(new RegExp(P + '(\\d{4})-(\\d{2})-(\\d{2})\\b')))) r.due = validDate(+m[1], +m[2], +m[3]);
      else if ((m = take(new RegExp(P + '(\\d{1,2})\\.(\\d{1,2})\\b(?!\\.\\d)')))) r.due = future(today, +m[2], +m[1]);
      else if ((m = take(new RegExp(P + '(\\d{1,2})-(\\d{1,2})\\b')))) r.due = future(today, +m[1], +m[2]);
    }

    // Svarba
    if (take(/(?:^|\s)!+(?=\s|$)|!+\s*$/) || take(/\bsvarbu[a-z]*\b/)) r.prio = true;

    // Laikas be datos – šiandien, jei dar nepraėjo, kitaip rytoj
    if (r.time && !r.due) {
      const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
      r.due = r.time > hm ? today : add(today, 1);
    }
    if (r.repeat && !r.due) r.due = today;
    if (r.time && r.due) r.remind = r.due + 'T' + r.time;

    r.title = orig.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '').trim();
    let prev;
    do { prev = r.title; r.title = r.title.replace(/\s+(su|dėl|del|iki|nuo|pas|apie|ties|ir)$/i, '').replace(/[\s,;:-]+$/, ''); } while (r.title !== prev);
    if (r.title) r.title = r.title.charAt(0).toUpperCase() + r.title.slice(1);
    return r;
  }

  root.parseQuick = parseQuick;
  root.foldLt = fold;
})(typeof self !== 'undefined' ? self : this);

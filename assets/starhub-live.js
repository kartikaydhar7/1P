/* ============================================================
   Live data layer.

   The dashboard ships with an embedded snapshot so it paints
   instantly, then re-derives the same structure in the browser
   from the Google Sheet's CSV export. buildData() below is a
   direct port of build_data.py — the two must agree exactly.
   ============================================================ */
/* ---------------- data source ----------------
   In production the page talks to /api/sheet, a serverless proxy that holds the
   spreadsheet id in SHEET_ID and caches at the edge — so the id never reaches
   the browser and N viewers cost one upstream read per minute instead of N.

   Passing ?sheet=<spreadsheetId> bypasses the proxy and reads Google directly,
   which is how the file works when opened from disk or served statically.     */
const TAB_GID = { accounts: '0', clientGiven: '69515110', contacts: '543259789' };
const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const DIRECT_SHEET = Q.get('sheet');
const REFRESH_MS = (() => {
  const s = parseInt(Q.get('refresh') || '', 10);
  return Number.isFinite(s) ? Math.min(Math.max(s, 15), 3600) * 1000 : 60000;
})();
const sourceUrl = tab => DIRECT_SHEET
  ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(DIRECT_SHEET)}/export?format=csv&gid=${TAB_GID[tab]}`
  : `/api/sheet?tab=${tab}`;
const DIRECT = !!DIRECT_SHEET;

/* ---------------- CSV ---------------- */
/* RFC4180: quoted fields may contain commas, newlines and doubled quotes.
   The signal narratives contain all three, so this cannot be a split(','). */
function parseCSV(text){
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const n = text.length;
  while(i < n){
    const c = text[i];
    if(quoted){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if(c === '"'){ quoted = true; i++; continue; }
    if(c === ','){ row.push(field); field = ''; i++; continue; }
    if(c === '\r'){ i++; continue; }
    if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  // drop wholly blank lines, matching the Python loader
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* ---------------- field helpers (ported 1:1) ---------------- */
const RX_PLACE = /^(unknown|#ref!?|#n\/?a|n\/?a|na|null|none|nil|tbd|-+|\.+)$/i;
const RX_NEG   = /^\s*[-*\s]*\**\s*(no\b|none\b|not\b|there (are|is) no|no (clear|public|direct|confirmed|specific|evidence|signal|indication))/i;

const L_clean = v => { const t = (v==null?'':String(v)).trim(); return RX_PLACE.test(t) ? '' : t; };
function L_normTxt(v){
  const t = L_clean(v);
  if(!t || t.length < 12) return '';
  return RX_NEG.test(t) ? '' : t;
}
function L_num(v){
  const t = L_clean(v).replace(/,/g,'');
  if(!t) return null;
  const f = Number(t);
  return Number.isFinite(f) ? f : null;
}
const L_title = s => { const t = L_clean(s); return t || 'Unknown'; };

const L_BANDS = ['1 - 10','11 - 50','51 - 200','201 - 500','501 - 1000','1001 - 5000','5001 - 10000','10001+'];
const L_BAND_FIX = {'01-oct':'1 - 10','1-10':'1 - 10','10':'1 - 10','nov-50':'11 - 50','11-50':'11 - 50','50':'11 - 50',
  '51-200':'51 - 200','201-500':'201 - 500','501-1000':'501 - 1000','1001-5000':'1001 - 5000',
  '5001-10000':'5001 - 10000','10001-50':'10001+','10001-50000':'10001+'};
function L_band(v){
  const t = L_clean(v);
  if(!t) return 'Unknown';
  const k = t.toLowerCase().replace(/ /g,'');
  if(L_BAND_FIX[k] != null) return L_BAND_FIX[k];
  if(L_BANDS.indexOf(t) !== -1) return t;
  return L_BAND_FIX[t.toLowerCase()] != null ? L_BAND_FIX[t.toLowerCase()] : t;
}
const L_bandRank = b => L_BANDS.indexOf(b);

/* Company Headcount (nM) columns hold an absolute delta; IT HC columns are
   already percentages. Convert the company deltas to a % of the prior base. */
function L_growthPct(now, delta){
  if(now == null || delta == null) return null;
  const base = now - delta;
  if(base <= 0) return null;
  return Math.round(delta / base * 1000) / 10;
}

const L_SEN_RULES = [
  ['C-Suite & Founder', /\b(c\.?e\.?o|c\.?f\.?o|c\.?t\.?o|c\.?i\.?o|c\.?o\.?o|c\.?i\.?s\.?o|c\.?m\.?o|c\.?d\.?o|c\.?h\.?r\.?o)\b|\b(chief|founder|co-founder|owner|proprietor|president|managing director|managing partner|group md)/],
  ['VP / SVP',          /\b(vice president|vp|svp|evp|avp)\b|\b(senior vice|executive vice)/],
  ['Director / Head',   /\b(director|head|general manager|country manager|principal|partner|dean|chair)/],
  ['Manager / Lead',    /\b(manager|lead|supervisor|foreman|superintendent|team leader|coordinator)/],
  ['Senior IC',         /\b(senior|sr|staff|architect|specialist|consultant|engineer|analyst|officer|scientist|advisor|professor|lecturer)/],
];
const L_FN_RULES = [
  ['IT & Technology',      /\bit\b|\bi\.t\b|\bict\b|\bems\b|\b(information technology|infocomm|technolog|technical|software|developer|programmer|network|infrastructure|system|cyber|security|informatics|data|cloud|devops|application|helpdesk|help desk|service desk|service delivery|erp|sap\b|crm|automation|digital transformation|digital workplace|digital technolog|digitali)|\b(c\.?t\.?o|c\.?i\.?o|c\.?i\.?s\.?o|c\.?d\.?o)\b|\bchief (information|technolog|digital)/],
  ['Finance & Procurement',/\b(financ|account(ing|ant|s payable|s receivable)|controller|treasur|procure|purchas|sourcing|audit|taxation|\btax\b|credit control|billing|payroll)|\bc\.?f\.?o\b|\bchief financ/],
  ['HR & People',          /\b(hr\b|human resource|human capital|people|talent|recruit|learning and development|l&d|compensation|benefits)|\bc\.?h\.?r\.?o\b|\bchief (people|human)/],
  ['Legal, Risk & Compliance', /\b(legal|counsel|complian|risk|governance|regulatory|company secretary)/],
  ['Sales & Marketing',    /\b(sales|marketing|business development|commercial|brand|account executive|account manager|growth|revenue|communication|public relations)|\bpr\b|\bc\.?m\.?o\b|\bchief (marketing|revenue|commercial)/],
  ['Operations & Supply Chain', /\b(operat|ops\b|supply chain|logistic|production|plant|manufactur|warehouse|quality|\bqa\b|hse|ehs|safety|maintenance|facilit|shipping|marine|vessel|fleet|\bport\b|service manager)|\bc\.?o\.?o\b|\bchief operat/],
  ['Engineering & Projects', /\b(project|programme|program manager|engineer|design|construction|survey|draft|r&d|research)/],
  ['Executive & General Mgmt', /\b(chief executive|managing director|general manager|president|founder|owner|country manager|director|executive)|\bc\.?e\.?o\b|\bgm\b/],
];
const L_SEN_ORDER = ['C-Suite & Founder','VP / SVP','Director / Head','Manager / Lead','Senior IC','Individual Contributor'];
const L_FN_ORDER  = L_FN_RULES.map(r => r[0]).concat(['Other']);

function L_classify(t, rules, fallback){
  const tl = ' ' + t.toLowerCase().replace(/[^a-z&.\s]/g,' ') + ' ';
  for(const [label, pat] of rules) if(pat.test(tl)) return label;
  return fallback;
}

/* ---------------- column resolution ----------------
   This spreadsheet gets restructured often: columns are renamed, reordered and
   added between refreshes. Names are matched loosely (case, spacing, embedded
   newlines and punctuation ignored) and accept aliases, and anything genuinely
   optional resolves to -1 rather than throwing. Every expected column that
   cannot be found is recorded so the dashboard can say so out loud instead of
   silently reporting zero.                                                    */
const normName = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
function resolver(hdr){
  const map = new Map();
  hdr.forEach((h, i) => { const k = normName(h); if(!map.has(k)) map.set(k, i); });
  const missing = [];
  return {
    missing,
    find(...names){
      for(const n of names){ const i = map.get(normName(n)); if(i != null) return i; }
      return -1;
    },
    req(...names){
      const i = this.find(...names);
      if(i < 0) throw new Error('required column not found: ' + names[0]);
      return i;
    },
    opt(...names){
      const i = this.find(...names);
      if(i < 0) missing.push(names[0]);
      return i;
    },
    all(name){
      const k = normName(name);
      return hdr.reduce((a, h, i) => { if(normName(h) === k) a.push(i); return a; }, []);
    },
  };
}

/* ---------------- signal definitions ----------------
   Singapore-scoped signals come first: StarHub sells into Singapore, so a
   local signal is a materially stronger buying indicator than a global one.
   A tab that lacks a column reports that signal as unavailable rather than 0%. */
const SIGNAL_DEFS = [
  {label:'Device Refresh (SG)',        sg:true,  cols:['Singapore Device Refresh Indicators']},
  {label:'Endpoint (SG)',              sg:true,  cols:['Singapore Endpoint Signals']},
  {label:'IT Support (SG)',            sg:true,  cols:['Singapore IT Support Signals']},
  {label:'Workplace Transform (SG)',   sg:true,  cols:['Singapore Workplace Transformation']},
  {label:'Geo Expansion (SG)',         sg:true,  cols:['Singapore Geo Expansions']},
  {label:'AI Initiatives (SG)',        sg:true,  cols:['Singapore AI Initiatives']},
  {label:'Workforce Expansion (SG)',   sg:true,  cols:['Singapore Workforce Expansion']},
  {label:'Device Refresh',             sg:false, cols:['Device Refresh Signals']},
  {label:'Endpoint Management',        sg:false, cols:['Endpoint Management Signals']},
  {label:'IT Support / Service Desk',  sg:false, cols:['IT Support & Service Desk Transformation']},
  {label:'Digital Workplace',          sg:false, cols:['Digital Workplace & Technology Transformation']},
  {label:'IT Leadership Hiring',       sg:false, cols:['IT Leadership Hiring']},
  {label:'Geographic Expansion',       sg:false, cols:['Geographic Expansion']},
  {label:'Funding & Acquisitions',     sg:false, cols:['Funding And Acquisitions']},
];
const SIG_LABELS = SIGNAL_DEFS.map(d => d.label);
const SIG_SG_DEF = SIGNAL_DEFS.map(d => d.sg);
const SX = {}; SIG_LABELS.forEach((l, i) => SX[l] = i);

const OPP_ORDER_DEF = ['Very High Opportunity','High Opportunity','Moderate Opportunity','Lower Opportunity','Unclassified'];
function oppOf(v){
  const t = L_clean(v);
  if(!t) return 'Unclassified';
  const k = t.toLowerCase();
  for(const o of OPP_ORDER_DEF) if(o.toLowerCase() === k) return o;
  if(k.includes('very high')) return 'Very High Opportunity';
  if(k.includes('high'))      return 'High Opportunity';
  if(k.includes('moderate'))  return 'Moderate Opportunity';
  if(k.includes('low'))       return 'Lower Opportunity';
  return 'Unclassified';
}
/* "12.5%" / "$5.1M" / "1,240" all reduce to a number */
function L_pctNum(v){
  const t = L_clean(v).replace(/[%,\s]/g, '');
  if(!t) return null;
  const f = Number(t);
  return Number.isFinite(f) ? f : null;
}

/* ---------------- the transform ---------------- */

/* Derive one account tab. `contactCount` is a Map keyed on domain-or-name, or
   null for a tab deliberately not joined to the contacts list. */
function deriveAccounts(hdr, rowsIn, contactCount, topicCount){
  const R = resolver(hdr);
  const c = {
    name:  R.req('Account Name'),
    dom:   R.opt('Domain'),
    li:    R.opt('Company LinkedIn URL', 'Linkedin', 'LinkedIn URL', 'Company Linkedin'),
    intent:R.opt('Intent Score'),
    topics:R.opt('Intent Topics'),
    band:  R.opt('Employee Count'),
    ind:   R.opt('Industry'),
    rev:   R.opt('Revenue'),
    revD:  R.find('Revenue $'),
    loc:   R.opt('Account Country'),
    sgHc:  R.find('Singapore Employee Count'),
    sgHire:R.find('Singapore Hiring'),
    gHire: R.find('Global Hiring'),
    itPct: R.find('IT Headcount %'),
    opp:   R.find('Opportunity Classification Outsourcing Fit', 'Opportunity Classification', 'Outsourcing Fit'),
    hc:    R.opt('Company Headcount'),
    hc3:   R.opt('Company Headcount (3M)'),
    hc6:   R.opt('Company Headcount (6M)'),
    hc12:  R.opt('Company Headcount (12M)'),
    ithc:  R.opt('IT Headcount'),
    it3:   R.opt('IT HC (3M)'),
    it6:   R.opt('IT HC (6M)'),
    it12:  R.opt('IT HC (12M)'),
  };
  // a signal may map to several columns with the same header (narrative + summary)
  const sigCols = SIGNAL_DEFS.map(d => d.cols.flatMap(n => R.all(n)));
  const sigAvail = sigCols.map(ix => ix.length > 0);

  const cell = (r, i) => i >= 0 ? r[i] : '';
  const out = [], meta = new Map();
  for(let r of rowsIn){
    if(r.length < hdr.length) r = r.concat(new Array(hdr.length - r.length).fill(''));
    const name = L_clean(cell(r, c.name));
    if(!name) continue;
    const dom = L_clean(cell(r, c.dom)).toLowerCase();
    const key = dom || name.toLowerCase();

    const s = sigCols.map(ix => ix.some(i => L_normTxt(r[i])) ? 1 : 0);
    const nsig = s.reduce((x, y) => x + y, 0);
    const nsgSig = s.reduce((x, y, i) => x + (SIG_SG_DEF[i] ? y : 0), 0);

    const ints = L_num(cell(r, c.intent)) || 0;
    const topics = L_clean(cell(r, c.topics)).split(',').map(t => t.trim()).filter(Boolean);
    topics.forEach(t => topicCount.set(t, (topicCount.get(t) || 0) + 1));

    const hc = L_num(cell(r, c.hc));
    const g3 = L_growthPct(hc, L_num(cell(r, c.hc3)));
    const g6 = L_growthPct(hc, L_num(cell(r, c.hc6)));
    const g12 = L_growthPct(hc, L_num(cell(r, c.hc12)));
    const ithc = L_num(cell(r, c.ithc));
    const itg3 = L_num(cell(r, c.it3)), itg6 = L_num(cell(r, c.it6)), itg12 = L_num(cell(r, c.it12));

    const bnd = L_band(cell(r, c.band));
    const br = L_bandRank(bnd);
    const ncon = contactCount ? (contactCount.get(key) || 0) : 0;
    const opp = oppOf(cell(r, c.opp));
    const sgHc = L_num(cell(r, c.sgHc));
    const itPct = L_pctNum(cell(r, c.itPct));

    /* ---- priority tiers, evaluated top-down, first match wins.
            The model is built around IT capability *contraction*: StarHub sells
            outsourced and managed workplace IT, so an account shedding in-house
            IT is a buyer, while one hiring IT is building the capability itself.
            The sharpest case is a business growing while its IT team shrinks.
            The dashboard's tier legend mirrors this wording exactly. --------- */
    const shrinkAny = itg12 != null && itg12 < 0;
    const shrink10  = itg12 != null && itg12 <= -10;
    const scissors  = g12 != null && itg12 != null && g12 > 0 && itg12 < 0;
    const contracting = shrink10 || scissors;
    const hotTrig = s[SX['Device Refresh (SG)']] || s[SX['Endpoint (SG)']]
                  || s[SX['Device Refresh']] || s[SX['Endpoint Management']] || ints >= 2;
    const strategic = s[SX['Workplace Transform (SG)']] || s[SX['IT Support (SG)']]
                    || s[SX['AI Initiatives (SG)']] || s[SX['Digital Workplace']]
                    || s[SX['IT Support / Service Desk']];
    const broad = br >= 3 || s[SX['Geo Expansion (SG)']] || s[SX['Geographic Expansion']]
                || s[SX['Funding & Acquisitions']];

    let pri;
    if(contracting && hotTrig) pri = 'P0';
    else if((shrinkAny || (g12 != null && g12 >= 5)) && nsig >= 1) pri = 'P1';
    else if(strategic) pri = 'P2';
    else if(broad || nsig >= 1) pri = 'P3';
    else pri = 'Unranked';

    out.push({ n:name, d:dom,
      ind: L_title(cell(r, c.ind)), loc: L_title(cell(r, c.loc)), bnd, opp,
      hc: hc == null ? null : Math.trunc(hc), ithc: ithc == null ? null : Math.trunc(ithc),
      rev: L_num(cell(r, c.rev)), revd: L_clean(cell(r, c.revD)),
      sghc: sgHc == null ? null : Math.trunc(sgHc),
      sghire: L_num(cell(r, c.sgHire)), ghire: L_num(cell(r, c.gHire)), itpct: itPct,
      g3, g6, g12, itg3, itg6, itg12,
      'is': ints, nt: topics.length, nc: ncon, pri, s, nsg: nsgSig,
      li: L_clean(cell(r, c.li)) ? 1 : 0, t: topics });
    meta.set(key, { pri, nsig, is: ints, opp });
  }
  return { rows: out, meta, sigAvail, missing: R.missing, given: rowsIn.length };
}

function buildData(accCsv, conCsv, cgCsv){
  const A = parseCSV(accCsv), C = parseCSV(conCsv);
  if(A.length < 2 || C.length < 2) throw new Error('empty sheet export');
  const AH = A[0].map(h => h.trim()), AROWS = A.slice(1);
  const CH = C[0].map(h => h.trim()), CROWS = C.slice(1);

  const G = cgCsv ? parseCSV(cgCsv) : null;
  const GH = G && G.length > 1 ? G[0].map(h => h.trim()) : null;
  const GROWS = GH ? G.slice(1) : [];

  const CR = resolver(CH);
  const cc = {
    first: CR.opt('First Name'), last: CR.opt('Last Name'),
    li:    CR.opt('Contact LinkedIn URL'),
    name:  CR.req('Account Name'), dom: CR.opt('Domain'),
    cli:   CR.find('Company LinkedIn URL', 'Company Linkedin'),
    title: CR.opt('Job Title'), band: CR.opt('Employee Count'),
    ind:   CR.opt('Industry'), loc: CR.opt('Contact Country'),
    phone: CR.opt('Enriched Phone'), email: CR.opt('Email ID'),
    dept:  CR.find('Department'), sen: CR.find('Seniority'),
  };
  const ccell = (r, i) => i >= 0 ? r[i] : '';
  const ckey = r => (L_clean(ccell(r, cc.dom)).toLowerCase() || L_clean(ccell(r, cc.name)).toLowerCase());
  const contactCount = new Map();
  for(const r of CROWS){ const k = ckey(r); if(k) contactCount.set(k, (contactCount.get(k) || 0) + 1); }

  const topicCount = new Map();
  const net = deriveAccounts(AH, AROWS, contactCount, topicCount);
  // the client-given list is deliberately NOT joined to the contacts tab
  const cg = GH ? deriveAccounts(GH, GROWS, null, topicCount)
                : { rows: [], meta: new Map(), sigAvail: SIG_LABELS.map(() => false), missing: [], given: 0 };

  const contacts = [];
  const nameIx = new Map();
  for(let r of CROWS){
    if(r.length < CH.length) r = r.concat(new Array(CH.length - r.length).fill(''));
    const key = ckey(r);
    if(!key) continue;
    const jt = L_clean(ccell(r, cc.title));
    const an = L_clean(ccell(r, cc.name)) || key;
    if(!nameIx.has(an)) nameIx.set(an, nameIx.size);
    const meta = net.meta.get(key);
    contacts.push({
      a: nameIx.get(an),
      ind: L_title(ccell(r, cc.ind)),
      loc: L_title(ccell(r, cc.loc)),
      bnd: L_band(ccell(r, cc.band)),
      sen: jt ? L_classify(jt, L_SEN_RULES, 'Individual Contributor') : 'Individual Contributor',
      fn:  jt ? L_classify(jt, L_FN_RULES,  'Other') : 'Other',
      em: L_clean(ccell(r, cc.email)) ? 1 : 0,
      ph: L_clean(ccell(r, cc.phone)) ? 1 : 0,
      li: L_clean(ccell(r, cc.li)) ? 1 : 0,
      cli: L_clean(ccell(r, cc.cli)) ? 1 : 0,
      j: meta ? 1 : 0,
      pri: meta ? meta.pri : 'Not in portfolio',
      nsig: meta ? meta.nsig : 0,
      ais: meta ? meta.is : 0,
    });
  }
  const perAcct = new Map();
  for(const x of contacts) perAcct.set(x.a, (perAcct.get(x.a) || 0) + 1);
  for(const x of contacts) x.nca = perAcct.get(x.a);

  /* ---- compaction: intern the categoricals, emit positional rows ---- */
  const DICTS = {};
  function intern(key, val){
    let d = DICTS[key];
    if(!d){ d = DICTS[key] = {list:[], ix:new Map()}; }
    if(!d.ix.has(val)){ d.ix.set(val, d.list.length); d.list.push(val); }
    return d.ix.get(val);
  }
  const ACOLS = ['n','d','ind','loc','bnd','opp','hc','ithc','rev','revd','sghc','sghire','ghire','itpct',
                 'g3','g6','g12','itg3','itg6','itg12','is','nt','nc','pri','li','s','nsg','t'];
  const CCOLS = ['a','ind','loc','bnd','sen','fn','em','ph','li','cli','j','pri','nsig','ais','nca'];
  const CATS = {ind:'ind', loc:'loc', bnd:'bnd', sen:'sen', fn:'fn', pri:'pri', opp:'opp'};
  const pack = (rws, spec) => rws.map(r => spec.map(col =>
    CATS[col] ? intern(CATS[col], r[col]) : col === 't' ? r[col].map(t => intern('topic', t)) : r[col]));

  const cnt = (arr, f) => arr.reduce((s, x) => s + (f(x) ? 1 : 0), 0);
  const covOf = rws => ({
    rows: rws.length,
    domain: cnt(rws, x => x.d), li: cnt(rws, x => x.li),
    signal: cnt(rws, x => x.s.reduce((p, v) => p + v, 0) > 0),
    sgsignal: cnt(rws, x => x.nsg > 0),
    committee: cnt(rws, x => x.nc > 0),
    firmo: cnt(rws, x => x.ind !== 'Unknown' && x.loc !== 'Unknown' && x.bnd !== 'Unknown'),
    opp: cnt(rws, x => x.opp !== 'Unclassified'),
    hc: cnt(rws, x => x.hc != null), ithc: cnt(rws, x => x.ithc != null),
    intent: cnt(rws, x => x['is'] > 0),
  });
  const netCov = Object.assign({given: net.given}, covOf(net.rows));
  const cgCov  = Object.assign({given: cg.given},  covOf(cg.rows));
  const contCov = {
    rows: contacts.length,
    email: cnt(contacts, x => x.em), phone: cnt(contacts, x => x.ph),
    both: cnt(contacts, x => x.em && x.ph), li: cnt(contacts, x => x.li),
    joined: cnt(contacts, x => x.j), geo: cnt(contacts, x => x.loc !== 'Unknown'),
    accts: nameIx.size,
  };

  const acctRows = pack(net.rows, ACOLS);
  const cgRows   = pack(cg.rows, ACOLS);
  const contRows = pack(contacts, CCOLS);
  const topN = (m, k) => [...m.entries()].sort((x, y) => y[1] - x[1] || 0).slice(0, k);
  const dict = {}; for(const k in DICTS) dict[k] = DICTS[k].list;

  return {
    dict,
    accounts:    {cols: ACOLS, rows: acctRows, n: acctRows.length, sigAvail: net.sigAvail},
    clientGiven: {cols: ACOLS, rows: cgRows,   n: cgRows.length,   sigAvail: cg.sigAvail},
    contacts:    {cols: CCOLS, rows: contRows, n: contRows.length},
    summary: {
      signals: SIG_LABELS, signalSG: SIG_SG_DEF, oppOrder: OPP_ORDER_DEF,
      senOrder: L_SEN_ORDER, fnOrder: L_FN_ORDER, bands: L_BANDS,
      topics: topN(topicCount, 20), titles: [],
      acctCov: netCov, cgCov, contCov,
      missing: {accounts: net.missing, clientGiven: cg.missing, contacts: CR.missing},
    },
  };
}

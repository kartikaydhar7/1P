;
/* ============================================================
   StarHub Account Intelligence
   Two datasets from one workbook:
     Accounts  - tab "Net New sprouts"  (account-level signal enrichment)
     Contacts  - tab "Contacts"         (target contacts, joined
                                         back to the account portfolio)
   ============================================================ */

/* ---------------- dictionaries & hydration ----------------
   These are re-bound whenever a fresh copy of the sheet arrives, so they are
   `let`, not `const`. Everything downstream reads them at render time.        */
let DATA, SIG, SIG_SG, OPP_ORDER, SEN_ORDER, FN_ORDER, BANDS, ACC, CGV, CON, L, RX;

function hydrate(ds){
  const cols = ds.cols;
  return ds.rows.map(r => { const o = {}; for(let i=0;i<cols.length;i++) o[cols[i]] = r[i]; return o; });
}

/* Filter selections are held as dictionary indices, but the dictionaries are
   built in row order — so a sheet edit can shift them. Carry the selections
   across by label and drop anything that no longer exists. */
function remapFilters(oldL){
  MODES.forEach(mode => {
    ['ind','loc','bnd'].forEach(field => {
      const dict = DICT_OF[field], set = S[mode][field];
      if(!set.size) return;
      const labels = [...set].map(i => oldL[dict][i]).filter(v => v != null);
      set.clear();
      labels.forEach(lbl => { const i = RX[dict][lbl]; if(i != null) set.add(i); });
    });
  });
}

function adopt(raw){
  const oldL = L;
  DATA = raw;
  SIG = raw.summary.signals;
  SIG_SG = raw.summary.signalSG || SIG.map(()=>false);
  OPP_ORDER = raw.summary.oppOrder || [];
  SEN_ORDER = raw.summary.senOrder;
  FN_ORDER = raw.summary.fnOrder;
  BANDS = raw.summary.bands;
  const d = raw.dict;
  L = { ind:d.ind||[], loc:d.loc||[], bnd:d.bnd||[], pri:d.pri||[], sen:d.sen||[], fn:d.fn||[],
        opp:d.opp||[], topic:d.topic||[] };
  RX = {}; for(const k in L){ RX[k] = {}; L[k].forEach((v,i)=>RX[k][v]=i); }
  ACC = hydrate(raw.accounts);
  CGV = hydrate(raw.clientGiven || {cols:raw.accounts.cols, rows:[]});
  CON = hydrate(raw.contacts);
  if(oldL) remapFilters(oldL);
}
adopt(SNAPSHOT);

const PRI_ORDER = ['P0','P1','P2','P3','Unranked'];
const PRI_ORDER_C = ['P0','P1','P2','P3','Unranked','Not in portfolio'];

/* ---------------- state ---------------- */
const blank = () => ({ ind:new Set(), loc:new Set(), bnd:new Set(), cohort:{groups:[]} });
const acctBlank = () => Object.assign(blank(), { intentMin:1, gWin:'12', itWin:'12' });
const MODES = ['netnew','clientgiven','contacts'];
const MODE_LABEL = { netnew:'Net New', clientgiven:'Client Given', contacts:'Contacts' };
const S = {
  mode:'netnew',
  netnew:      acctBlank(),
  clientgiven: acctBlank(),
  contacts:    blank(),
};
const F = () => S[S.mode];
/* the two account boards share every chart; only the contacts board differs */
const isAcc = () => S.mode !== 'contacts';
const isCG  = () => S.mode === 'clientgiven';
const noun  = () => isAcc() ? 'accounts' : 'contacts';
const WINLBL = {'3':'3-month','6':'6-month','12':'12-month'};

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const pct = (a,b) => b ? Math.round(a/b*1000)/10 : 0;
const fmt = n => (n==null ? '—' : n.toLocaleString('en-US'));
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isPlace = v => /^(unknown|not in portfolio|n\/a|none)$/i.test(String(v||'').trim());
const clip = (s,n) => s.length > n ? s.slice(0,n-1)+'…' : s;
let uid = 0;   /* unique ids: several bar charts coexist in one document */
const PRI_COL = p => {
  const tier = isAcc() ? {P0:'--p0',P1:'--p1',P2:'--p2',P3:'--p3'} : {P0:'--t0',P1:'--t1',P2:'--t2',P3:'--t3'};
  return tier[p] ? `var(${tier[p]})` : p==='Not in portfolio' ? 'var(--pn)' : 'var(--pu)';
};
const SEN_COL = i => `var(--s${Math.min(i,5)})`;
/* tier label -> CSS class: "Not in portfolio" becomes "Notinportfolio" */
const priCls = p => String(p).replace(/\s+/g,'');
/* The thesis: StarHub sells outsourced/managed workplace IT, so a shrinking
   in-house IT team is the buying signal. A business growing while its IT team
   shrinks is the sharpest version of it. */
const SG_BANDS = [[1,1,'1'],[2,10,'2 – 10'],[11,50,'11 – 50'],[51,200,'51 – 200'],
                  [201,500,'201 – 500'],[501,1000,'501 – 1,000'],[1001,Infinity,'1,000+']];
const median = xs => { if(!xs.length) return null; const s=[...xs].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2); return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2); };
const itShrinking = x => x.itg12 != null && x.itg12 < 0;
const itShrink10  = x => x.itg12 != null && x.itg12 <= -10;
const scissors    = x => x.g12 != null && x.itg12 != null && x.g12 > 0 && x.itg12 < 0;
function rankSort(entries){ // [label,value] desc, placeholder labels pushed last
  return entries.sort((a,b)=>{ const pa=isPlace(a[0]), pb=isPlace(b[0]);
    if(pa!==pb) return pa?1:-1; return b[1]-a[1]; });
}

/* ---------------- cohort matching ---------------- */
const asArr = v => Array.isArray(v) ? v : (v==='' || v==null ? [] : [v]);
const ACC_FIELDS = {
  growth:  {label:'Company headcount growth %', type:'num',  get:x=>x.g12,  def:{op:'>',val:10}, unit:'%'},
  itgrowth:{label:'IT headcount change % (negative = shrinking)', type:'num', get:x=>x.itg12,
            def:{op:'<=',val:-10}, unit:'%'},
  shrink:  {label:'IT headcount shrinking',     type:'bool', get:x=>itShrinking(x)?1:0, def:{op:'is',val:'1'}},
  sciss:   {label:'Growing business, shrinking IT', type:'bool', get:x=>scissors(x)?1:0, def:{op:'is',val:'1'}},
  intent:  {label:'Intent score',               type:'num',  get:x=>x.is,   def:{op:'>=',val:1}},
  hc:      {label:'Company headcount',          type:'num',  get:x=>x.hc,   def:{op:'>',val:50}},
  ithc:    {label:'IT headcount',               type:'num',  get:x=>x.ithc, def:{op:'>',val:10}},
  nc:      {label:'Contacts mapped',            type:'num',  get:x=>x.nc,   def:{op:'>=',val:3}},
  nsg:     {label:'Singapore signals',          type:'num',  get:x=>x.nsg,  def:{op:'>=',val:1}},
  sghc:    {label:'Singapore headcount',        type:'num',  get:x=>x.sghc,  def:{op:'>',val:10}},
  itpct:   {label:'IT share of headcount %',    type:'num',  get:x=>x.itpct, def:{op:'>=',val:10}, unit:'%'},
  opp:     {label:'Outsourcing fit',            type:'multi', opts:()=>OPP_ORDER.map(o=>[o,o.replace(' Opportunity','')]),
            test:(x,v)=>L.opp[x.opp]===v, def:{op:'in',val:['Very High Opportunity','High Opportunity']}},
  signal:  {label:'Buying signal',              type:'multi', opts:()=>SIG.map((l,i)=>[String(i),l]),
            test:(x,v)=>x.s[+v]===1, def:{op:'hasany',val:['0','1']}},
  priority:{label:'Priority tier',              type:'multi', opts:()=>PRI_ORDER.map(p=>[p,p]),
            test:(x,v)=>L.pri[x.pri]===v, def:{op:'in',val:['P0','P1']}},
};
const CON_FIELDS = {
  sen:   {label:'Seniority',                type:'multi', opts:()=>SEN_ORDER.map(s=>[s,s]),
          test:(x,v)=>L.sen[x.sen]===v, def:{op:'in',val:['C-Suite & Founder','Director / Head']}},
  fn:    {label:'Function',                 type:'multi', opts:()=>FN_ORDER.map(s=>[s,s]),
          test:(x,v)=>L.fn[x.fn]===v, def:{op:'in',val:['IT & Technology']}},
  apri:  {label:'Account priority tier',    type:'multi', opts:()=>PRI_ORDER_C.map(p=>[p,p]),
          test:(x,v)=>L.pri[x.pri]===v, def:{op:'in',val:['P0','P1']}},
  nsig:  {label:'Signals on account',       type:'num', get:x=>x.nsig, def:{op:'>=',val:3}},
  ais:   {label:'Account intent score',     type:'num', get:x=>x.ais,  def:{op:'>=',val:1}},
  nca:   {label:'Contacts at account',      type:'num', get:x=>x.nca,  def:{op:'>=',val:3}},
  em:    {label:'Verified email',           type:'bool', get:x=>x.em,   def:{op:'is',val:'1'}},
  ph:    {label:'Direct phone',             type:'bool', get:x=>x.ph,   def:{op:'is',val:'1'}},
};
function FIELDS(){
  if(!isAcc()) return CON_FIELDS;
  if(!isCG()) return ACC_FIELDS;
  const {nc, ...rest} = ACC_FIELDS;   // no contacts joined to the client-given list
  return rest;
}

const NUM_OPS   = {'>':'>','>=':'≥','<':'<','<=':'≤','=':'='};
const MULTI_OPS  = {in:'is any of', nin:'is none of', hasany:'has any of', hasall:'has all of', hasnone:'has none of'};
const BOOL_OPS  = {is:'is'};
const BOOL_VALS = [['1','present'],['0','missing']];
const opsFor = t => t==='num' ? NUM_OPS : t==='bool' ? BOOL_OPS : MULTI_OPS;
const isMultiOp = op => ['in','nin','hasany','hasall','hasnone'].includes(op);

function matchCond(x,c){
  const f = FIELDS()[c.field];
  if(!f) return true;
  if(f.type==='multi'){
    const A = asArr(c.val); const on = v => f.test(x,v);
    if(!A.length) return true;
    if(c.op==='in'||c.op==='hasany')  return A.some(on);
    if(c.op==='hasall')               return A.every(on);
    if(c.op==='nin'||c.op==='hasnone')return A.every(v=>!on(v));
    return true;
  }
  if(f.type==='bool') return (f.get(x)?1:0) === (c.val==='1'?1:0);
  const v = f.get(x);
  if(v==null) return false;
  const t = parseFloat(c.val); if(isNaN(t)) return true;
  return c.op==='>'?v>t : c.op==='>='?v>=t : c.op==='<'?v<t : c.op==='<='?v<=t : v===t;
}
const grpActive = g => g.conds.length > 0;
const cohortActive = () => F().cohort.groups.some(grpActive);
const matchCohort = x => F().cohort.groups.some(g => grpActive(g) && g.conds.every(c=>matchCond(x,c)));

/* ---------------- filtering ---------------- */
function rows(){
  const f = F();
  let a = S.mode === 'netnew' ? ACC : S.mode === 'clientgiven' ? CGV : CON;
  if(f.ind.size) a = a.filter(x=>f.ind.has(x.ind));
  if(f.loc.size) a = a.filter(x=>f.loc.has(x.loc));
  if(f.bnd.size) a = a.filter(x=>f.bnd.has(x.bnd));
  if(cohortActive()) a = a.filter(matchCohort);
  return a;
}
const DS = () => S.mode === 'netnew' ? DATA.accounts : S.mode === 'clientgiven' ? DATA.clientGiven : DATA.contacts;
/* a tab without the column reports the signal as unavailable, not as 0% */
const sigAvail = () => (DS().sigAvail) || SIG.map(()=>true);
const total = () => DS().n;
function tally(a, key){ const m = new Map(); for(const x of a){ m.set(x[key], (m.get(x[key])||0)+1); } return m; }
function byLabel(a, key, dict){
  const m = tally(a,key), out = [];
  for(const [k,v] of m) out.push([L[dict][k], v]);
  return rankSort(out);
}

/* ---------------- tooltip ---------------- */
const tip = $('#tip');
function showTip(e,html){ tip.innerHTML = html; tip.style.opacity = 1; moveTip(e); }
function moveTip(e){
  const r = tip.getBoundingClientRect();
  let x = e.clientX - r.width/2, y = e.clientY - r.height - 14;
  x = Math.max(8, Math.min(x, innerWidth - r.width - 8));
  if(y < 8) y = e.clientY + 18;
  tip.style.left = x+'px'; tip.style.top = y+'px';
}
const hideTip = () => { tip.style.opacity = 0; };
function bindTip(node, html){
  node.addEventListener('mousemove', e=>showTip(e, typeof html==='function'?html():html));
  node.addEventListener('mouseleave', hideTip);
}

/* ---------------- SVG utilities ---------------- */
const NS = 'http://www.w3.org/2000/svg';
function el(t,a){ const e = document.createElementNS(NS,t); for(const k in a) e.setAttribute(k,a[k]); return e; }
function svg(w,h){ return el('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'xMidYMid meet'}); }
function txt(s,a,content){ const t = el('text',a); t.textContent = content; s.appendChild(t); return t; }
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function grow(node, attrs, delay){
  if(REDUCED){ for(const k in attrs) node.setAttribute(k, attrs[k]); return; }
  setTimeout(()=>{ node.style.transition = 'width .6s cubic-bezier(.2,.8,.2,1),height .6s cubic-bezier(.2,.8,.2,1),y .6s cubic-bezier(.2,.8,.2,1),x .6s cubic-bezier(.2,.8,.2,1)';
    for(const k in attrs) node.setAttribute(k, attrs[k]); }, 20 + delay);
}
const emptyBox = (box,msg) => { box.innerHTML = `<div class="empty">${esc(msg||'Nothing matches the current filters.')}</div>`; };

/* ---------------- chart: ranked horizontal bars ---------------- */
/* entries: [label, value] · one hue per series (a per-bar ramp is only used
   where the categories are genuinely ordered, passed in via opts.ramp).      */
function hbars(box, entries, opts){
  box.innerHTML = '';
  /* W should track the card's real pixel width: the SVG scales to fit, so a
     narrow viewBox in a wide card magnifies every label with it. */
  const o = Object.assign({labelW:168, right:78, rowH:29, noun:'accounts', denom:0,
                           onClick:null, active:null, ramp:null, W:700}, opts||{});
  if(!entries.length){ emptyBox(box, o.emptyMsg); return; }
  const W = o.W, top = 4, H = top + entries.length*o.rowH + 4, trackW = W - o.labelW - o.right;
  const s = svg(W,H);
  const gid = 'gBar'+(++uid);
  const defs = el('defs',{}); s.appendChild(defs);
  const g1 = el('linearGradient',{id:gid,x1:0,y1:0,x2:1,y2:0});
  g1.appendChild(el('stop',{offset:0,style:'stop-color:var(--brand-str)'}));
  g1.appendChild(el('stop',{offset:1,style:'stop-color:var(--brand-lite)'}));
  defs.appendChild(g1);
  const max = Math.max(...entries.map(e=>e[1]), 1);
  const den = o.denom || entries.reduce((a,b)=>a+b[1],0);
  entries.forEach((e,i)=>{
    const y = top + i*o.rowH, ph = isPlace(e[0]);
    const on = o.active && o.active.has(e[0]);
    txt(s,{x:0,y:y+o.rowH/2+4,'class':'barlabel',style:ph?'fill:var(--muted);font-style:italic':''}, clip(e[0], Math.floor(o.labelW/6.6)));
    const bh = 14, by = y + (o.rowH-bh)/2;
    s.appendChild(el('rect',{x:o.labelW,y:by,width:trackW,height:bh,rx:4,'class':'bar-track'}));
    const bw = Math.max(0, trackW*e[1]/max);
    const fill = ph ? 'var(--pn)' : o.ramp ? o.ramp(i) : (on ? 'var(--brand-str)' : `url(#${gid})`);
    const g = el('g',{'class':'rowhit'});
    const r = el('rect',{x:o.labelW,y:by,width:0,height:bh,rx:4,fill:fill,'class':'bseg'});
    g.appendChild(r);
    const vt = txt(s,{x:o.labelW+8,y:y+o.rowH/2+4,'class':'barval'}, `${fmt(e[1])} · ${pct(e[1],den)}%`);
    g.appendChild(vt);
    g.appendChild(el('rect',{x:0,y:y,width:W,height:o.rowH,fill:'transparent'}));
    bindTip(g, ()=>`<div class="tt-t">${esc(e[0])}</div><div class="tt-r"><b>${fmt(e[1])}</b> ${o.noun} · <b>${pct(e[1],den)}%</b>${on?' · <b>filtered</b>':''}</div>`);
    if(o.onClick){ g.style.cursor='pointer'; g.addEventListener('click',()=>o.onClick(e[0])); }
    s.appendChild(g);
    grow(r,{width:bw}, i*22); grow(vt,{x:o.labelW+bw+8}, i*22);
  });
  box.appendChild(s);
}

/* ---------------- chart: donut ---------------- */
function arcPath(cx,cy,rI,rO,a1,a2){
  const p = (r,a)=>[cx+r*Math.cos(a), cy+r*Math.sin(a)];
  const [x1,y1]=p(rO,a1),[x2,y2]=p(rO,a2),[x3,y3]=p(rI,a2),[x4,y4]=p(rI,a1);
  const laf = (a2-a1) > Math.PI ? 1 : 0;
  return `M${x1} ${y1}A${rO} ${rO} 0 ${laf} 1 ${x2} ${y2}L${x3} ${y3}A${rI} ${rI} 0 ${laf} 0 ${x4} ${y4}Z`;
}
function donut(box, segs, opts){
  box.innerHTML = '';
  const o = Object.assign({noun:'accounts', center:'Accounts', legend:true}, opts||{});
  const tot = segs.reduce((a,b)=>a+b.value,0);
  if(!tot){ emptyBox(box); return; }
  const W = 460, H = 236, cx = 118, cy = 118, rO = 96, rI = 62;
  const s = svg(W,H);
  let ang = -Math.PI/2;
  const gapA = 0.014; // ~2px surface gap between arcs, not a stroke border
  segs.forEach(sg=>{
    if(!sg.value) return;
    const span = sg.value/tot*2*Math.PI;
    const a1 = ang + (span > gapA*2 ? gapA : 0), a2 = ang + span;
    const pe = el('path',{d:arcPath(cx,cy,rI,rO,a1,a2), fill:sg.color, 'class':'rowhit'});
    bindTip(pe, `<div class="tt-t">${esc(sg.label)}</div><div class="tt-r"><b>${fmt(sg.value)}</b> ${o.noun} · <b>${pct(sg.value,tot)}%</b></div>`);
    if(!REDUCED){ pe.style.opacity = 0; setTimeout(()=>{ pe.style.transition='opacity .45s'; pe.style.opacity=1; },40); }
    s.appendChild(pe);
    ang += span;
  });
  txt(s,{x:cx,y:cy-1,'text-anchor':'middle','class':'donut-v'}, fmt(tot));
  txt(s,{x:cx,y:cy+19,'text-anchor':'middle','class':'donut-l'}, o.center);
  if(!o.legend){ box.appendChild(s); return; }
  let ly = 30;
  const shown = segs.filter(x=>x.value);
  const step = Math.min(34, Math.floor((H-40)/Math.max(shown.length,1)));
  shown.forEach(sg=>{
    s.appendChild(el('rect',{x:250,y:ly-10,width:11,height:11,rx:3,fill:sg.color}));
    txt(s,{x:269,y:ly,'class':'barlabel',style:'font-size:11.5px'}, clip(sg.label,20));
    txt(s,{x:W-4,y:ly,'text-anchor':'end','class':'barval'}, `${fmt(sg.value)} · ${pct(sg.value,tot)}%`);
    ly += step;
  });
  box.appendChild(s);
}

/* ---------------- chart: column histogram ---------------- */
function cols(box, cats, vals, opts){
  box.innerHTML = '';
  /* W tracks the card's real pixel width so the SVG is not scaled up, which
     would magnify every label along with it */
  const o = Object.assign({axisLabel:'', noun:'accounts', greyFirst:false, catFmt:c=>String(c), W:700}, opts||{});
  const tot = vals.reduce((a,b)=>a+b,0);
  if(!tot){ emptyBox(box); return; }
  const W = o.W, H = 246, left = 34, bottom = 42, top = 18, right = 8;
  const s = svg(W,H), plotH = H-top-bottom, bw = (W-left-right)/cats.length;
  const max = Math.max(...vals, 1);
  for(let g=0; g<=4; g++){
    const yy = top + plotH*g/4;
    s.appendChild(el('line',{x1:left,y1:yy,x2:W-right,y2:yy,'class':'gridline'}));
    txt(s,{x:left-6,y:yy+3,'text-anchor':'end','class':'axis'}, fmt(Math.round(max*(1-g/4))));
  }
  cats.forEach((c,i)=>{
    const cx = left + i*bw, v = vals[i], h = plotH*v/max;
    const iw = Math.min(bw*0.62, 46), x = cx + bw/2 - iw/2, y = top + plotH - h;
    const fill = (o.greyFirst && i===0) ? 'var(--pn)' : 'var(--brand)';
    const r = el('rect',{x,y:top+plotH,width:iw,height:0,rx:4,fill:fill,'class':'bseg rowhit'});
    bindTip(r, `<div class="tt-t">${esc(o.catFmt(c))}</div><div class="tt-r"><b>${fmt(v)}</b> ${o.noun} · <b>${pct(v,tot)}%</b></div>`);
    s.appendChild(r);
    if(v>0) txt(s,{x:cx+bw/2,y:y-6,'text-anchor':'middle','class':'barval',style:'font-size:10px'},
                 `${fmt(v)} · ${pct(v,tot)}%`);
    grow(r,{y:y,height:h}, i*22);
    txt(s,{x:cx+bw/2,y:H-bottom+19,'text-anchor':'middle','class':'axis',style:'font-size:11px;fill:var(--ink-2);font-weight:600'}, String(c));
  });
  if(o.axisLabel) txt(s,{x:left+(W-left-right)/2,y:H-5,'text-anchor':'middle','class':'axis-nm'}, o.axisLabel);
  box.appendChild(s);
}

/* ---------------- chart: meter rows ---------------- */
function meters(box, groups){
  box.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'mtr';
  groups.forEach(g=>{
    if(g.glabel){
      const h = document.createElement('div'); h.className = 'mtr-glbl';
      h.innerHTML = `<span>${esc(g.glabel)}</span>` + (g.win
        ? `<select class="win-sel" data-win="${g.win.key}" aria-label="${esc(g.glabel)} window">${['3','6','12'].map(w=>`<option value="${w}"${w===g.win.cur?' selected':''}>${w}M</option>`).join('')}</select>`
        : '');
      wrap.appendChild(h);
    }
    g.rows.forEach(r=>{
      const d = document.createElement('div'); d.className = 'mtr-row';
      d.innerHTML = `<div class="mtr-top"><span class="mtr-lbl">${r.label}</span><span class="mtr-val">${pct(r.value,r.of)}%</span></div>
        <div class="mtr-bar"><i style="width:${pct(r.value,r.of)}%"></i></div>
        <div class="mtr-sub"><span class="num">${fmt(r.value)}</span> of <span class="num">${fmt(r.of)}</span> ${esc(r.noun||'')}</div>`;
      bindTip(d, `<div class="tt-t">${esc(r.tip||r.plain||'')}</div><div class="tt-r"><b>${fmt(r.value)}</b> of <b>${fmt(r.of)}</b> · <b>${pct(r.value,r.of)}%</b></div>`);
      wrap.appendChild(d);
    });
  });
  box.appendChild(wrap);
  $$('.win-sel').forEach(sel => sel.addEventListener('change', ()=>{
    const f = F();
    if(sel.dataset.win==='g') f.gWin = sel.value; else f.itWin = sel.value;
    renderCards();
  }));
  bindIntentInput();
}

/* ---------------- chart: coverage rings ---------------- */
function ringSVG(p, size){
  const r = (size-9)/2, c = 2*Math.PI*r, off = c*(1-Math.min(p,100)/100);
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px" role="img" aria-label="${p}%">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="7"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--brand)" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"
      style="transition:stroke-dashoffset .8s ease"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      style="font-family:var(--fm);font-size:${(size*0.235).toFixed(0)}px;font-weight:600;fill:var(--ink)">${p}%</text></svg>`;
}
/* a ring only reads 100% when the metric is actually complete */
const covPct = (n,d) => (n<d ? Math.min(pct(n,d), 99.9) : pct(n,d));
function rings(box, tiles){
  box.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'cov-grid';
  tiles.forEach(t=>{
    const d = document.createElement('div'); d.className = 'cov-tile';
    d.innerHTML = `<div class="cov-rings">${ringSVG(covPct(t.n,t.d), 84)}</div>
      <div class="cov-lbl">${esc(t.label)}</div>
      <div class="cov-sub">${esc(t.sub)}</div>
      <div class="cov-sub"><span class="num">${fmt(t.n)}</span> of <span class="num">${fmt(t.d)}</span></div>`;
    grid.appendChild(d);
  });
  box.appendChild(grid);
}

/* ---------------- chart: table ---------------- */
function table(box, head, body, note){
  box.innerHTML = '';
  if(!body.length){ emptyBox(box); return; }
  const w = document.createElement('div'); w.className = 'tbl-wrap';
  w.innerHTML = `<table class="tbl"><thead><tr>${head.map(h=>`<th class="${h.cls||''}">${esc(h.label)}</th>`).join('')}</tr></thead>
    <tbody>${body.map(r=>`<tr>${r.map(c=>`<td class="${c.cls||''}">${c.html}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  box.appendChild(w);
  if(note){ const n = document.createElement('div'); n.className = 'cov-sub'; n.style.marginTop='9px'; n.innerHTML = note; box.appendChild(n); }
}

/* ---------------- intent threshold control ---------------- */
function intentRowLabel(){
  const f = F();
  return `Active third-party intent
    <span class="intent-wrap">min score
      <input class="intent-input num" id="intentInput" type="number" min="0" step="1" value="${f.intentMin}" aria-label="Minimum intent score">
      <span class="stepper"><button id="intUp" type="button" aria-label="Increase">&#9650;</button><button id="intDn" type="button" aria-label="Decrease">&#9660;</button></span>
    </span>`;
}
function bindIntentInput(){
  const inp = $('#intentInput'); if(!inp) return;
  const set = v => { F().intentMin = Math.max(0, Math.round(v)||0); renderCards(); renderKpis();
                     const i2 = $('#intentInput'); if(i2){ i2.value = F().intentMin; i2.focus(); } };
  inp.addEventListener('change', e => set(parseInt(e.target.value||'0',10)));
  $('#intUp').addEventListener('click', ()=>set(F().intentMin+1));
  $('#intDn').addEventListener('click', ()=>set(F().intentMin-1));
}

/* ============================================================
   CARD DEFINITIONS
   ============================================================ */
/* One source of truth for the tier rules. These sentences mirror the branches in
   deriveAccounts() exactly, and are rendered as visible text on the card rather
   than hidden behind a hover-only tooltip. */
const PRI_RULES = [
  {tier:'P0', name:'Hottest',   rule:'IT capability contracting — IT headcount down 10%+, or the business growing while IT shrinks — <b>and</b> a device-refresh or endpoint signal (or intent score 2+).'},
  {tier:'P1', name:'Strong',   rule:'IT headcount declining at all, or company headcount up 5%+ over 12 months, with at least one buying signal.'},
  {tier:'P2', name:'Strategic', rule:'Shows Singapore workplace-transformation, IT-support or AI activity (or the global equivalents).'},
  {tier:'P3', name:'Broad',     rule:'200+ staff, or expansion / funding activity, or any single signal.'},
  {tier:'Unranked', name:'No signal yet', rule:'No buying signal detected in this refresh.'},
];
function tierLegend(counts, total){
  const d = document.createElement('dl'); d.className = 'tiers';
  PRI_RULES.forEach(r=>{
    const v = counts[r.tier] || 0;
    d.insertAdjacentHTML('beforeend',
      `<div class="tier-row">
         <dt><span class="pill ${priCls(r.tier)}">${esc(r.tier)}</span></dt>
         <dd><div class="tier-h"><span class="tier-n">${esc(r.name)}</span>
             <span class="tier-v num">${fmt(v)} &middot; ${pct(v,total)}%</span></div>
             <div class="tier-r">${r.rule}</div></dd>
       </div>`);
  });
  return d;
}


/* ---- accounts cards ---- */
/* Both account boards share these cards. The client-given list is deliberately
   not joined to the contacts tab, so its committee column and ring differ. */
const acctCards = withContacts => [
  { cls:'c12', title:'Portfolio Data Coverage', desc:'Enrichment quality of the full accounts portfolio · not affected by filters', tag:true,
    render(box){
      const c = withContacts ? DATA.summary.acctCov : DATA.summary.cgCov;
      rings(box, [
        {label:'Domain resolved',   n:c.domain, d:c.rows, sub:'accounts mapped to a company domain'},
        {label:'LinkedIn mapped',   n:c.li,     d:c.rows, sub:'company profiles matched'},
        {label:'Signal-enriched',   n:c.signal, d:c.rows, sub:'carry at least one buying signal'},
        withContacts
          ? {label:'Contacts mapped', n:c.committee, d:c.rows, sub:'have at least one target contact'}
          : {label:'Firmographics',   n:c.firmo,     d:c.rows, sub:'industry, country and size all resolved'},
      ]);
    }},
  { cls:'c12', title:'Buying-Signal Prevalence',
    desc:'Share of accounts in view showing each signal &middot; <b>(SG)</b> marks a Singapore-specific signal, a materially stronger buy indicator than its global equivalent',
    tag:true,
    render(box){
      const a = rows();
      if(!a.length) return emptyBox(box);
      const avail = sigAvail();
      const e = SIG.map((l,i)=>[l, a.reduce((s,x)=>s+x.s[i],0), i])
                   .filter(x=>avail[x[2]])
                   .sort((x,y)=>y[1]-x[1]);
      hbars(box, e.map(x=>[x[0],x[1]]), {denom:a.length, noun:'accounts', labelW:250, W:1420});
      const gone = SIG.filter((_,i)=>!avail[i]);
      if(gone.length){
        const n = document.createElement('div'); n.className='cov-sub'; n.style.marginTop='10px';
        n.innerHTML = `Not enriched for this list, so not shown rather than reported as zero: `
          + gone.map(g=>`<b>${esc(g)}</b>`).join(', ') + '.';
        box.appendChild(n);
      }
    }},
  { cls:'c12', title:'Account Prioritization',
    desc:'How Sprouts ranks each account on readiness to buy managed workplace ICT &middot; every rule is spelled out beside the chart',
    tag:true,
    render(box){
      const a = rows(), m = tally(a,'pri');
      if(!a.length) return emptyBox(box);
      const counts = {}; PRI_ORDER.forEach(p=>counts[p] = m.get(RX.pri[p])||0);
      const wrap = document.createElement('div'); wrap.className = 'pri-split';
      const left = document.createElement('div'); const right = document.createElement('div');
      wrap.appendChild(left); wrap.appendChild(right); box.appendChild(wrap);
      donut(left, PRI_ORDER.map(p=>({label:p==='Unranked'?'Unranked':'Priority '+p,
        value:counts[p], color:PRI_COL(p)})), {noun:'accounts', center:'Accounts', legend:false});
      right.appendChild(tierLegend(counts, a.length));
    }},
  { cls:'c6', title:'Top Industries', desc:'Click a bar to filter · top 10 of the accounts in view',
    render(box){
      hbars(box, byLabel(rows(),'ind','ind').slice(0,10),
        {denom:rows().length, noun:'accounts', onClick:v=>toggleFilter('ind',RX.ind[v]), active:labelSet('ind'), labelW:180});
    }},
  { cls:'c6', title:'Geographic Footprint', desc:'Account country · click a bar to filter · top 10',
    render(box){
      hbars(box, byLabel(rows(),'loc','loc').slice(0,10),
        {denom:rows().length, noun:'accounts', onClick:v=>toggleFilter('loc',RX.loc[v]), active:labelSet('loc'), labelW:180});
    }},
  { cls:'c5', title:'IT Contraction & Intent',
    desc:'Where in-house IT capability is being shed &middot; intent threshold and window are editable', tag:true,
    render(box){
      const a = rows(), f = F(), n = a.length;
      if(!n) return emptyBox(box);
      const over  = (k,t) => a.reduce((s,x)=>s+(x[k]!=null && x[k]>t?1:0),0);
      const under = (k,t) => a.reduce((s,x)=>s+(x[k]!=null && x[k]<=-t?1:0),0);
      const sciss = a.filter(scissors).length;
      meters(box, [
        {glabel:'IT headcount decline', win:{key:'it',cur:f.itWin},
         rows:[5,10,30].map(t=>({label:`down ${t}% or more`, value:under('itg'+f.itWin,t), of:n, noun:'accounts',
                                 tip:`IT headcount down ${t}%+ over ${WINLBL[f.itWin]}`}))},
        {glabel:'Outsourcing pressure',
         rows:[{label:'Business growing while IT shrinks', value:sciss, of:n, noun:'accounts',
                tip:'Company headcount up while IT headcount falls'}]},
        {glabel:'Third-party intent',
         rows:[{label:intentRowLabel(), value:a.reduce((s,x)=>s+(x.is>=f.intentMin?1:0),0), of:n,
                noun:`accounts · score ≥ ${f.intentMin}`, tip:`Third-party intent score ≥ ${f.intentMin}`}]},
        {glabel:'Company headcount growth', win:{key:'g',cur:f.gWin},
         rows:[5,10,30].map(t=>({label:`up ${t}% or more`, value:over('g'+f.gWin,t), of:n, noun:'accounts',
                                 tip:`Company headcount growth (${WINLBL[f.gWin]}) > ${t}%`}))},
      ]);
      const hcN = a.reduce((s,x)=>s+(x.hc!=null?1:0),0), itN = a.reduce((s,x)=>s+(x.ithc!=null?1:0),0);
      const note = document.createElement('div'); note.className = 'cov-sub'; note.style.marginTop = '12px';
      note.innerHTML = `Percentages are of all <span class="num">${fmt(n)}</span> accounts in view. Headcount history is available for `+
        `<span class="num">${fmt(hcN)}</span> of them and IT headcount history for <span class="num">${fmt(itN)}</span>; `+
        `accounts without history never clear a growth threshold.`;
      box.appendChild(note);
    }},
  { cls:'c7', title:'Signal Intensity per Account', desc:'How many of the nine distinct signals each account exhibits', tag:true,
    render(box){
      const a = rows(), bins = new Array(SIG.length+1).fill(0);
      a.forEach(x=>bins[x.s.reduce((s,v)=>s+v,0)]++);
      cols(box, bins.map((_,i)=>i), bins,
        {axisLabel:'Number of distinct buying signals per account', noun:'accounts', greyFirst:true,
         catFmt:c=>`${c} signal${c===1?'':'s'}`});
    }},
  { cls:'c6', title:'Singapore Footprint', tag:true,
    desc:'Staff each account employs in Singapore &middot; the market StarHub actually sells into',
    render(box){
      const a = rows(), n = a.length;
      if(!n) return emptyBox(box);
      const known = a.filter(x=>x.sghc != null);
      if(!known.length) return emptyBox(box, 'No Singapore headcount recorded on this list.');
      const e = SG_BANDS.map(([lo,hi,lbl]) => [lbl, known.filter(x=>x.sghc>=lo && x.sghc<=hi).length])
                        .filter(x=>x[1]);
      hbars(box, e, {denom:n, noun:'accounts', labelW:150});

      const med = median(known.map(x=>x.sghc));
      const big = known.filter(x=>x.sghc >= 50).length;
      const withBoth = a.filter(x=>x.sghc != null && x.hc != null && x.hc > 0);
      const sgOnly = withBoth.filter(x=>x.sghc / x.hc >= 0.9).length;
      const note = document.createElement('div');
      note.className = 'cov-sub'; note.style.marginTop = '12px';
      note.innerHTML =
          `Median <span class="num">${fmt(med)}</span> Singapore staff &middot; `
        + `<span class="num">${fmt(big)}</span> accounts (${pct(big,n)}%) have 50 or more &middot; `
        + `<span class="num">${fmt(sgOnly)}</span> are Singapore-based businesses `
        + `(90%+ of global headcount is here)`
        + (known.length < n ? ` &middot; no figure recorded for <span class="num">${fmt(n-known.length)}</span>.` : '.');
      box.appendChild(note);
    }},
  { cls:'c6', title:'Company Size Mix', desc:'Employee band · click a bar to filter',
    render(box){
      const a = rows(), m = tally(a,'bnd');
      const e = BANDS.filter(b=>RX.bnd[b]!=null).map(b=>[b, m.get(RX.bnd[b])||0]).filter(x=>x[1]);
      const unk = m.get(RX.bnd['Unknown']); if(unk) e.push(['Unknown', unk]);
      hbars(box, e, {denom:a.length, noun:'accounts', labelW:150,
        onClick:v=>toggleFilter('bnd',RX.bnd[v]), active:labelSet('bnd')});
    }},
  { cls:'c12', title:'Intent Topics', desc:'Third-party intent topics researched by accounts in view · top 10',
    render(box){
      const m = new Map();
      rows().forEach(x=>x.t.forEach(t=>m.set(t,(m.get(t)||0)+1)));
      const e = rankSort([...m].map(([k,v])=>[L.topic[k],v])).slice(0,10);
      const withIntent = rows().filter(x=>x.t.length).length;
      hbars(box, e, {denom:withIntent||1, noun:'accounts', labelW:260, W:1420,
        emptyMsg:'No intent topics on the accounts in view.'});
    }},
  { cls:'c12', title:'Where to Start', desc:'Highest-priority accounts in view · ranked by tier, then signal breadth, intent and target-contact depth',
    render(box){
      const a = rows().slice().sort((x,y)=>{
        const px = PRI_ORDER.indexOf(L.pri[x.pri]), py = PRI_ORDER.indexOf(L.pri[y.pri]);
        if(px!==py) return px-py;
        const sx = x.s.reduce((s,v)=>s+v,0), sy = y.s.reduce((s,v)=>s+v,0);
        if(sx!==sy) return sy-sx;
        // steepest IT contraction first — that is the buying signal
        const dx = x.itg12==null ? 1 : x.itg12, dy = y.itg12==null ? 1 : y.itg12;
        if(dx!==dy) return dx-dy;
        if(x.is!==y.is) return y.is-x.is;
        return withContacts ? y.nc-x.nc : (y.hc||0)-(x.hc||0);
      }).slice(0,20);
      table(box,
        [{label:'Account'},{label:'Industry'},{label:'Country'},{label:'Signals',cls:'num'},
         {label:'Intent',cls:'num r'},{label:'SG staff',cls:'num r'},{label:'HC 12M',cls:'num r'},{label:'IT HC 12M',cls:'num r'},
         ...(withContacts ? [{label:'Contacts',cls:'num r'}] : []),{label:'Tier'}],
        a.map(x=>{
          const nsig = x.s.reduce((s,v)=>s+v,0);
          const strip = `<span class="sigstrip" role="img" aria-label="${nsig} of ${SIG.length} signals present">`+
            x.s.map((v,i)=>`<i class="${v?'on':''}" data-sig="${i}" data-on="${v}"></i>`).join('')+'</span>';
          const nm = x.d ? `<a href="https://${esc(x.d)}" target="_blank" rel="noopener noreferrer">${esc(clip(x.n,42))}</a>` : esc(clip(x.n,42));
          return [
            {html:nm, cls:'nm'},
            {html:esc(clip(L.ind[x.ind],26)), cls:'dim'},
            {html:esc(L.loc[x.loc]), cls:'dim'},
            {html:strip, cls:'num'},
            {html:x.is||'–', cls:'num r'},
            {html:x.sghc==null?'–':fmt(x.sghc), cls:'num r'},
            {html:x.g12==null?'–':(x.g12>0?'+':'')+x.g12+'%', cls:'num r'},
            {html:x.itg12==null?'–':`<span class="${x.itg12<0?'down':''}">${(x.itg12>0?'+':'')+x.itg12}%</span>`, cls:'num r'},
            ...(withContacts ? [{html:x.nc||'–', cls:'num r'}] : []),
            {html:`<span class="pill ${L.pri[x.pri].replace(/\s/g,'')}">${esc(L.pri[x.pri])}</span>`},
          ];
        }),
        `Hover any signal-strip cell to see which signal it is. Account names link to the company domain.`);
      /* each cell names its own signal on hover */
      box.querySelectorAll('.sigstrip i').forEach(cell=>{
        const lbl = SIG[+cell.dataset.sig], on = cell.dataset.on === '1';
        bindTip(cell, `<div class="tt-t">${esc(lbl)}</div><div class="tt-r">${on?'<b>Signal present</b>':'Not detected'}</div>`);
      });
    }},
];

const CARDS_NETNEW = acctCards(true);
const CARDS_CG     = acctCards(false);

/* ---- contacts cards ---- */
const CON_INFO = `<span class="info" tabindex="0">i<span class="info-pop">
  <span class="hd">Where the tier comes from</span>
  <div class="tx">Each contact is joined back to its account in the <b>Net New sprouts</b> portfolio on company domain, and inherits that account&rsquo;s priority tier. Contacts whose company is not in the accounts portfolio are shown as <b>Not in portfolio</b>.</div>
</span></span>`;
const CARDS_CON = [
  { cls:'c12', title:'Portfolio Data Coverage', desc:'Enrichment quality of the full contacts portfolio · not affected by filters', tag:true,
    render(box){
      const c = DATA.summary.contCov;
      rings(box, [
        {label:'Verified email',  n:c.email,  d:c.rows, sub:'contacts with a work email'},
        {label:'Direct phone',    n:c.phone,  d:c.rows, sub:'contacts with an enriched phone'},
        {label:'Account matched', n:c.joined, d:c.rows, sub:'joined to the accounts portfolio'},
        {label:'Country known',   n:c.geo,    d:c.rows, sub:'contact country resolved'},
      ]);
    }},  { cls:'c7', title:'Target Contact Seniority', desc:'Contacts in view by decision-making level · most senior first', tag:true,
    render(box){
      const a = rows(), m = tally(a,'sen');
      const e = SEN_ORDER.map(s=>[s, m.get(RX.sen[s])||0]);
      hbars(box, e, {denom:a.length, noun:'contacts', labelW:186, ramp:i=>SEN_COL(i)});
    }},
  { cls:'c5', title:'Target Contacts by Account Tier', info:CON_INFO, desc:'Which priority of account each contact sits on', tag:true,
    render(box){
      const a = rows(), m = tally(a,'pri');
      const segs = PRI_ORDER_C.map(p=>({label:p==='Unranked'||p==='Not in portfolio'?p:'Priority '+p,
                                        value:m.get(RX.pri[p])||0, color:PRI_COL(p)}));
      donut(box, segs, {noun:'contacts', center:'Contacts'});
    }},
  { cls:'c6', title:'Top Industries', desc:'Click a bar to filter · top 10 of the contacts in view',
    render(box){
      hbars(box, byLabel(rows(),'ind','ind').slice(0,10),
        {denom:rows().length, noun:'contacts', onClick:v=>toggleFilter('ind',RX.ind[v]), active:labelSet('ind'), labelW:180});
    }},
  { cls:'c6', title:'Geographic Footprint', desc:'Contact country · click a bar to filter · top 10 resolved countries',
    render(box){
      hbars(box, byLabel(rows(),'loc','loc').slice(0,10),
        {denom:rows().length, noun:'contacts', onClick:v=>toggleFilter('loc',RX.loc[v]), active:labelSet('loc'), labelW:180});
    }},
  { cls:'c5', title:'Reachability', desc:'How actionable the contacts in view are today', tag:true,
    render(box){
      const a = rows(), n = a.length;
      if(!n) return emptyBox(box);
      const cnt = f => a.reduce((s,x)=>s+(f(x)?1:0),0);
      meters(box, [
        {glabel:'Direct channels', rows:[
          {label:'Verified work email', value:cnt(x=>x.em), of:n, noun:'contacts', tip:'Verified work email present'},
          {label:'Direct phone',        value:cnt(x=>x.ph), of:n, noun:'contacts', tip:'Enriched direct phone present'},
          {label:'Email <b>and</b> phone', value:cnt(x=>x.em&&x.ph), of:n, noun:'contacts', tip:'Both email and phone present'},
          {label:'Email <b>or</b> phone',  value:cnt(x=>x.em||x.ph), of:n, noun:'contacts', tip:'At least one direct channel present'},
        ]},
        {glabel:'Account context', rows:[
          {label:'Mapped to a portfolio account', value:cnt(x=>x.j), of:n, noun:'contacts', tip:'Company matched into the Net New sprouts portfolio'},
          {label:'On a P0 or P1 account', value:cnt(x=>['P0','P1'].includes(L.pri[x.pri])), of:n, noun:'contacts', tip:'Sits on a top-tier account'},
          {label:'On an account with 3+ signals', value:cnt(x=>x.nsig>=3), of:n, noun:'contacts', tip:'Account exhibits three or more buying signals'},
        ]},
      ]);
    }},
  { cls:'c7', title:'Function Mix', desc:'Which part of the business the contacts in view sit in', tag:true,
    render(box){
      const a = rows(), m = tally(a,'fn');
      const e = rankSort(FN_ORDER.map(f=>[f, m.get(RX.fn[f])||0]).filter(x=>x[1]));
      hbars(box, e, {denom:a.length, noun:'contacts', labelW:210});
    }},
  { cls:'c12', title:'Target Contacts per Account', desc:'Accounts in view by how many target contacts are mapped to them',
    render(box){
      const per = new Map();
      rows().forEach(x=>per.set(x.a,(per.get(x.a)||0)+1));
      const bins = new Array(10).fill(0);
      for(const v of per.values()) bins[Math.min(v,10)-1]++;
      cols(box, ['1','2','3','4','5','6','7','8','9','10+'], bins,
        {axisLabel:'Target contacts mapped per account', noun:'accounts', W:1420,
         catFmt:c=>`${c} contact${c==='1'?'':'s'}`});
    }},

];
const cards = () => S.mode === 'netnew' ? CARDS_NETNEW
                  : S.mode === 'clientgiven' ? CARDS_CG : CARDS_CON;

/* ============================================================
   KPIs
   ============================================================ */
function kpiSpecs(){
  const a = rows(), n = a.length;
  if(isAcc()){
    const f = F();
    const over = (k,t) => a.reduce((s,x)=>s+(x[k]!=null && x[k]>t?1:0),0);
    const p01 = a.reduce((s,x)=>s+(['P0','P1'].includes(L.pri[x.pri])?1:0),0);
    const intent = a.reduce((s,x)=>s+(x.is>=f.intentMin?1:0),0);
    return [
      {l:'Accounts in view', v:fmt(n), sub:`of <span class="num">${fmt(total())}</span> in the portfolio`},
      {l:'Active third-party intent', v:pct(intent,n), u:'%', sub:`<span class="num">${fmt(intent)}</span> accounts · score ≥ ${f.intentMin}`},
      {l:'IT headcount shrinking', v:pct(a.filter(itShrinking).length,n), u:'%',
       sub:`12-month · <span class="num">${fmt(a.filter(itShrinking).length)}</span> accounts losing in-house IT`},
      {l:'Growing business, shrinking IT', v:pct(a.filter(scissors).length,n), u:'%',
       sub:`<span class="num">${fmt(a.filter(scissors).length)}</span> accounts · the sharpest outsourcing case`},
      {l:'Priority P0 + P1', v:pct(p01,n), u:'%', sub:`<span class="num">${fmt(p01)}</span> hottest accounts`},
    ];
  }
  const cnt = f => a.reduce((s,x)=>s+(f(x)?1:0),0);
  const dm = cnt(x=>['C-Suite & Founder','VP / SVP','Director / Head'].includes(L.sen[x.sen]));
  const it = cnt(x=>L.fn[x.fn]==='IT & Technology');
  const both = cnt(x=>x.em&&x.ph), reach = cnt(x=>x.em||x.ph);
  const hot = cnt(x=>['P0','P1'].includes(L.pri[x.pri]));
  const accts = new Set(a.map(x=>x.a)).size;
  return [
    {l:'Contacts in view', v:fmt(n), sub:`across <span class="num">${fmt(accts)}</span> accounts`},
    {l:'Director level and above', v:pct(dm,n), u:'%', sub:`<span class="num">${fmt(dm)}</span> decision-makers`},
    {l:'IT &amp; Technology function', v:pct(it,n), u:'%', sub:`<span class="num">${fmt(it)}</span> technical buyers`},
    {l:'Email <em>and</em> phone', v:pct(both,n), u:'%', sub:`<span class="num">${fmt(both)}</span> of <span class="num">${fmt(reach)}</span> reachable contacts`},
    {l:'On P0 + P1 accounts', v:pct(hot,n), u:'%', sub:`<span class="num">${fmt(hot)}</span> contacts on hot accounts`},
  ];
}
function renderKpis(){
  const box = $('#kpis'); box.innerHTML = '';
  kpiSpecs().forEach(c=>{
    const d = document.createElement('div'); d.className = 'kpi';
    d.innerHTML = `<div class="k-lbl">${c.l}</div><div class="k-val">${c.v}<span class="u">${c.u||''}</span></div><div class="k-sub">${c.sub}</div>`;
    box.appendChild(d);
  });
}

/* ============================================================
   Cards / grid
   ============================================================ */
function renderCards(){
  const grid = $('#grid'); grid.innerHTML = '';
  const tagLbl = MODE_LABEL[S.mode];
  cards().forEach(c=>{
    const card = document.createElement('div'); card.className = 'card ' + c.cls;
    card.innerHTML = `<div class="card-h"><div><div class="card-t">${esc(c.title)}${c.info||''}</div>
      <div class="card-d">${c.desc}</div></div>${c.tag?`<div class="tag">${tagLbl}</div>`:''}</div><div class="chart"></div>`;
    grid.appendChild(card);
    try { c.render(card.querySelector('.chart')); }
    catch(err){ card.querySelector('.chart').innerHTML = `<div class="empty">Could not draw this chart.</div>`; console.error(c.title, err); }
  });
}

/* ============================================================
   Filters
   ============================================================ */
const DICT_OF = { ind:'ind', loc:'loc', bnd:'bnd' };
function labelSet(field){ return new Set([...F()[field]].map(i=>L[DICT_OF[field]][i])); }
function optionUniverse(field){
  const src = S.mode === 'netnew' ? ACC : S.mode === 'clientgiven' ? CGV : CON, dict = DICT_OF[field];
  const m = tally(src, field), out = [];
  for(const [k,v] of m) out.push([L[dict][k], v, k]);
  if(field==='bnd'){
    return out.sort((a,b)=>{ const ia=BANDS.indexOf(a[0]), ib=BANDS.indexOf(b[0]);
      return (ia<0?99:ia)-(ib<0?99:ib); });
  }
  return out.sort((a,b)=>{ const pa=isPlace(a[0]), pb=isPlace(b[0]);
    if(pa!==pb) return pa?1:-1; return b[1]-a[1]; });
}
function toggleFilter(field, ix){
  if(ix==null) return;
  const set = F()[field];
  set.has(ix) ? set.delete(ix) : set.add(ix);
  renderAll();
}
const FLABEL = { ind:'industries', loc:'locations', bnd:'company sizes' };
function buildPanel(field, btn){
  const fg = btn.parentElement;
  let panel = fg.querySelector('.panel');
  if(panel){ panel.classList.toggle('open'); closeOthers(panel); return; }
  if(field==='adv'){ buildAdvPanel(fg); return; }
  panel = document.createElement('div'); panel.className = 'panel open';
  const setRef = F()[field], opts = optionUniverse(field);
  panel.innerHTML = `<div class="panel-search"><input type="text" placeholder="Search ${FLABEL[field]}…" aria-label="Search ${FLABEL[field]}"></div>
    <div class="opts"></div><div class="panel-foot"><button class="mut" data-clr>Clear</button><button data-done>Done</button></div>`;
  const optsBox = panel.querySelector('.opts');
  function paint(q){
    optsBox.innerHTML = '';
    const ql = q.toLowerCase();
    const list = opts.filter(o=>o[0].toLowerCase().includes(ql)).slice(0,300);
    list.forEach(o=>{
      const d = document.createElement('div');
      d.className = 'opt' + (setRef.has(o[2])?' on':'') + (isPlace(o[0])?' ph':'');
      d.innerHTML = `<div class="box"></div><div class="nm" title="${esc(o[0])}">${esc(o[0])}</div><div class="qty">${fmt(o[1])}</div>`;
      d.addEventListener('click', ()=>{ setRef.has(o[2]) ? setRef.delete(o[2]) : setRef.add(o[2]); d.classList.toggle('on'); renderAll(); });
      optsBox.appendChild(d);
    });
    if(!optsBox.children.length) optsBox.innerHTML = '<div class="empty" style="padding:20px">No matches</div>';
  }
  paint('');
  panel.querySelector('input').addEventListener('input', e=>paint(e.target.value));
  panel.querySelector('[data-clr]').addEventListener('click', ()=>{ setRef.clear(); paint(panel.querySelector('input').value); renderAll(); });
  panel.querySelector('[data-done]').addEventListener('click', ()=>panel.classList.remove('open'));
  fg.appendChild(panel); closeOthers(panel);
}
function closeOthers(open){ $$('.panel').forEach(p=>{ if(p!==open) p.classList.remove('open'); }); }
function syncFilterButtons(){
  ['ind','loc','bnd'].forEach(f=>{
    const set = F()[f], btn = document.querySelector(`.fbtn[data-f="${f}"]`), t = btn.querySelector('.ftxt');
    if(!set.size){ btn.classList.remove('has'); t.textContent = 'All'; return; }
    btn.classList.add('has');
    const first = L[DICT_OF[f]][[...set][0]] || '';
    t.innerHTML = (set.size===1 ? esc(clip(first,16)) : set.size+' selected') + ` <span class="cnt">${set.size}</span>`;
  });
}

/* ---------------- advanced cohort builder ---------------- */
const firstField = () => Object.keys(FIELDS())[0];
function newCond(){ const k = firstField(), d = FIELDS()[k].def;
  return {field:k, op:d.op, val:Array.isArray(d.val)?d.val.slice():d.val}; }
function renderCohort(){
  const body = $('#adv-body'); if(!body) return;
  body.innerHTML = '';
  const groups = F().cohort.groups;
  if(!groups.length){
    const e = document.createElement('div'); e.className = 'cohort-empty';
    e.innerHTML = `<p>No conditions yet. Build a segment such as ${isAcc()
      ? '<b>IT headcount growth &gt; 10%</b> AND <b>buying signal has any of Device Refresh, Endpoint Management</b>'
      : '<b>seniority is any of C-Suite, Director</b> AND <b>account priority tier is any of P0, P1</b>'}.
      Conditions inside a group are combined with AND; groups are combined with OR.</p>
      <button class="btn-add-group" id="firstGroup">+ Add your first condition</button>`;
    body.appendChild(e);
    $('#firstGroup').addEventListener('click', ()=>{ groups.push({conds:[newCond()]}); renderCohort(); renderAll(); });
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'cg-wrap';
  groups.forEach((g,gi)=>{
    if(gi>0){ const o = document.createElement('div'); o.className='cg-or'; o.textContent='OR'; wrap.appendChild(o); }
    const box = document.createElement('div'); box.className = 'cg';
    const head = document.createElement('div'); head.className = 'cg-head';
    head.innerHTML = `Group ${gi+1} — match <span class="allof">ALL</span> of:`;
    box.appendChild(head);
    if(groups.length>1){
      const del = document.createElement('button'); del.className='cg-del'; del.innerHTML='&times;'; del.title='Remove group';
      del.addEventListener('click', ()=>{ groups.splice(gi,1); renderCohort(); renderAll(); });
      box.appendChild(del);
    }
    g.conds.forEach((c,ci)=>box.appendChild(condRow(g,c,gi,ci)));
    const add = document.createElement('button'); add.className='cg-add'; add.textContent='+ AND condition';
    add.addEventListener('click', ()=>{ g.conds.push(newCond()); renderCohort(); renderAll(); });
    box.appendChild(add);
    wrap.appendChild(box);
  });
  body.appendChild(wrap);
}
function condRow(g,c,gi,ci){
  const FL = FIELDS();
  const row = document.createElement('div'); row.className = 'cond';
  const and = document.createElement('span'); and.className='andchip'; and.textContent = ci===0?'':'AND'; row.appendChild(and);
  const fsel = document.createElement('select'); fsel.className='c-field'; fsel.setAttribute('aria-label','Field');
  for(const k in FL){ const o=document.createElement('option'); o.value=k; o.textContent=FL[k].label; if(k===c.field)o.selected=true; fsel.appendChild(o); }
  fsel.addEventListener('change', ()=>{ c.field=fsel.value; const d=FL[c.field].def;
    c.op=d.op; c.val=Array.isArray(d.val)?d.val.slice():d.val; renderCohort(); renderAll(); });
  row.appendChild(fsel);
  const type = FL[c.field].type, ops = opsFor(type);
  const osel = document.createElement('select'); osel.className='c-op'; osel.setAttribute('aria-label','Operator');
  for(const k in ops){ const o=document.createElement('option'); o.value=k; o.textContent=ops[k]; if(k===c.op)o.selected=true; osel.appendChild(o); }
  osel.addEventListener('change', ()=>{
    const nowMulti = isMultiOp(osel.value); c.op = osel.value;
    if(nowMulti && !Array.isArray(c.val)) c.val = (c.val===''||c.val==null)?[]:[String(c.val)];
    if(!nowMulti && Array.isArray(c.val)) c.val = c.val.length ? c.val[0] : '';
    renderCohort(); renderAll();
  });
  row.appendChild(osel);
  if(type==='num'){
    const inp=document.createElement('input'); inp.className='c-val num'; inp.type='number'; inp.value=c.val; inp.setAttribute('aria-label','Value');
    inp.addEventListener('change', ()=>{ c.val=inp.value; renderAll(); });
    row.appendChild(inp);
    if(FL[c.field].unit){ const u=document.createElement('span');
      u.style.cssText='font-family:var(--fm);font-size:11.5px;font-weight:600;color:var(--muted)'; u.textContent=FL[c.field].unit; row.appendChild(u); }
  } else if(type==='bool'){
    const vsel=document.createElement('select'); vsel.className='c-val'; vsel.setAttribute('aria-label','Value');
    BOOL_VALS.forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; if(v===String(c.val))o.selected=true; vsel.appendChild(o); });
    vsel.addEventListener('change', ()=>{ c.val=vsel.value; renderAll(); });
    row.appendChild(vsel);
  } else {
    const chips=document.createElement('div'); chips.className='mschips';
    const sel=new Set(asArr(c.val).map(String));
    FL[c.field].opts().forEach(([v,l])=>{
      const ch=document.createElement('button'); ch.type='button'; ch.className='mschip'+(sel.has(v)?' on':''); ch.textContent=l;
      ch.addEventListener('click', ()=>{ sel.has(v)?sel.delete(v):sel.add(v); c.val=[...sel]; ch.classList.toggle('on'); renderAll(); });
      chips.appendChild(ch);
    });
    row.appendChild(chips);
  }
  const del=document.createElement('button'); del.className='c-del'; del.innerHTML='&times;'; del.title='Remove condition';
  del.addEventListener('click', ()=>{ g.conds.splice(ci,1); if(!g.conds.length) F().cohort.groups.splice(gi,1); renderCohort(); renderAll(); });
  row.appendChild(del);
  return row;
}
function buildAdvPanel(fg){
  const panel = document.createElement('div'); panel.className='panel adv open';
  panel.innerHTML = `<div class="adv-head"><div class="t">Advanced cohort filter
      <div class="d">AND within a group · OR across groups · applies to every card on the page</div></div>
    <div class="m" id="advMatch"></div></div>
    <div class="adv-body" id="adv-body"></div>
    <div class="adv-foot"><button class="btn-add-group" id="addGroup">+ OR group</button>
      <button class="btn-clear-cohort" id="clearCohort">Clear</button>
      <button data-done style="margin-left:auto;background:var(--mast);color:var(--mast-ink);border:0;border-radius:9px;padding:9px 18px;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">Done</button></div>`;
  fg.appendChild(panel); closeOthers(panel);
  const fgr = fg.getBoundingClientRect(), w = Math.min(660, innerWidth-24);
  const leftVp = Math.max(12, Math.min(fgr.right-w, innerWidth-w-12));
  panel.style.left = (leftVp-fgr.left)+'px'; panel.style.right='auto'; panel.style.width = w+'px';
  panel.querySelector('#addGroup').addEventListener('click', ()=>{ F().cohort.groups.push({conds:[newCond()]}); renderCohort(); renderAll(); });
  panel.querySelector('#clearCohort').addEventListener('click', ()=>{ F().cohort.groups = []; renderCohort(); renderAll(); });
  panel.querySelector('[data-done]').addEventListener('click', ()=>panel.classList.remove('open'));
  renderCohort(); updateAdvUI();
}
function updateAdvUI(){
  const active = cohortActive();
  const nConds = F().cohort.groups.reduce((s,g)=>s+g.conds.length,0);
  const btn = document.querySelector('.fbtn[data-f="adv"]');
  if(btn){ btn.classList.toggle('has', active);
    btn.querySelector('.ftxt').innerHTML = active ? `<span class="cnt">${nConds}</span>` : ''; }
  const m = $('#advMatch'); if(!m) return;
  if(!active){ m.innerHTML = `<div class="v" style="color:var(--muted)">—</div><div class="l">no cohort set</div>`; return; }
  const n = rows().length;
  m.innerHTML = `<div class="v">${fmt(n)}</div><div class="l">of ${fmt(total())} ${noun()} match</div>`;
}

/* ============================================================
   chrome + render
   ============================================================ */
function updateScount(){
  $('#scount').innerHTML = `Showing <b>${fmt(rows().length)}</b> of <b>${fmt(total())}</b> ${noun()}`;
}
function renderAll(){
  renderKpis(); renderCards(); updateScount(); updateAdvUI(); syncFilterButtons();
}

/* theme: system -> light -> dark -> system */
const THEMES = ['system','light','dark'], TICON = {system:'☼',light:'☀',dark:'☽'};
let themeIx = 0;
$('#themebtn').addEventListener('click', ()=>{
  themeIx = (themeIx+1)%3;
  const t = THEMES[themeIx];
  if(t==='system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('#themebtn').innerHTML = TICON[t];
  $('#themebtn').title = `Theme: ${t}`;
});

$('#modes').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  $$('#modes button').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-selected','false'); });
  b.classList.add('active'); b.setAttribute('aria-selected','true');
  S.mode = b.dataset.mode;
  document.body.dataset.mode = S.mode;
  $$('.panel').forEach(p=>p.remove());   // option universes differ per dataset
  renderAll();
});
$$('.fbtn').forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); buildPanel(b.dataset.f, b); }));
document.addEventListener('click', e=>{
  if(!e.target.isConnected) return;          // node was re-rendered away, not an outside click
  if(e.target.closest('.fgroup')) return;    // inside a panel
  $$('.panel').forEach(p=>p.classList.remove('open'));
});
$('#reset').addEventListener('click', ()=>{
  const f = F(); f.ind.clear(); f.loc.clear(); f.bnd.clear(); f.cohort.groups = [];
  if(isAcc()){ f.intentMin = 1; f.gWin = '12'; f.itWin = '12'; }
  $$('.panel').forEach(p=>p.remove());
  renderAll();
});
window.addEventListener('mousemove', e=>{ if(tip.style.opacity>0) moveTip(e); });
window.addEventListener('keydown', e=>{ if(e.key==='Escape') $$('.panel').forEach(p=>p.classList.remove('open')); });

document.body.dataset.mode = S.mode;
$('#themebtn').innerHTML = TICON.system;

function renderChrome(){
  $('#mn-netnew').textContent      = fmt(DATA.accounts.n);
  $('#mn-clientgiven').textContent = fmt(DATA.clientGiven.n);
  $('#mn-contacts').textContent    = fmt(DATA.contacts.n);
  $('#foot-src').innerHTML =
      `Source: Google Sheet &middot; <b>Net New sprouts</b> ${fmt(DATA.accounts.n)} accounts`
    + ` &middot; <b>Client Given</b> ${fmt(DATA.clientGiven.n)} accounts`
    + ` &middot; <b>Contacts</b> ${fmt(DATA.contacts.n)} across ${fmt(DATA.summary.contCov.accts)} companies`;
}
renderChrome();
renderAll();

/* ============================================================
   Live sync — re-derive from the sheet every REFRESH_MS
   ============================================================ */
/* Change detection fingerprints only the positional arrays and the dictionary
   lists. Object key order differs between the Python-built snapshot and the
   browser-built rebuild, so stringifying the whole payload would always
   "differ" on the first sync even when the sheet is untouched. */
const FP_KEYS = ['ind','loc','bnd','pri','sen','fn','topic'];
const fingerprint = raw => JSON.stringify([raw.accounts.rows, (raw.clientGiven||{rows:[]}).rows,
                                           raw.contacts.rows, FP_KEYS.map(k => raw.dict[k] || [])]);
let lastPayload = fingerprint(SNAPSHOT);
let syncing = false, pendingRaw = null, lastSyncAt = null;

const liveEl = () => $('#live');
function setLive(state, detail){
  const el = liveEl(); if(!el) return;
  el.dataset.state = state;
  el.querySelector('.lt').textContent = ({syncing:'Syncing…', live:'Live', deferred:'Update ready',
    stale:'Stale', snapshot:'Snapshot'})[state] || state;
  el.title = detail || '';
}
const clockOf = d => d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

function panelOpen(){ return !!document.querySelector('.panel.open'); }

function applyRaw(raw){
  const y = window.scrollY;
  adopt(raw);
  renderChrome();
  renderAll();
  window.scrollTo(0, y);
  lastSyncAt = new Date();
  setLive('live', `Sheet re-read at ${clockOf(lastSyncAt)} · refreshes every ${Math.round(REFRESH_MS/1000)}s`);
}

async function sync(){
  if(syncing) return;
  syncing = true;
  const first = lastSyncAt === null;
  if(first) setLive('syncing', 'Loading…');
  try{
    // no-store only on the direct path; the proxy is meant to be edge-cached
    const opts = DIRECT ? {cache:'no-store'} : {};
    const grab = tab => fetch(sourceUrl(tab), opts).then(r => {
      if(!r.ok) throw new Error(`${tab} responded ${r.status}`);
      return r.text();
    });
    const [accCsv, conCsv, cgCsv] = await Promise.all([
      grab('accounts'), grab('contacts'), grab('clientGiven'),
    ]);
    const raw = buildData(accCsv, conCsv, cgCsv);
    const payload = fingerprint(raw);
    if(payload === lastPayload){
      lastSyncAt = new Date();
      setLive('live', `No change · last checked ${clockOf(lastSyncAt)}`);
    } else {
      lastPayload = payload;
      // don't yank a filter panel out from under the user mid-selection
      if(panelOpen()){
        pendingRaw = raw;
        setLive('deferred', 'The sheet changed — applying as soon as this menu closes');
      } else {
        applyRaw(raw);
      }
    }
  }catch(err){
    console.warn('live sync failed:', err);
    setLive(lastSyncAt ? 'stale' : 'snapshot',
      lastSyncAt ? `Could not reach the sheet · showing data from ${clockOf(lastSyncAt)}`
                 : `Could not reach the sheet · showing the snapshot built ${SNAPSHOT_AT}`);
  }finally{ syncing = false; }
}

/* a deferred update lands once every panel is closed */
setInterval(()=>{ if(pendingRaw && !panelOpen()){ const r = pendingRaw; pendingRaw = null; applyRaw(r); } }, 1000);
setInterval(()=>{ if(!document.hidden) sync(); }, REFRESH_MS);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) sync(); });
liveEl().addEventListener('click', sync);
setLive('snapshot', `Snapshot built ${SNAPSHOT_AT} · checking the sheet…`);
sync();

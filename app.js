// Mon Budget — application 100 % locale. Les données restent dans le stockage du navigateur.
'use strict';
const KEY = 'monbudget.v1';
const CATS = {
  'Salaire': 'in', 'Autres revenus': 'in',
  'Logement': 'out', 'Courses': 'out', 'Restaurants': 'out', 'Transport': 'out', 'Abonnements': 'out',
  'Santé': 'out', 'Loisirs': 'out', 'Shopping': 'out', 'Impôts': 'out', 'Frais bancaires': 'out', 'Assurances': 'out', 'Téléphone & Internet': 'out',
  'Voyages': 'out', 'Cadeaux & dons': 'out', 'Divers': 'out',
  'Frais de change': 'out', 'Crédit & prêts': 'out',
  'Épargne': 'move', 'Investissement': 'move', 'Virement interne': 'move', 'Change de devises': 'move'
};
// Règles par défaut : toujours appliquées APRÈS vos règles personnelles (S.rules), et mises à jour avec l'app.
const DEFAULT_RULES = [
  ['echeance pret|ech pret|ech. pret|pret immo|pret habitat|credit immo|remboursement pret|rembt pret|remb pret|mensualite pret|amortissement|cofidis|sofinco|cetelem|franfinance|credit conso', 'Crédit & prêts'],
  ['airbnb|booking.com|air france|easyjet|ryanair|transavia|vueling|hotel|abritel|expedia', 'Voyages'],
  ['uber eats|deliveroo|just eat|restaurant|mcdo|mc donald|burger king|kfc|brasserie|boulangerie|starbucks', 'Restaurants'],
  ['carrefour|leclerc|auchan|lidl|intermarche|monoprix|franprix|casino|super u|aldi|picard|grand frais|migros|coop |denner|lidl suisse|manor food', 'Courses'],
  ['sncf|ratp|navigo|uber|bolt|blablacar|total|esso|shell|bp |peage|autoroute|parking|essence', 'Transport'],
  ['free mobile|freebox|orange|sfr|bouygues|sosh|red by|b&you|livebox', 'Téléphone & Internet'],
  ['netflix|spotify|deezer|disney|canal|amazon prime|icloud|google storage|apple.com|youtube|chatgpt|openai|audible', 'Abonnements'],
  ['pharmacie|docteur|medecin|cpam|mutuelle|dentiste|ameli|doctolib|hopital', 'Santé'],
  ['loyer|edf|engie|veolia|eau |assurance hab|syndic|taxe fonciere', 'Logement'],
  ['dgfip|impot|finances publiques', 'Impôts'],
  ['frais|cotisation|commission|agios', 'Frais bancaires'],
  ['fnac|amazon|zara|h&m|decathlon|ikea|leroy merlin|cdiscount|vinted', 'Shopping'],
  ['cinema|ugc|pathe|steam|playstation|fitness|basic fit|concert|ticketmaster', 'Loisirs'],
  ['salaire|paie|payfit|remuneration|lohn|gehalt|salary|traitement', 'Salaire'],
  ['interest|zinsen|interets|dividend|dividende|caf |remboursement', 'Autres revenus'],
  ['buy|kauf|achat titre|sell|verkauf|vente titre|savings plan|sparplan|plan d.investissement', 'Investissement'],
  ['trade republic|livret|ldd|lep |pel |assurance vie', 'Épargne'],
  ['cntfs|lamal|cpam frontalier|cmu frontalier|groupe mutuel|helsana|css assurance|swica|assura', 'Assurances'],
  ['assurance|axa|maif|macif|matmut|allianz|generali|groupama|alan ', 'Assurances'],
  ['don |dons |croix rouge|unicef|leetchi|lydia cagnotte|cadeau', 'Cadeaux & dons'],
  ['telexoo|revolut|transferwise|wise |swissquote|ibanfirst|kantox|western union|change devise|change de devise|conversion devise', 'Change de devises'],
  ['deposit|einzahlung|removal|auszahlung|vir interne|virement interne|vir de m|vir sepa m', 'Virement interne']
].map(([kw, cat]) => ({ kw, cat }));

const S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) { const b = blank(); delete b.rulesVersion; return Object.assign(b, s); } } catch (e) {}
  return blank();
}
function blank() { return { accounts: [], tx: [], rules: [], rulesVersion: 2, budgets: {}, assets: [], snapshots: {}, settings: {} }; }
// Migration : les anciennes versions copiaient les règles par défaut dans vos données (elles ne se mettaient
// donc jamais à jour). On ne garde que vos règles personnelles et on reclasse les opérations automatiques.
function migrateRules() {
  if ((S.rulesVersion || 1) >= 2) return false;
  const defaults = new Set(DEFAULT_RULES.map(r => r.kw));
  S.rules = (S.rules || []).filter(r => r.kw && !defaults.has(r.kw) && (r.kw.match(/\|/g) || []).length < 3);
  S.rulesVersion = 2;
  for (const t of S.tx) if (!t.manual) { delete t.paired; delete t.xpair; delete t.fx; t.cat = autoCat(t); }
  return true;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Stockage plein ou indisponible'); } }

// ---------- utilitaires ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: S.settings.currency || 'EUR', maximumFractionDigits: d, minimumFractionDigits: d });
const fmtCur = (n, cur) => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 });
const fmt2 = n => fmt(n, 2);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const ym = d => Period.of(d); // mois budgétaire (d'une paie à l'autre)
const monthName = m => new Date(m + '-01T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const kindOf = c => CATS[c] || 'out';
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2500); }
function hash(t) { const s = Parsers.norm(t); let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h.toString(36); }

function categorize(tx) {
  const l = ' ' + Parsers.norm(tx.label) + ' ';
  for (const r of S.rules.concat(DEFAULT_RULES)) {
    if (CATS[r.cat] === 'in' && tx.amount < 0) continue; // un débit n'est jamais un revenu (ex. « remboursement prêt »)
    if (r.kw.split('|').some(k => k && l.includes(Parsers.norm(k)))) return r.cat;
  }
  return tx.amount > 0 ? 'Autres revenus' : 'Divers';
}

// ---------- calculs ----------
// ---------- devises et comptes joints ----------
// Les opérations sont converties en euros à l'import (montant d'origine gardé dans t.orig).
// Un compte joint compte pour la part de l'utilisateur (ex. 50 %) dans le budget et le patrimoine.
function shareOf(accId) { const a = S.accounts.find(x => x.id === accId); return a && a.share != null ? a.share : 1; }
function txAmt(t) { return t.amount * shareOf(t.acc); }
const isInternal = c => c === 'Virement interne' || c === 'Change de devises';
// Catégorie automatique d'une opération (règles + cas du compte joint)
function autoCat(t) {
  const c = categorize(t);
  return shareOf(t.acc) < 1 && c === 'Autres revenus' ? 'Virement interne' : c;
}
// Repère les mouvements entre vos propres comptes (recalcul complet à chaque import) :
// 1) virements dans la même devise (montant identique, signe opposé, 5 jours max)
// 2) changes de devises (Telexoo, Revolut, banque…) : voir exchange.js
function linkTransfers() {
  Exchange.reset(autoCat);
  const list = S.tx.filter(t => !t.manual).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set();
  for (const d of list) {
    if (d.amount >= 0 || used.has(d.id)) continue;
    const t0 = new Date(d.date).getTime();
    const c = list.find(x => !used.has(x.id) && x.acc !== d.acc && x.amount > 0 && (x.cur || 'EUR') === (d.cur || 'EUR')
      && Math.abs(x.orig + d.orig) < 0.01 && Math.abs(new Date(x.date).getTime() - t0) <= 5 * 864e5);
    if (c) { d.cat = c.cat = 'Virement interne'; d.paired = c.paired = true; used.add(d.id); used.add(c.id); }
  }
  Exchange.link();
}
// Coût réel d'un change (écart avec le taux BCE), compté comme une dépense « Frais de change »
const fxFee = t => t.fx && t.fx.cost ? t.fx.cost * shareOf(t.acc) : 0;

// Détecte le salaire même si le libellé est inconnu : même émetteur, chaque mois, montant important
function detectSalary() {
  const groups = {};
  for (const t of S.tx) if (t.amount > 0 && t.cat === 'Autres revenus' && !t.manual) (groups[Insights.merchant(t.label)] = groups[Insights.merchant(t.label)] || []).push(t);
  const minAmt = 800 * FX.now('EUR'); // ~800 € dans la devise principale
  for (const list of Object.values(groups)) {
    const big = list.filter(t => t.amount >= minAmt);
    if (new Set(big.map(t => t.date.slice(0, 7))).size >= 2) big.forEach(t => { t.cat = 'Salaire'; });
  }
}

function monthStats(m) {
  const res = { in: 0, out: 0, move: 0, byCat: {} };
  const invest = new Set(S.accounts.filter(a => a.type === 'invest' || a.type === 'epargne').map(a => a.id));
  for (const t of S.tx) {
    if (ym(t.date) !== m) continue;
    const k = kindOf(t.cat);
    const v = txAmt(t);
    if (k === 'in') res.in += v;
    else if (k === 'out') { res.out -= v; res.byCat[t.cat] = (res.byCat[t.cat] || 0) - v; }
    else {
      if (!isInternal(t.cat) && !invest.has(t.acc)) res.move -= v; // argent sorti vers épargne/placements
      const fee = fxFee(t); if (fee) { res.out += fee; res.byCat['Frais de change'] = (res.byCat['Frais de change'] || 0) + fee; }
    }
  }
  res.net = res.in - res.out;
  res.rate = res.in > 0 ? res.net / res.in : 0;
  return res;
}
function accountValue(a) { return ((a.balance || 0) * FX.now(FX.accCur(a)) + (a.positions || []).reduce((s, p) => s + (p.value || 0), 0) * FX.now('EUR')) * (a.share ?? 1); }
function wealth() {
  const by = { courant: 0, epargne: 0, invest: 0, autre: 0 };
  for (const a of S.accounts) by[a.type || 'autre'] += accountValue(a);
  for (const x of S.assets) by.autre += x.value || 0;
  return { by, total: Object.values(by).reduce((a, b) => a + b, 0) };
}
function months() {
  const set = new Set(S.tx.map(t => ym(t.date)));
  set.add(Period.current());
  return [...set].sort().reverse();
}
function snapshot() {
  if (!S.accounts.length && !S.assets.length) return;
  S.snapshots[new Date().toISOString().slice(0, 7)] = Math.round(wealth().total);
  save();
}

// ---------- vues ----------
let view = 'dash', month = Period.current();
const views = {};

views.dash = () => {
  const s = monthStats(month), w = wealth();
  const ms = months().slice(0, 6).reverse();
  const stats = ms.map(m => [m, monthStats(m)]);
  const max = Math.max(1, ...stats.map(([, x]) => Math.max(x.in, x.out)));
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const budgetRows = Object.entries(S.budgets).filter(([, v]) => v > 0);
  const totalBudget = budgetRows.reduce((a, [, v]) => a + v, 0);
  const isCur = month === Period.current(), d = Insights.daily(S, kindOf);
  const nat = Object.entries(s.byCat).reduce((o, [c, v]) => (o[Insights.natureOf(S, c)] += v, o), { besoin: 0, envie: 0 });
  const p = Insights.profile(S, kindOf);
  return `
  ${isCur ? bilanCard() : ''}
  ${Period.label(month) ? `<div class="mut" style="font-size:13px;margin:2px 2px 0">Mois budgétaire ${Period.label(month)} · paie le ${Period.payday()}</div>` : ''}
  ${isCur && d.income > 0 ? `<div class="card" style="border-color:var(--acc)">
    <h2>Aujourd’hui, vous pouvez dépenser</h2>
    <div style="font-size:34px;font-weight:800"><span class="${d.remaining > 0 && d.leftToday > 0 ? 'pos' : 'neg'}">${fmt(Math.max(0, d.leftToday))}</span></div>
    <div class="mut" style="font-size:13px">${d.remaining > 0 ? `${fmt(d.remaining)} d’envies restantes sur ${d.daysLeft} jour(s) · obligations prévues ${fmt(d.besoins)} · épargne visée ${Math.round(d.target * 100)} %` : `Enveloppe « envies » du mois dépassée de ${fmt(-d.remaining)}. Limitez-vous aux dépenses obligatoires.`}</div>
    <div class="bar"><i class="${d.remaining < 0 ? 'over' : ''}" style="width:${Math.min(100, d.envelope > 0 ? d.spent / d.envelope * 100 : 100).toFixed(1)}%"></i></div>
  </div>` : ''}
  ${(() => { const f = FX.salary(S, Insights.refMonths(S, 3)); if (!f) return '';
    return `<div class="card"><h2>💱 Salaire en ${f.cur}</h2>
      <div class="row"><span class="t">Salaire moyen<small>${fmtCur(f.orig, f.cur)} par mois</small></span><span class="num">${fmt(f.atNow)}</span></div>
      <div class="row"><span class="t">Taux du jour<small>90 j : min ${f.min.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} · max ${f.max.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</small></span><span class="num">1 ${f.cur} = ${f.rate.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${FX.main()}</span></div>
      <div class="row"><span class="t">Budget calculé au taux prudent<small>le plus bas des 90 derniers jours</small></span><span class="num">${fmt(f.prudent)}</span></div>
      <p class="mut" style="font-size:13px;margin:6px 0 0">1 centime de variation du taux = ${fmt(f.perCent)} par mois sur votre salaire.</p></div>`; })()}
  ${exchangeCard()}
  ${p.score != null ? `<div class="card" data-goto="profile" style="display:flex;align-items:center;gap:12px"><span style="font-size:34px">${p.e}</span><div style="flex:1"><b>${p.name}</b><div class="mut" style="font-size:13px">Score de santé financière ${p.score}/100 · voir l’analyse ›</div></div></div>` : ''}
  <div class="kpis">
    <div class="kpi big"><div class="l">Reste à vivre / épargne du mois</div><div class="v ${s.net >= 0 ? 'pos' : 'neg'}">${fmt(s.net)}</div>
      <div class="mut" style="font-size:13px">Taux d'épargne : <b>${Math.round(s.rate * 100)} %</b>${s.move ? ` · placé : ${fmt(s.move)}` : ''}</div></div>
    <div class="kpi"><div class="l">Revenus</div><div class="v pos">${fmt(s.in)}</div></div>
    <div class="kpi"><div class="l">Dépenses</div><div class="v neg">${fmt(s.out)}</div></div>
    <div class="kpi"><div class="l">dont obligatoires</div><div class="v">${fmt(nat.besoin)}</div></div>
    <div class="kpi"><div class="l">dont envies</div><div class="v">${fmt(nat.envie)}</div></div>
    <div class="kpi big"><div class="l">Patrimoine total</div><div class="v">${fmt(w.total)}</div>
      <div class="mut" style="font-size:13px">Courant ${fmt(w.by.courant)} · Épargne ${fmt(w.by.epargne)} · Placements ${fmt(w.by.invest)}${w.by.autre ? ' · Autres ' + fmt(w.by.autre) : ''}</div></div>
  </div>
  ${totalBudget ? `<div class="card"><h2>Budget du mois</h2>
    ${barRow('Total des catégories budgétées', budgetRows.reduce((x, [c]) => x + (s.byCat[c] || 0), 0), totalBudget)}
    ${budgetRows.map(([c, v]) => barRow(c, s.byCat[c] || 0, v)).join('')}</div>` : ''}
  <div class="card"><h2>Dépenses par catégorie</h2>
    ${cats.length ? cats.map(([c, v]) => `<div class="row"><span class="t">${esc(c)} <span class="tag">${Insights.natureOf(S, c) === 'besoin' ? 'obligatoire' : 'envie'}</span><div class="bar"><i style="width:${(v / s.out * 100).toFixed(1)}%"></i></div></span><span class="num">${fmt(v)}</span></div>`).join('') : '<p class="mut">Aucune dépense ce mois-ci. Importez vos relevés dans l’onglet Import.</p>'}
  </div>
  <div class="card"><h2>6 derniers mois <span class="tag" style="background:var(--pos);color:#fff">revenus</span> <span class="tag" style="background:var(--neg);color:#fff">dépenses</span></h2>
    <div class="chart">${stats.map(([m, x]) => `<div class="c"><div class="pair"><i class="in" style="height:${x.in / max * 100}%"></i><i class="out" style="height:${x.out / max * 100}%"></i></div>${new Date(m + '-01T12:00').toLocaleDateString('fr-FR', { month: 'short' })}</div>`).join('')}</div>
    ${stats.map(([m, x]) => `<div class="row"><span class="t">${monthName(m)}</span><span class="num ${x.net >= 0 ? 'pos' : 'neg'}">${x.net >= 0 ? '+' : ''}${fmt(x.net)}</span></div>`).reverse().join('')}
  </div>`;
};
// Bilan global : est-ce que je dépense plus que je ne gagne ? combien puis-je épargner ?
function bilanCard() {
  const nM = S.settings.bilanMonths || 6, f = Insights.flow(S, kindOf, nM);
  if (!f || (f.income <= 0 && f.current.income <= 0)) return '';
  const pm = f.perMonth, ok = pm.net >= 0;
  const pts = f.curve, n = pts.length, vals = pts.map(p => p[1]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), W = 300, H = 70;
  const X = i => (i / Math.max(1, n - 1)) * W, Y = v => H - (v - lo) / Math.max(1, hi - lo) * H;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const sel = [3, 6, 12].map(d => `<button class="btn sm ${d === nM ? '' : 'sec'}" data-bilan="${d}">${d} mois</button>`).join(' ');
  const c = f.current;
  return `<div class="card" style="border-color:${ok ? 'var(--pos)' : 'var(--neg)'}">
    <h2>Bilan global : entrées et sorties</h2>
    <div style="display:flex;gap:6px;margin-bottom:10px">${sel}</div>
    ${f.months ? `<div class="mut" style="font-size:12px;margin-bottom:6px">Moyenne sur ${f.months} mois budgétaire${f.months > 1 ? 's' : ''} complet${f.months > 1 ? 's' : ''} (chaque salaire face aux dépenses qu’il finance)${f.deficitMonths ? ` · ${f.deficitMonths} mois en déficit` : ''}</div>` : ''}
    ${!f.months ? '<p class="mut">Pas encore de mois complet : le bilan apparaîtra après votre prochaine paie.</p>' : ''}
    <div style="font-size:15px;margin-bottom:6px;${f.months ? '' : 'display:none'}">${ok
      ? `✅ Vous gagnez <b>plus</b> que vous ne dépensez : vous pouvez épargner <b class="pos">${fmt(pm.net)} par mois</b> en moyenne, soit environ <b>${fmt(f.year)} par an</b>.`
      : `⚠️ Vous dépensez <b>plus</b> que vous ne gagnez : <b class="neg">${fmt(-pm.net)} par mois</b> en moyenne. Votre épargne diminue.`}</div>
    <div class="row"><span class="t">Entrées moyennes / mois</span><span class="num pos">${fmt(pm.income)}</span></div>
    <div class="row"><span class="t">Sorties moyennes / mois<small>obligatoires ${fmt(pm.besoin)} · envies ${fmt(pm.envie)}</small></span><span class="num neg">${fmt(pm.out)}</span></div>
    <div class="row"><span class="t"><b>Capacité d’épargne / mois</b><small>taux d’épargne ${Math.round(f.rate * 100)} %${pm.placed > 0 ? ` · déjà placé ${fmt(pm.placed)}/mois` : ''}</small></span><span class="num ${ok ? 'pos' : 'neg'}">${ok ? '+' : ''}${fmt(pm.net)}</span></div>
    <div class="row"><span class="t" style="white-space:normal">Mois en cours<small>${Period.label(c.m) || monthName(c.m)} · entrées ${fmt(c.income)} · sorties ${fmt(c.out)}</small></span><span class="num ${c.net >= 0 ? 'pos' : 'neg'}">${c.net >= 0 ? '+' : ''}${fmt(c.net)}</span></div>
    ${f.list.length > 1 ? `<details><summary class="mut">Détail mois par mois</summary>${f.list.slice().reverse().map(x => `<div class="row"><span class="t">${monthName(x.m)}<small>entrées ${fmt(x.income)} · sorties ${fmt(x.besoin + x.envie)}</small></span><span class="num ${x.net >= 0 ? 'pos' : 'neg'}">${x.net >= 0 ? '+' : ''}${fmt(x.net)}</span></div>`).join('')}</details>` : ''}
    <svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;height:80px;margin-top:8px" preserveAspectRatio="none" aria-label="Solde cumulé entrées moins sorties">
      <line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--line)" stroke-dasharray="4 3"/>
      <path d="${path}" fill="none" stroke="${ok ? 'var(--pos)' : 'var(--neg)'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="mut" style="font-size:12px;display:flex;justify-content:space-between"><span>${f.from.split('-').reverse().join('/')}</span><span>cumul ${f.net >= 0 ? '+' : ''}${fmt(f.net)}</span><span>aujourd’hui</span></div>
    ${f.short ? '<p class="mut" style="font-size:12px;margin:6px 0 0">Historique court : le bilan sera plus fiable avec plusieurs mois de données.</p>' : ''}
    <button class="btn sec sm" data-goto="check" style="margin-top:8px">🔍 Vérifier mes calculs</button>
    <p class="mut" style="font-size:12px;margin:6px 0 0">La courbe montre le solde cumulé (entrées − sorties) depuis le début de la période. Les virements entre vos comptes sont exclus, et le compte joint ne compte que pour votre part.</p>
  </div>`;
}
// Changes de devises : ce que vous avez converti, à quel taux, et ce que ça vous a coûté
function exchangeCard() {
  const h = Exchange.history(365);
  if (!h.ops.length) return '';
  const f4 = x => x.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const pct = x => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
  const bank = h.sentMain * 0.015; // repère : conversion bancaire classique ≈ 1,5 %
  const provs = Object.entries(h.byProv).sort((a, b) => b[1].n - a[1].n);
  return `<div class="card"><h2>💱 Mes changes de devises (12 mois)</h2>
    <p class="mut" style="font-size:13px;margin:0 0 6px">Les montants convertis ne sont <b>ni des dépenses ni des revenus</b> : c’est votre argent qui change de devise. Seul l’écart avec le taux officiel (BCE) est compté, en « Frais de change ».</p>
    <div class="row"><span class="t">Converti<small>${h.ops.length} opération(s)</small></span><span class="num">${fmt(h.sentMain)}</span></div>
    <div class="row"><span class="t">Coût réel du change<small>écart moyen avec le taux BCE : ${pct(h.spread)}</small></span><span class="num ${h.cost > 0 ? 'neg' : 'pos'}">${h.cost > 0 ? '−' : '+'}${fmt(Math.abs(h.cost))}</span></div>
    ${bank > h.cost ? `<div class="row"><span class="t">Économisé vs conversion bancaire<small>repère : environ 1,5 % de marge en banque classique</small></span><span class="num pos">+${fmt(bank - h.cost)}</span></div>` : ''}
    ${provs.length > 1 ? provs.map(([n, b]) => `<div class="row"><span class="t">${esc(n)}<small>${b.n} change(s)</small></span><span class="num">${pct(b.sent ? b.cost / b.sent : 0)}</span></div>`).join('') : ''}
    <details><summary class="mut">Détail des changes</summary>${h.ops.slice(0, 12).map(o => `<div class="row"><span class="t" style="white-space:normal">${o.date.split('-').reverse().join('/')} · ${esc(o.provider)}<small>${fmtCur(o.sent, o.sentCur)} → ${o.recv.toLocaleString('fr-FR', { style: 'currency', currency: o.recvCur })} · taux ${f4(o.rate)} (BCE ${f4(o.ref)})</small></span><span class="num ${o.cost > 0 ? 'neg' : 'pos'}">${o.cost > 0 ? '−' : '+'}${fmt2(Math.abs(o.cost))}</span></div>`).join('')}</details>
  </div>`;
}
function barRow(label, spent, budget) {
  const p = budget ? spent / budget * 100 : 0;
  return `<div class="row"><span class="t">${esc(label)} <small>${fmt(spent)} / ${fmt(budget)} · reste ${fmt(budget - spent)}</small><div class="bar"><i class="${p > 100 ? 'over' : ''}" style="width:${Math.min(100, p).toFixed(1)}%"></i></div></span><span class="num ${p > 100 ? 'neg' : ''}">${Math.round(p)} %</span></div>`;
}

views.profile = () => {
  const p = Insights.profile(S, kindOf);
  if (p.score == null) return `<div class="card"><h2>${p.e} ${p.name}</h2><p>${p.d}</p></div>`;
  const a = p.a, inc = a.income, sv = Math.max(0, a.saving);
  const seg = (v, col, l) => v > 0 ? `<i title="${l}" style="width:${(v / Math.max(inc, a.out) * 100).toFixed(1)}%;background:${col}"></i>` : '';
  const pr = Insights.priorities(S, kindOf), rec = Insights.recurring(S, kindOf), tips = Insights.tips(S, kindOf);
  const merchants = Object.entries(a.merchants).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const gauge = (l, v, good) => `<div class="row"><span class="t">${l}<div class="bar"><i style="width:${Math.min(100, v * 100).toFixed(1)}%;background:${good ? 'var(--pos)' : 'var(--warn)'}"></i></div></span><span class="num">${Insights.pct(v)}</span></div>`;
  return `
  <div class="card" style="text-align:center"><div style="font-size:54px">${p.e}</div><h2 style="color:var(--fg);font-size:20px;margin:4px 0">${p.name}</h2>
    <p style="margin:6px 0">${p.d}</p>
    <div class="mut" style="font-size:13px">Analyse sur ${p.months.length} mois · revenus moyens ${fmt(inc)}/mois</div>
    <div style="font-size:38px;font-weight:800;margin-top:8px" class="${p.score >= 70 ? 'pos' : p.score >= 45 ? '' : 'neg'}">${p.score}<span class="mut" style="font-size:16px">/100</span></div>
    <div class="mut" style="font-size:12px">score de santé financière</div></div>
  ${p.traits.length ? `<div class="card"><h2>Vos traits</h2>${p.traits.map(([t, d]) => `<div class="row"><span class="t" style="white-space:normal"><b>${t}</b><small>${d}</small></span></div>`).join('')}</div>` : ''}
  <div class="card"><h2>Où part votre argent (moyenne mensuelle)</h2>
    <div class="bar" style="height:18px;display:flex">${seg(a.besoin, 'var(--acc)', 'Obligatoire')}${seg(a.envie, 'var(--warn)', 'Envies')}${seg(sv, 'var(--pos)', 'Épargne')}</div>
    ${gauge('Obligatoire (repère ≤ 50 %)', a.besoin / inc, a.besoin / inc <= 0.5)}
    ${gauge('Envies (repère ≤ 30 %)', a.envie / inc, a.envie / inc <= 0.3)}
    ${gauge('Épargne (repère ≥ 20 %)', sv / inc, sv / inc >= 0.2)}</div>
  <div class="card"><h2>Conseils pour vous</h2><ol style="padding-left:18px;margin:0">${tips.map(t => `<li style="margin-bottom:6px">${t}</li>`).join('')}</ol>
    <button class="btn sm" id="applybudgets" style="margin-top:8px">Appliquer les budgets recommandés</button></div>
  ${pr.length ? `<div class="card"><h2>Priorités : où réduire en premier</h2>${pr.map((x, i) => `<div class="row"><span class="t">${i + 1}. ${esc(x.cat)}<small>${fmt(x.avg)}/mois · ${Insights.pct(x.share)} des revenus${x.saving > 1 ? ` · objectif ${fmt(x.target)}` : ''}</small></span><span class="num ${x.saving > 1 ? 'neg' : 'pos'}">${x.saving > 1 ? '−' + fmt(x.saving) : 'OK'}</span></div>`).join('')}</div>` : ''}
  ${merchants.length ? `<div class="card"><h2>Hors obligatoire : vos plus gros postes</h2>${merchants.map(([m, v]) => `<div class="row"><span class="t">${esc(m)}</span><span class="num">${fmt(v)}/mois</span></div>`).join('')}</div>` : ''}
  ${rec.length ? `<div class="card"><h2>Dépenses récurrentes détectées</h2>${rec.map(r => `<div class="row"><span class="t">${esc(r.name)}<small>${esc(r.cat)} · ${r.kind === 'move' ? 'épargne' : Insights.natureOf(S, r.cat) === 'besoin' ? 'obligatoire' : 'envie'} · ${r.count} mois</small></span><span class="num">${fmt2(r.avg)}</span></div>`).join('')}
    <div class="row"><span class="t"><b>Total des dépenses fixes / mois</b></span><span class="num">${fmt(rec.filter(r => r.kind === 'out').reduce((x, r) => x + r.avg, 0))}</span></div></div>` : ''}`;
};

// ---------- Vérifier mes calculs : ce qui est compté, ce qui est exclu, ce qui est suspect ----------
const SUSPECT_OUT = /\bvir\b|virement|transfert|telexoo|revolut|wise|swissquote|\bchange\b|devise/i;
views.check = () => {
  const txs = S.tx.filter(t => ym(t.date) === month).sort((a, b) => a.date.localeCompare(b.date));
  const acc = id => S.accounts.find(a => a.id === id) || {};
  const accLabel = a => `${a.name || '?'}${FX.accCur(a) !== FX.main() ? ' · ' + FX.accCur(a) : ''}${(a.share ?? 1) < 1 ? ' · part ' + Math.round(a.share * 100) + ' %' : ''}`;
  const ins = txs.filter(t => kindOf(t.cat) === 'in'), outs = txs.filter(t => kindOf(t.cat) === 'out'), moves = txs.filter(t => kindOf(t.cat) === 'move');
  const big = Math.max(300, 300 * FX.now('EUR'));
  const suspects = [
    ...outs.filter(t => t.amount < 0 && -txAmt(t) >= big && SUSPECT_OUT.test(t.label) && !t.manual).map(t => [t, 'Ressemble à un virement ou à un change, mais compté en dépense']),
    ...ins.filter(t => t.cat !== 'Salaire' && txAmt(t) >= big && !t.manual).map(t => [t, 'Gros crédit compté comme revenu : est-ce un virement depuis un de vos comptes ?']),
    ...(ins.filter(t => t.cat === 'Salaire').length > 1 ? ins.filter(t => t.cat === 'Salaire' && !t.manual).map(t => [t, 'Plusieurs « salaires » ce mois-ci : l’un d’eux est peut-être un change ou un virement']) : [])
  ];
  const sum = (l, f = txAmt) => l.reduce((x, t) => x + f(t), 0);
  const fees = sum(moves, fxFee);
  const line = (t, extra = '') => `<div class="row" data-tx="${t.id}"><span class="t" style="white-space:normal">${esc(t.label)}<small>${t.date.split('-').reverse().join('/')} · ${esc(accLabel(acc(t.acc)))} · <span class="tag">${esc(t.cat)}</span>${t.orig != null && t.cur !== FX.main() ? ` · ${fmtCur(t.orig, t.cur)}` : ''}</small>${extra}</span><span class="num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${fmt2(kindOf(t.cat) === 'move' ? t.amount : txAmt(t))}</span></div>`;
  const fixBtns = t => `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
    <button class="btn sm" data-fix="${t.id}|Virement interne">Virement entre mes comptes</button>
    <button class="btn sm" data-fix="${t.id}|Change de devises">Change de devises</button>
    <button class="btn sec sm" data-fix="${t.id}|ok">C’est correct</button></div>`;
  return `
  <div class="card"><h2>Budget ${monthName(month)} ${Period.label(month)}</h2>
    <div class="row"><span class="t">Entrées comptées<small>${ins.length} opération(s)</small></span><span class="num pos">${fmt(sum(ins))}</span></div>
    <div class="row"><span class="t">Sorties comptées<small>${outs.length} opération(s)${fees ? ` + frais de change ${fmt2(fees)}` : ''}</small></span><span class="num neg">${fmt(-sum(outs) + fees)}</span></div>
    <div class="row"><span class="t">Exclues du calcul<small>${moves.length} virement(s), change(s), épargne</small></span><span class="num mut">${moves.length}</span></div>
    <p class="mut" style="font-size:12px;margin:6px 0 0">Les montants affichés sont ceux comptés pour vous (votre part sur le compte joint, convertis en ${FX.main()}). Touchez une opération pour la modifier.</p>
    <button class="btn sec sm" id="copydiag" style="margin-top:8px">Copier le détail (pour me l’envoyer)</button></div>
  ${suspects.length ? `<div class="card" style="border-color:var(--warn)"><h2>⚠️ À vérifier (${suspects.length})</h2>${suspects.map(([t, why]) => line(t, `<small style="color:var(--warn)">${why}</small>${fixBtns(t)}`)).join('')}</div>` : '<div class="card"><h2>✅ Rien de suspect repéré</h2></div>'}
  <div class="card"><h2>Entrées comptées</h2>${ins.map(t => line(t)).join('') || '<p class="mut">Aucune.</p>'}</div>
  <div class="card"><h2>Sorties comptées (plus grosses d’abord)</h2>${outs.slice().sort((a, b) => txAmt(a) - txAmt(b)).map(t => line(t)).join('') || '<p class="mut">Aucune.</p>'}</div>
  <div class="card"><h2>Exclues : virements, changes, épargne</h2>${moves.map(t => line(t, t.fx ? `<small>change ${esc(t.fx.provider)} · frais ${fmt2(t.fx.cost)}</small>` : '')).join('') || '<p class="mut">Aucune.</p>'}</div>`;
};
function diagText() {
  const acc = id => S.accounts.find(a => a.id === id) || {};
  const lines = S.tx.filter(t => ym(t.date) === month).sort((a, b) => a.date.localeCompare(b.date)).map(t => {
    const a = acc(t.acc);
    return [t.date, `${FX.accCur(a)}${(a.share ?? 1) < 1 ? ' joint ' + Math.round(a.share * 100) + '%' : ''}`, t.label.slice(0, 40), (t.orig ?? t.amount).toFixed(2), t.cat, kindOf(t.cat), t.paired ? 'apparié' : ''].join(' | ');
  });
  return `Budget ${month} (${Period.label(month)}), paie le ${Period.payday()}\n` + lines.join('\n');
}

let txFilter = '';
views.tx = () => {
  const q = Parsers.norm(txFilter);
  const list = S.tx.filter(t => ym(t.date) === month && (!q || Parsers.norm(t.label + ' ' + t.cat).includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  const acc = id => (S.accounts.find(a => a.id === id) || {}).name || '';
  return `<input id="q" placeholder="Rechercher (libellé, catégorie)…" value="${esc(txFilter)}">
  <div class="card">${list.length ? list.map(t => `<div class="row" data-tx="${t.id}"><span class="t">${esc(t.label)}<small>${t.date.split('-').reverse().join('/')} · ${esc(acc(t.acc))} · <span class="tag">${esc(t.cat)}</span></small></span><span class="num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${fmt2(t.amount)}${t.orig != null && t.cur !== FX.main() ? `<small>${t.orig.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${t.cur}</small>` : ''}${shareOf(t.acc) < 1 ? `<small>ma part ${Math.round(shareOf(t.acc) * 100)} %</small>` : ''}</span></div>`).join('') : '<p class="mut">Aucune opération pour ce mois.</p>'}</div>
  <button class="btn sec" id="addtx">+ Ajouter une opération manuelle</button>`;
};

views.wealth = () => {
  const w = wealth();
  const snaps = Object.entries(S.snapshots).sort().slice(-12);
  const max = Math.max(1, ...snaps.map(([, v]) => v));
  const label = { courant: 'Compte courant', epargne: 'Épargne', invest: 'Placements', autre: 'Autre' };
  return `<div class="kpi big"><div class="l">Patrimoine total</div><div class="v">${fmt(w.total)}</div></div>
  <div class="card"><h2>Comptes</h2>${S.accounts.length ? S.accounts.map(a => `<div class="row" data-acc="${a.id}"><span class="t">${esc(a.name)}<small>${esc(a.inst || '')} · ${label[a.type]}${(a.positions || []).length ? ` · ${a.positions.length} positions` : ''}${FX.accCur(a) !== FX.main() ? ` · ${(a.balance || 0).toLocaleString('fr-FR', { style: 'currency', currency: FX.accCur(a) })}` : ''}${(a.share ?? 1) < 1 ? ` · ma part ${Math.round(a.share * 100)} %` : ''}${a.balanceDate ? ' · au ' + a.balanceDate.split('-').reverse().join('/') : ''}</small></span><span class="num">${fmt2(accountValue(a))}</span></div>`).join('') : '<p class="mut">Aucun compte. Ajoutez vos comptes CIC et Trade Republic.</p>'}
    <button class="btn sec sm" id="addacc">+ Compte</button></div>
  <div class="card"><h2>Autres actifs (immobilier, crypto, véhicule…)</h2>${S.assets.map(x => `<div class="row" data-asset="${x.id}"><span class="t">${esc(x.name)}</span><span class="num">${fmt(x.value)}</span></div>`).join('') || '<p class="mut">Aucun.</p>'}
    <button class="btn sec sm" id="addasset">+ Actif</button></div>
  ${snaps.length > 1 ? `<div class="card"><h2>Évolution du patrimoine</h2><div class="chart">${snaps.map(([m, v]) => `<div class="c"><div class="pair"><i style="width:70%;background:var(--acc);height:${v / max * 100}%"></i></div>${m.slice(5)}</div>`).join('')}</div></div>` : ''}`;
};

views.import = () => `${Bank.card()}
  <div class="card"><h2>Importer un relevé (CSV / OFX)</h2>
    <label>Compte de destination</label>
    <select id="impacc">${S.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}<option value="__new">+ Nouveau compte…</option></select>
    <label>Fichier (CSV, OFX)</label><input type="file" id="file" accept=".csv,.ofx,.qfx,.txt,text/csv" multiple>
    <p class="mut" style="font-size:13px">Les fichiers sont lus sur le téléphone. Rien n’est envoyé sur Internet. Les doublons sont ignorés automatiquement.</p>
  </div>
  <div class="card"><h2>CIC</h2><ol style="padding-left:18px;margin:0">
    <li>Sur cic.fr (navigateur, version ordinateur) : <b>Comptes › Télécharger vos opérations</b>.</li>
    <li>Format <b>CSV</b> ou <b>OFX</b>, choisissez la période, téléchargez.</li>
    <li>Importez le fichier ici dans le compte « CIC ». Le solde est mis à jour s’il est présent.</li></ol></div>
  <div class="card"><h2>Trade Republic</h2><ol style="padding-left:18px;margin:0">
    <li>Trade Republic n’a pas d’API officielle. Utilisez l’outil open source <b>pytr</b> (voir <code>tools/README.md</code>) sur votre PC ou sur Android via Termux.</li>
    <li><code>pytr export_transactions</code> → fichier CSV des opérations.</li>
    <li><code>pytr portfolio -o portfolio.csv</code> → positions : importez-le dans le compte Trade Republic pour valoriser vos titres.</li>
    <li>Sans pytr : saisissez la valeur du portefeuille à la main dans Patrimoine.</li></ol></div>`;

views.settings = () => `
  <div class="card"><h2>Devise et situation</h2>
    <div class="row"><span class="t">Devise principale (budget de vie)</span><select id="maincur" style="width:110px">${['EUR', 'CHF'].map(c => `<option ${FX.main() === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="row"><span class="t">Je travaille en Suisse (frontalier)</span><select id="front" style="width:110px"><option value="">Non</option><option value="CH" ${S.settings.frontalier ? 'selected' : ''}>Oui</option></select></div>
    ${S.settings.frontalier ? `<div class="row"><span class="t">Canton de travail</span><select id="canton" style="width:150px">${[['', 'Je ne sais pas'], ['GE', 'Genève'], ['accord', 'Autre (VD, VS, NE, JU, BE, BS, BL, SO)'], ['autre', 'Autre canton']].map(([v, l]) => `<option value="${v}" ${(S.settings.canton || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    <p class="mut" style="font-size:12px">Les opérations en devise étrangère sont converties au taux BCE du jour de l’opération.</p></div>
  <div class="card"><h2>Jour de paie</h2><div class="row"><span class="t">Le mois budgétaire va d’une paie à la suivante<small>Détecté : le ${Period.detect()} · laissez vide pour la détection automatique · 1 = mois calendaire</small></span><input id="payday" type="number" min="1" max="31" inputmode="numeric" style="width:80px" value="${S.settings.payday || ''}" placeholder="${Period.detect()}"></div></div>
  <div class="card"><h2>Objectif d’épargne</h2><div class="row"><span class="t">Part des revenus à mettre de côté</span><input id="savtarget" type="number" inputmode="numeric" style="width:90px" value="${S.settings.savingsTarget ?? 20}"> %</div></div>
  <div class="card"><h2>Obligatoire ou envie ?</h2><p class="mut" style="font-size:13px">Sert au profil, au reste à dépenser du jour et aux priorités.</p>
    ${Object.keys(CATS).filter(c => CATS[c] === 'out').map(c => `<div class="row"><span class="t">${c}</span><select data-nature="${c}" style="width:140px"><option value="besoin" ${Insights.natureOf(S, c) === 'besoin' ? 'selected' : ''}>Obligatoire</option><option value="envie" ${Insights.natureOf(S, c) === 'envie' ? 'selected' : ''}>Envie</option></select></div>`).join('')}</div>
  <div class="card"><h2>Budgets mensuels par catégorie</h2>
    ${Object.keys(CATS).filter(c => CATS[c] === 'out').map(c => `<div class="row"><span class="t">${c}</span><input data-budget="${c}" type="number" inputmode="decimal" style="width:110px" value="${S.budgets[c] || ''}" placeholder="—"></div>`).join('')}</div>
  <div class="card"><h2>Règles de catégorisation</h2><p class="mut" style="font-size:13px">Mots-clés séparés par « | ». La première règle qui correspond gagne.</p>
    ${S.rules.length ? '' : '<p class="mut" style="font-size:13px">Aucune règle personnelle pour l’instant (elles se créent aussi via « Toujours classer ainsi » sur une opération).</p>'}
    ${S.rules.map((r, i) => `<div class="grid2" style="margin-bottom:6px"><input data-rkw="${i}" value="${esc(r.kw)}"><div style="display:flex;gap:4px">${catSelect(r.cat, `data-rcat="${i}"`)}<button class="btn sec sm" data-rdel="${i}">✕</button></div></div>`).join('')}
    <details style="margin:8px 0"><summary class="mut">${DEFAULT_RULES.length} règles par défaut (appliquées après les vôtres)</summary>${DEFAULT_RULES.map(r => `<div class="row"><span class="t" style="white-space:normal;font-size:13px">${esc(r.kw.replace(/\|/g, ', '))}</span><span class="tag">${esc(r.cat)}</span></div>`).join('')}</details>
    <button class="btn sec sm" id="addrule">+ Règle</button> <button class="btn sm" id="recat">Recatégoriser tout</button></div>
  <div class="card"><h2>Sécurité</h2><label>Code de verrouillage (laisser vide pour désactiver)</label>
    <div style="display:flex;gap:6px"><input id="newpin" type="password" inputmode="numeric" placeholder="${S.settings.pin ? 'Code actif' : 'Aucun code'}"><button class="btn sm" id="setpin">OK</button></div></div>
  <div class="card"><h2>Sauvegarde</h2><p class="mut" style="font-size:13px">Vos données ne sont que sur ce téléphone. Exportez régulièrement une sauvegarde.</p>
    <button class="btn sm" id="export">Exporter (JSON)</button>
    <label class="btn sec sm" style="display:inline-block;width:auto;color:var(--fg)">Restaurer<input type="file" id="restore" accept=".json" class="hide"></label>
    <button class="btn sec sm" id="wipe" style="color:var(--neg)">Tout effacer</button></div>
  <p class="mut" style="font-size:12px;text-align:center">${S.tx.length} opérations · ${S.accounts.length} comptes · stockage local uniquement</p>`;
const catSelect = (v, attr = '') => `<select ${attr}>${Object.keys(CATS).map(c => `<option ${c === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`;

// ---------- rendu ----------
const TITLES = { check: 'Vérifier mes calculs', profile: 'Mon profil', dash: 'Budget', tx: 'Opérations', wealth: 'Patrimoine', import: 'Import', settings: 'Réglages' };
function render() {
  $('#title').textContent = TITLES[view];
  const ms = months(); if (!ms.includes(month)) month = ms[0];
  $('#month').innerHTML = ms.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>Budget ${monthName(m)}</option>`).join('');
  $('#month').classList.toggle('hide', !['dash', 'tx', 'check'].includes(view));
  $('#view').innerHTML = views[view]();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
}
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) { view = b.dataset.v; render(); scrollTo(0, 0); } };
$('#month').onchange = e => { month = e.target.value; render(); };

// ---------- dialogues ----------
function dialog(html, onSave) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog">${html}<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn sec" value="cancel">Annuler</button><button class="btn" value="ok">Enregistrer</button></div></form>`;
  d.onclose = () => { if (d.returnValue === 'ok') { onSave(Object.fromEntries(new FormData(d.querySelector('form')))); save(); render(); } };
  d.showModal();
}
function editAccount(a) {
  const isNew = !a; a = a || { id: uid(), name: '', inst: '', type: 'courant', balance: 0, positions: [] };
  dialog(`<h3>${isNew ? 'Nouveau compte' : 'Modifier le compte'}</h3>
    <label>Nom</label><input name="name" required value="${esc(a.name)}" placeholder="CIC Compte courant">
    <div class="grid2"><div><label>Établissement</label><input name="inst" value="${esc(a.inst)}" placeholder="CIC"></div>
    <div><label>Type</label><select name="type">${[['courant', 'Courant'], ['epargne', 'Épargne'], ['invest', 'Placements'], ['autre', 'Autre']].map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="grid2"><div><label>Solde espèces actuel</label><input name="balance" type="number" step="0.01" inputmode="decimal" value="${a.balance || 0}"></div>
    <div><label>Devise</label><select name="currency">${['EUR', 'CHF', 'USD', 'GBP'].map(c => `<option ${(a.currency || 'EUR') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <label>Ma part de ce compte (%) — 50 pour un compte joint à deux</label><input name="share" type="number" min="0" max="100" inputmode="numeric" value="${Math.round((a.share ?? 1) * 100)}">
    ${(a.positions || []).length ? `<label>Positions (${fmt2(a.positions.reduce((s, p) => s + p.value, 0))})</label><div style="max-height:150px;overflow:auto">${a.positions.map(p => `<div class="row"><span class="t">${esc(p.name)}</span><span class="num">${fmt2(p.value)}</span></div>`).join('')}</div>` : ''}
    ${isNew ? '' : '<label><input type="checkbox" name="del" style="width:auto"> Supprimer ce compte et ses opérations</label>'}`,
  f => {
    if (f.del) { S.accounts = S.accounts.filter(x => x.id !== a.id); S.tx = S.tx.filter(t => t.acc !== a.id); return; }
    const nb = parseFloat(f.balance) || 0;
    if (nb !== a.balance) a.balanceDate = new Date().toISOString().slice(0, 10);
    Object.assign(a, { name: f.name, inst: f.inst, type: f.type, balance: nb, currency: f.currency, share: Math.max(0, Math.min(100, parseFloat(f.share) || 0)) / 100 });
    FX.refresh(true).then(() => { FX.reconvert(); save(); render(); });
    if (isNew) S.accounts.push(a);
    snapshot();
  });
}
function editAsset(x) {
  const isNew = !x; x = x || { id: uid(), name: '', value: 0 };
  dialog(`<h3>Actif</h3><label>Nom</label><input name="name" required value="${esc(x.name)}"><label>Valeur (€)</label><input name="value" type="number" step="1" inputmode="decimal" value="${x.value}">
    ${isNew ? '' : '<label><input type="checkbox" name="del" style="width:auto"> Supprimer</label>'}`,
  f => { if (f.del) { S.assets = S.assets.filter(y => y.id !== x.id); return; } x.name = f.name; x.value = parseFloat(f.value) || 0; if (isNew) S.assets.push(x); snapshot(); });
}
function editTx(t) {
  const isNew = !t; t = t || { id: uid(), date: new Date().toISOString().slice(0, 10), amount: 0, label: '', cat: 'Divers', acc: (S.accounts[0] || {}).id };
  dialog(`<h3>${isNew ? 'Nouvelle opération' : 'Opération'}</h3>
    <label>Libellé</label><input name="label" required value="${esc(t.label)}">
    <div class="grid2"><div><label>Date</label><input name="date" type="date" value="${t.date}"></div><div><label>Montant (− = dépense)</label><input name="amount" type="number" step="0.01" inputmode="decimal" value="${t.amount}"></div></div>
    <label>Catégorie</label>${catSelect(t.cat, 'name="cat"')}
    ${isNew ? '' : `<label><input type="checkbox" name="rule" style="width:auto"> Toujours classer « ${esc(t.label.slice(0, 30))} » ainsi</label>
    <label><input type="checkbox" name="del" style="width:auto"> Supprimer</label>`}`,
  f => {
    if (f.del) { S.tx = S.tx.filter(x => x.id !== t.id); return; }
    if (f.cat !== t.cat) t.manual = true;
    Object.assign(t, { label: f.label, date: f.date, amount: parseFloat(f.amount) || 0, cat: f.cat });
    if (f.rule) {
      const kw = Parsers.norm(t.label).replace(/\d{2}\/\d{2}(\/\d{2,4})?|\b\d{4,}\b|cb\*?\d*|carte\s*x?\d*/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (kw) { S.rules.unshift({ kw, cat: f.cat }); S.tx.forEach(x => { if (Parsers.norm(x.label).includes(kw)) x.cat = f.cat; }); }
    }
    if (isNew) { t.hash = uid(); S.tx.push(t); }
  });
}

// ---------- événements ----------
$('#view').addEventListener('click', e => {
  const el = e.target.closest('[data-tx],[data-acc],[data-asset],[data-goto],button');
  if (!el || el.dataset.bank) return;
  if (el.dataset.fix) {
    const [id, cat] = el.dataset.fix.split('|'), t = S.tx.find(x => x.id === id);
    if (t) { if (cat !== 'ok') t.cat = cat; t.manual = true; save(); render(); toast('Corrigé'); }
    return;
  }
  if (el.id === 'copydiag') { navigator.clipboard.writeText(diagText()).then(() => toast('Détail copié'), () => toast('Copie impossible')); return; }
  if (el.dataset.bilan) { S.settings.bilanMonths = +el.dataset.bilan; save(); return render(); }
  if (el.dataset.goto) { view = el.dataset.goto; render(); return scrollTo(0, 0); }
  if (el.dataset.tx) return editTx(S.tx.find(t => t.id === el.dataset.tx));
  if (el.dataset.acc) return editAccount(S.accounts.find(a => a.id === el.dataset.acc));
  if (el.dataset.asset) return editAsset(S.assets.find(a => a.id === el.dataset.asset));
  if (el.dataset.rdel) { S.rules.splice(+el.dataset.rdel, 1); save(); return render(); }
  ({
    addtx: () => editTx(), addacc: () => editAccount(), addasset: () => editAsset(),
    addrule: () => { S.rules.push({ kw: '', cat: 'Divers' }); save(); render(); },
    recat: () => { S.tx.forEach(t => { if (!t.manual) t.cat = categorize(t); }); save(); toast('Opérations recatégorisées'); },
    export: exportData,
    wipe: () => { if (confirm('Effacer toutes les données de ce téléphone ?')) { localStorage.removeItem(KEY); location.reload(); } },
    setpin: setPin,
    applybudgets: () => { S.budgets = Object.assign({}, S.budgets, Insights.suggestedBudgets(S, kindOf)); save(); toast('Budgets appliqués (modifiables dans Réglages)'); view = 'dash'; render(); }
  }[el.id] || (() => {}))();
});
$('#view').addEventListener('change', async e => {
  const el = e.target;
  if (el.id === 'maincur') { S.settings.currency = el.value; save(); toast('Conversion en cours…'); await FX.refresh(true); FX.reconvert(); save(); snapshot(); render(); }
  if (el.id === 'front') { S.settings.frontalier = !!el.value; save(); render(); }
  if (el.id === 'canton') { S.settings.canton = el.value; save(); }
  if (el.id === 'payday') { const v = parseInt(el.value); S.settings.payday = v >= 1 && v <= 31 ? v : null; month = Period.current(); save(); render(); }
  if (el.id === 'savtarget') { S.settings.savingsTarget = Math.max(0, Math.min(90, parseFloat(el.value) || 0)); save(); }
  if (el.dataset.nature) { (S.settings.nature = S.settings.nature || {})[el.dataset.nature] = el.value; save(); }
  if (el.dataset.budget) { S.budgets[el.dataset.budget] = parseFloat(el.value) || 0; save(); }
  if (el.dataset.rkw) { S.rules[+el.dataset.rkw].kw = el.value; save(); }
  if (el.dataset.rcat) { S.rules[+el.dataset.rcat].cat = el.value; save(); }
  if (el.id === 'impacc' && el.value === '__new') editAccount();
  if (el.id === 'file') importFiles(el.files);
  if (el.id === 'restore') restore(el.files[0]);
});
$('#view').addEventListener('input', e => { if (e.target.id === 'q') { txFilter = e.target.value; const p = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(p, p); } });

async function importFiles(files) {
  const accId = $('#impacc').value;
  const acc = S.accounts.find(a => a.id === accId);
  if (!acc) return toast('Créez d’abord un compte');
  let added = 0, dup = 0;
  for (const f of files) {
    try {
      const text = await readText(f);
      const r = Parsers.parse(f.name, text);
      if (r.kind === 'positions') { acc.positions = r.positions; acc.type = 'invest'; toast(`${r.positions.length} positions importées`); continue; }
      const x = ingest(acc, r); added += x.added; dup += x.dup;
    } catch (err) { toast(`${f.name} : ${err.message}`); }
  }
  if (await FX.refresh()) linkTransfers();
  save(); snapshot();
  if (added) { const last = S.tx.filter(t => t.acc === acc.id).map(t => t.date).sort().pop(); if (last) month = ym(last); }
  toast(`${added} opérations ajoutées${dup ? `, ${dup} doublons ignorés` : ''}`);
  if (added) { view = 'dash'; render(); }
}
// Ajoute des opérations à un compte en ignorant les doublons (fichiers et API bancaire)
function ingest(acc, r) {
  let added = 0, dup = 0;
  const seen = new Set(S.tx.map(t => t.hash)), counts = {};
  for (const t of r.tx) {
    const base = t.fitid ? 'f' + t.fitid : `${t.date}|${t.amount}|${hash(t.label)}`;
    counts[base] = (counts[base] || 0) + 1;
    const h = acc.id + '|' + base + '|' + counts[base];
    if (seen.has(h)) { dup++; continue; }
    seen.add(h);
    const cur = FX.accCur(acc);
    const tx = { id: uid(), acc: acc.id, date: t.date, orig: t.amount, cur, amount: Math.round(t.amount * FX.rateAt(cur, t.date) * 100) / 100, label: t.label, hash: h };
    tx.cat = categorize(tx);
    // Sur un compte joint, un crédit non identifié est en général l'apport du conjoint : pas un revenu
    tx.cat = autoCat(tx);
    S.tx.push(tx); added++;
  }
  if (added) { linkTransfers(); detectSalary(); }
  if (r.balance && !isNaN(r.balance.value) && (!acc.balanceDate || r.balance.date >= acc.balanceDate)) { acc.balance = r.balance.value; acc.balanceDate = r.balance.date; }
  return { added, dup };
}
async function readText(f) {
  const buf = await f.arrayBuffer();
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf; // CIC exporte souvent en Windows-1252
}
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `mon-budget-${new Date().toISOString().slice(0, 10)}.json`; a.click();
}
async function restore(f) {
  if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.tx)) throw 0; if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return; localStorage.setItem(KEY, JSON.stringify(d)); location.reload(); }
  catch (e) { toast('Sauvegarde invalide'); }
}

// ---------- verrou par code ----------
async function sha(s) {
  if (crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('monbudget:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  return hash('monbudget:' + s);
}
async function setPin() {
  const v = $('#newpin').value.trim();
  S.settings.pin = v ? await sha(v) : null; save(); toast(v ? 'Code activé' : 'Code désactivé'); render();
}
async function checkLock() {
  if (!S.settings.pin) return;
  $('#lock').classList.remove('hide');
  const go = async () => { if (await sha($('#pin').value) === S.settings.pin) $('#lock').classList.add('hide'); else { $('#lockmsg').textContent = 'Code incorrect'; $('#pin').value = ''; } };
  $('#unlock').onclick = go; $('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#pin').focus();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
migrateRules(); linkTransfers(); detectSalary(); save(); month = Period.current();
checkLock(); snapshot(); render();
FX.reconvert(); FX.refresh().then(ch => { if (ch) { linkTransfers(); save(); snapshot(); render(); } });
Bank.handleRedirect().then(() => Bank.sync()).catch(() => {});

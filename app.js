// Mon Budget — application 100 % locale. Les données restent dans le stockage du navigateur.
'use strict';
const KEY = 'monbudget.v1';
const CATS = {
  'Salaire': 'in', 'Autres revenus': 'in',
  'Logement': 'out', 'Courses': 'out', 'Restaurants': 'out', 'Transport': 'out', 'Abonnements': 'out',
  'Santé': 'out', 'Loisirs': 'out', 'Shopping': 'out', 'Impôts': 'out', 'Frais bancaires': 'out', 'Assurances': 'out', 'Téléphone & Internet': 'out',
  'Voyages': 'out', 'Cadeaux & dons': 'out', 'Divers': 'out',
  'Épargne': 'move', 'Investissement': 'move', 'Virement interne': 'move'
};
const DEFAULT_RULES = [
  ['airbnb|booking.com|air france|easyjet|ryanair|transavia|vueling|hotel|abritel|expedia', 'Voyages'],
  ['uber eats|deliveroo|just eat|restaurant|mcdo|mc donald|burger king|kfc|brasserie|boulangerie|starbucks', 'Restaurants'],
  ['carrefour|leclerc|auchan|lidl|intermarche|monoprix|franprix|casino|super u|aldi|picard|grand frais', 'Courses'],
  ['sncf|ratp|navigo|uber|bolt|blablacar|total|esso|shell|bp |peage|autoroute|parking|essence', 'Transport'],
  ['free mobile|freebox|orange|sfr|bouygues|sosh|red by|b&you|livebox', 'Téléphone & Internet'],
  ['netflix|spotify|deezer|disney|canal|amazon prime|icloud|google storage|apple.com|youtube|chatgpt|openai|audible', 'Abonnements'],
  ['pharmacie|docteur|medecin|cpam|mutuelle|dentiste|ameli|doctolib|hopital', 'Santé'],
  ['loyer|edf|engie|veolia|eau |assurance hab|syndic|taxe fonciere', 'Logement'],
  ['dgfip|impot|finances publiques', 'Impôts'],
  ['frais|cotisation|commission|agios', 'Frais bancaires'],
  ['fnac|amazon|zara|h&m|decathlon|ikea|leroy merlin|cdiscount|vinted', 'Shopping'],
  ['cinema|ugc|pathe|steam|playstation|fitness|basic fit|concert|ticketmaster', 'Loisirs'],
  ['salaire|paie|payfit|remuneration', 'Salaire'],
  ['interest|zinsen|interets|dividend|dividende|caf |remboursement', 'Autres revenus'],
  ['buy|kauf|achat titre|sell|verkauf|vente titre|savings plan|sparplan|plan d.investissement', 'Investissement'],
  ['trade republic|livret|ldd|lep |pel |assurance vie', 'Épargne'],
  ['assurance|axa|maif|macif|matmut|allianz|generali|groupama|alan ', 'Assurances'],
  ['don |dons |croix rouge|unicef|leetchi|lydia cagnotte|cadeau', 'Cadeaux & dons'],
  ['deposit|einzahlung|removal|auszahlung|vir interne|virement interne|vir de m|vir sepa m', 'Virement interne']
].map(([kw, cat]) => ({ kw, cat }));

const S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return Object.assign(blank(), s); } catch (e) {}
  return blank();
}
function blank() { return { accounts: [], tx: [], rules: DEFAULT_RULES, budgets: {}, assets: [], snapshots: {}, settings: {} }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Stockage plein ou indisponible'); } }

// ---------- utilitaires ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: d, minimumFractionDigits: d });
const fmt2 = n => fmt(n, 2);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const ym = d => d.slice(0, 7);
const monthName = m => new Date(m + '-01T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const kindOf = c => CATS[c] || 'out';
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2500); }
function hash(t) { const s = Parsers.norm(t); let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h.toString(36); }

function categorize(tx) {
  const l = ' ' + Parsers.norm(tx.label) + ' ';
  for (const r of S.rules) if (r.kw.split('|').some(k => k && l.includes(Parsers.norm(k)))) return r.cat;
  return tx.amount > 0 ? 'Autres revenus' : 'Divers';
}

// ---------- calculs ----------
function monthStats(m) {
  const res = { in: 0, out: 0, move: 0, byCat: {} };
  const invest = new Set(S.accounts.filter(a => a.type === 'invest' || a.type === 'epargne').map(a => a.id));
  for (const t of S.tx) {
    if (ym(t.date) !== m) continue;
    const k = kindOf(t.cat);
    if (k === 'in') res.in += t.amount;
    else if (k === 'out') { res.out -= t.amount; res.byCat[t.cat] = (res.byCat[t.cat] || 0) - t.amount; }
    else if (t.cat !== 'Virement interne' && !invest.has(t.acc)) res.move -= t.amount; // argent sorti vers épargne/placements
  }
  res.net = res.in - res.out;
  res.rate = res.in > 0 ? res.net / res.in : 0;
  return res;
}
function accountValue(a) { return (a.balance || 0) + (a.positions || []).reduce((s, p) => s + (p.value || 0), 0); }
function wealth() {
  const by = { courant: 0, epargne: 0, invest: 0, autre: 0 };
  for (const a of S.accounts) by[a.type || 'autre'] += accountValue(a);
  for (const x of S.assets) by.autre += x.value || 0;
  return { by, total: Object.values(by).reduce((a, b) => a + b, 0) };
}
function months() {
  const set = new Set(S.tx.map(t => ym(t.date)));
  set.add(new Date().toISOString().slice(0, 7));
  return [...set].sort().reverse();
}
function snapshot() {
  if (!S.accounts.length && !S.assets.length) return;
  S.snapshots[new Date().toISOString().slice(0, 7)] = Math.round(wealth().total);
  save();
}

// ---------- vues ----------
let view = 'dash', month = new Date().toISOString().slice(0, 7);
const views = {};

views.dash = () => {
  const s = monthStats(month), w = wealth();
  const ms = months().slice(0, 6).reverse();
  const stats = ms.map(m => [m, monthStats(m)]);
  const max = Math.max(1, ...stats.map(([, x]) => Math.max(x.in, x.out)));
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const budgetRows = Object.entries(S.budgets).filter(([, v]) => v > 0);
  const totalBudget = budgetRows.reduce((a, [, v]) => a + v, 0);
  const isCur = month === new Date().toISOString().slice(0, 7), d = Insights.daily(S, kindOf);
  const nat = Object.entries(s.byCat).reduce((o, [c, v]) => (o[Insights.natureOf(S, c)] += v, o), { besoin: 0, envie: 0 });
  const p = Insights.profile(S, kindOf);
  return `
  ${isCur && d.income > 0 ? `<div class="card" style="border-color:var(--acc)">
    <h2>Aujourd’hui, vous pouvez dépenser</h2>
    <div style="font-size:34px;font-weight:800"><span class="${d.remaining > 0 && d.leftToday > 0 ? 'pos' : 'neg'}">${fmt(Math.max(0, d.leftToday))}</span></div>
    <div class="mut" style="font-size:13px">${d.remaining > 0 ? `${fmt(d.remaining)} d’envies restantes sur ${d.daysLeft} jour(s) · obligations prévues ${fmt(d.besoins)} · épargne visée ${Math.round(d.target * 100)} %` : `Enveloppe « envies » du mois dépassée de ${fmt(-d.remaining)}. Limitez-vous aux dépenses obligatoires.`}</div>
    <div class="bar"><i class="${d.remaining < 0 ? 'over' : ''}" style="width:${Math.min(100, d.envelope > 0 ? d.spent / d.envelope * 100 : 100).toFixed(1)}%"></i></div>
  </div>` : ''}
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
    ${barRow('Total', s.out, totalBudget)}
    ${budgetRows.map(([c, v]) => barRow(c, s.byCat[c] || 0, v)).join('')}</div>` : ''}
  <div class="card"><h2>Dépenses par catégorie</h2>
    ${cats.length ? cats.map(([c, v]) => `<div class="row"><span class="t">${esc(c)} <span class="tag">${Insights.natureOf(S, c) === 'besoin' ? 'obligatoire' : 'envie'}</span><div class="bar"><i style="width:${(v / s.out * 100).toFixed(1)}%"></i></div></span><span class="num">${fmt(v)}</span></div>`).join('') : '<p class="mut">Aucune dépense ce mois-ci. Importez vos relevés dans l’onglet Import.</p>'}
  </div>
  <div class="card"><h2>6 derniers mois <span class="tag" style="background:var(--pos);color:#fff">revenus</span> <span class="tag" style="background:var(--neg);color:#fff">dépenses</span></h2>
    <div class="chart">${stats.map(([m, x]) => `<div class="c"><div class="pair"><i class="in" style="height:${x.in / max * 100}%"></i><i class="out" style="height:${x.out / max * 100}%"></i></div>${new Date(m + '-01T12:00').toLocaleDateString('fr-FR', { month: 'short' })}</div>`).join('')}</div>
    ${stats.map(([m, x]) => `<div class="row"><span class="t">${monthName(m)}</span><span class="num ${x.net >= 0 ? 'pos' : 'neg'}">${x.net >= 0 ? '+' : ''}${fmt(x.net)}</span></div>`).reverse().join('')}
  </div>`;
};
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

let txFilter = '';
views.tx = () => {
  const q = Parsers.norm(txFilter);
  const list = S.tx.filter(t => ym(t.date) === month && (!q || Parsers.norm(t.label + ' ' + t.cat).includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  const acc = id => (S.accounts.find(a => a.id === id) || {}).name || '';
  return `<input id="q" placeholder="Rechercher (libellé, catégorie)…" value="${esc(txFilter)}">
  <div class="card">${list.length ? list.map(t => `<div class="row" data-tx="${t.id}"><span class="t">${esc(t.label)}<small>${t.date.split('-').reverse().join('/')} · ${esc(acc(t.acc))} · <span class="tag">${esc(t.cat)}</span></small></span><span class="num ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${fmt2(t.amount)}</span></div>`).join('') : '<p class="mut">Aucune opération pour ce mois.</p>'}</div>
  <button class="btn sec" id="addtx">+ Ajouter une opération manuelle</button>`;
};

views.wealth = () => {
  const w = wealth();
  const snaps = Object.entries(S.snapshots).sort().slice(-12);
  const max = Math.max(1, ...snaps.map(([, v]) => v));
  const label = { courant: 'Compte courant', epargne: 'Épargne', invest: 'Placements', autre: 'Autre' };
  return `<div class="kpi big"><div class="l">Patrimoine total</div><div class="v">${fmt(w.total)}</div></div>
  <div class="card"><h2>Comptes</h2>${S.accounts.length ? S.accounts.map(a => `<div class="row" data-acc="${a.id}"><span class="t">${esc(a.name)}<small>${esc(a.inst || '')} · ${label[a.type]}${(a.positions || []).length ? ` · ${a.positions.length} positions` : ''}${a.balanceDate ? ' · au ' + a.balanceDate.split('-').reverse().join('/') : ''}</small></span><span class="num">${fmt2(accountValue(a))}</span></div>`).join('') : '<p class="mut">Aucun compte. Ajoutez vos comptes CIC et Trade Republic.</p>'}
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
  <div class="card"><h2>Objectif d’épargne</h2><div class="row"><span class="t">Part des revenus à mettre de côté</span><input id="savtarget" type="number" inputmode="numeric" style="width:90px" value="${S.settings.savingsTarget ?? 20}"> %</div></div>
  <div class="card"><h2>Obligatoire ou envie ?</h2><p class="mut" style="font-size:13px">Sert au profil, au reste à dépenser du jour et aux priorités.</p>
    ${Object.keys(CATS).filter(c => CATS[c] === 'out').map(c => `<div class="row"><span class="t">${c}</span><select data-nature="${c}" style="width:140px"><option value="besoin" ${Insights.natureOf(S, c) === 'besoin' ? 'selected' : ''}>Obligatoire</option><option value="envie" ${Insights.natureOf(S, c) === 'envie' ? 'selected' : ''}>Envie</option></select></div>`).join('')}</div>
  <div class="card"><h2>Budgets mensuels par catégorie</h2>
    ${Object.keys(CATS).filter(c => CATS[c] === 'out').map(c => `<div class="row"><span class="t">${c}</span><input data-budget="${c}" type="number" inputmode="decimal" style="width:110px" value="${S.budgets[c] || ''}" placeholder="—"></div>`).join('')}</div>
  <div class="card"><h2>Règles de catégorisation</h2><p class="mut" style="font-size:13px">Mots-clés séparés par « | ». La première règle qui correspond gagne.</p>
    ${S.rules.map((r, i) => `<div class="grid2" style="margin-bottom:6px"><input data-rkw="${i}" value="${esc(r.kw)}"><div style="display:flex;gap:4px">${catSelect(r.cat, `data-rcat="${i}"`)}<button class="btn sec sm" data-rdel="${i}">✕</button></div></div>`).join('')}
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
const TITLES = { profile: 'Mon profil', dash: 'Budget', tx: 'Opérations', wealth: 'Patrimoine', import: 'Import', settings: 'Réglages' };
function render() {
  $('#title').textContent = TITLES[view];
  const ms = months(); if (!ms.includes(month)) month = ms[0];
  $('#month').innerHTML = ms.map(m => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`).join('');
  $('#month').classList.toggle('hide', !['dash', 'tx'].includes(view));
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
    <label>Solde espèces actuel (€)</label><input name="balance" type="number" step="0.01" inputmode="decimal" value="${a.balance || 0}">
    ${(a.positions || []).length ? `<label>Positions (${fmt2(a.positions.reduce((s, p) => s + p.value, 0))})</label><div style="max-height:150px;overflow:auto">${a.positions.map(p => `<div class="row"><span class="t">${esc(p.name)}</span><span class="num">${fmt2(p.value)}</span></div>`).join('')}</div>` : ''}
    ${isNew ? '' : '<label><input type="checkbox" name="del" style="width:auto"> Supprimer ce compte et ses opérations</label>'}`,
  f => {
    if (f.del) { S.accounts = S.accounts.filter(x => x.id !== a.id); S.tx = S.tx.filter(t => t.acc !== a.id); return; }
    const nb = parseFloat(f.balance) || 0;
    if (nb !== a.balance) a.balanceDate = new Date().toISOString().slice(0, 10);
    Object.assign(a, { name: f.name, inst: f.inst, type: f.type, balance: nb });
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
    const tx = { id: uid(), acc: acc.id, date: t.date, amount: t.amount, label: t.label, hash: h };
    tx.cat = categorize(tx);
    S.tx.push(tx); added++;
  }
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
checkLock(); snapshot(); render();
Bank.handleRedirect().then(() => Bank.sync()).catch(() => {});

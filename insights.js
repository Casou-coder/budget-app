// Analyse du comportement financier : profil, répartition besoins/envies/épargne,
// reste à dépenser au quotidien, priorités, dépenses récurrentes, conseils.
// Fonctions pures : elles reçoivent l'état et renvoient des chiffres.
'use strict';
const Insights = (() => {
  // Nature par défaut des catégories de dépense (modifiable dans Réglages)
  const NATURE = {
    'Logement': 'besoin', 'Courses': 'besoin', 'Transport': 'besoin', 'Santé': 'besoin', 'Impôts': 'besoin',
    'Frais bancaires': 'besoin', 'Assurances': 'besoin', 'Téléphone & Internet': 'besoin',
    'Restaurants': 'envie', 'Loisirs': 'envie', 'Shopping': 'envie', 'Abonnements': 'envie', 'Voyages': 'envie',
    'Cadeaux & dons': 'envie', 'Divers': 'envie'
  };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ym = d => d.slice(0, 7);
  const today = () => new Date().toISOString().slice(0, 10);

  function natureOf(S, cat) { return (S.settings.nature || {})[cat] || NATURE[cat] || 'envie'; }

  // Mois complets les plus récents ayant des opérations (hors mois en cours), max n
  function refMonths(S, n = 3) {
    const cur = today().slice(0, 7);
    const ms = [...new Set(S.tx.map(t => ym(t.date)))].filter(m => m < cur).sort().reverse().slice(0, n);
    return ms.length ? ms : [cur];
  }

  // Agrégat sur une liste de mois
  function aggregate(S, kindOf, months) {
    const set = new Set(months), invest = new Set(S.accounts.filter(a => a.type === 'invest' || a.type === 'epargne').map(a => a.id));
    const r = { income: 0, besoin: 0, envie: 0, placed: 0, byCat: {}, small: 0, smallSum: 0, weekend: 0, out: 0, merchants: {} };
    for (const t of S.tx) {
      if (!set.has(ym(t.date))) continue;
      const k = kindOf(t.cat);
      if (k === 'in') { r.income += t.amount; continue; }
      if (k === 'move') { if (t.cat !== 'Virement interne' && !invest.has(t.acc)) r.placed -= t.amount; continue; }
      const v = -t.amount; // dépense positive (remboursement = négatif)
      r[natureOf(S, t.cat)] += v; r.out += v;
      r.byCat[t.cat] = (r.byCat[t.cat] || 0) + v;
      if (v > 0 && v < 20) { r.small++; r.smallSum += v; }
      const wd = new Date(t.date + 'T12:00').getDay(); if (wd === 0 || wd === 6) r.weekend += v;
      if (natureOf(S, t.cat) === 'envie' && v > 0) { const m = merchant(t.label); r.merchants[m] = (r.merchants[m] || 0) + v; }
    }
    const n = months.length;
    for (const k of ['income', 'besoin', 'envie', 'placed', 'small', 'smallSum', 'weekend', 'out']) r[k] /= n;
    for (const c in r.byCat) r.byCat[c] /= n;
    for (const m in r.merchants) r.merchants[m] /= n;
    r.saving = r.income - r.out;
    r.months = n;
    return r;
  }

  // Libellé simplifié pour regrouper les marchands
  function merchant(label) {
    let s = Parsers.norm(label)
      .replace(/^(carte|cb|prlv|prlv sepa|vir|vir sepa|paiement|achat)\s*/g, '')
      .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, '').replace(/\bx?\d{3,}\b/g, '').replace(/[*#]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return s.split(' ').slice(0, 3).join(' ') || 'autre';
  }

  // ---------- profil ----------
  const PROFILES = {
    none: { e: '🔍', name: 'Pas encore assez de données', d: 'Importez au moins un mois complet de relevés pour obtenir votre profil.' },
    deficit: { e: '🔥', name: 'En déficit', d: 'Vous dépensez plus que vous ne gagnez. Priorité absolue : revenir à l’équilibre avant toute autre chose.' },
    contraint: { e: '🧱', name: 'Budget contraint', d: 'Vos dépenses obligatoires absorbent l’essentiel de vos revenus. Vos envies sont déjà raisonnables : le levier est sur les charges fixes (loyer, assurances, contrats, transport).' },
    depensier: { e: '🛍️', name: 'Profil dépensier', d: 'Une grosse part de vos revenus part en envies (restaurants, shopping, loisirs…). Vous vivez bien, mais votre épargne en pâtit.' },
    filfin: { e: '🎯', name: 'Sur le fil', d: 'Vous ne dépensez pas excessivement, mais il ne reste presque rien en fin de mois. Quelques ajustements suffisent à dégager une épargne régulière.' },
    equilibre: { e: '⚖️', name: 'Équilibré', d: 'Bon équilibre entre obligations, plaisirs et épargne. Continuez et automatisez votre épargne.' },
    epargnant: { e: '💰', name: 'Épargnant', d: 'Vous mettez de côté une part importante de vos revenus tout en gardant un peu de place pour vos envies.' },
    conservateur: { e: '🐿️', name: 'Très conservateur', d: 'Vous épargnez énormément et vous vous accordez très peu de plaisirs. Vérifiez que votre épargne travaille (placements) et que vous ne vous privez pas inutilement.' }
  };

  function profile(S, kindOf) {
    const months = refMonths(S, 3);
    const a = aggregate(S, kindOf, months);
    if (a.income <= 0) return { key: 'none', ...PROFILES.none, a, traits: [], score: null, months };
    const s = a.saving / a.income, n = a.besoin / a.income, w = a.envie / a.income;
    let key;
    if (s < 0) key = 'deficit';
    else if (w > 0.35) key = 'depensier';
    else if (n > 0.55 && s < 0.15) key = 'contraint';
    else if (s < 0.10 && w > 0.25) key = 'depensier';
    else if (s >= 0.40 && w < 0.15) key = 'conservateur';
    else if (s >= 0.25) key = 'epargnant';
    else if (s >= 0.10) key = 'equilibre';
    else key = 'filfin';

    // Traits secondaires, à partir des catégories
    const c = x => (a.byCat[x] || 0) / a.income;
    const traits = [];
    if (c('Restaurants') + c('Loisirs') + c('Voyages') > 0.15) traits.push(['🍽️ Épicurien', `${pct(c('Restaurants') + c('Loisirs') + c('Voyages'))} des revenus en sorties, restaurants et voyages.`]);
    if (c('Shopping') > 0.10) traits.push(['🛒 Acheteur compulsif ?', `${pct(c('Shopping'))} des revenus en shopping.`]);
    if (c('Abonnements') > 0.05) traits.push(['📺 Multi-abonné', `${pct(c('Abonnements'))} des revenus en abonnements.`]);
    if (a.small > 25) traits.push(['☕ Petits achats fréquents', `${Math.round(a.small)} achats de moins de 20 € par mois (${fmt(a.smallSum)}).`]);
    if (a.out > 0 && a.weekend / a.out > 0.45) traits.push(['🎉 Dépensier du week-end', `${pct(a.weekend / a.out)} des dépenses le samedi et le dimanche.`]);
    if (a.placed / a.income > 0.10) traits.push(['📈 Investisseur', `${pct(a.placed / a.income)} des revenus versés vers l’épargne ou les placements.`]);
    if (s > 0.15 && a.placed / a.income < 0.03) traits.push(['😴 Épargne dormante', 'Vous dégagez de l’épargne mais elle reste sur le compte courant.']);
    if (w > 0.25 && w <= 0.35) traits.push(['⚠️ Envies proches du plafond', `${pct(w)} des revenus en envies (repère : 30 %).`]);
    if (c('Logement') > 0.35) traits.push(['🏠 Logement lourd', `Le logement pèse ${pct(c('Logement'))} des revenus (repère : < 33 %).`]);

    // Score de santé financière (0–100)
    const score = Math.round(
      45 * clamp(s / 0.25) +                          // épargne : 25 % = plein
      30 * (1 - clamp((w - 0.30) / 0.30)) +           // envies : pénalité au-delà de 30 %
      25 * (1 - clamp((n - 0.50) / 0.30))             // obligations : pénalité au-delà de 50 %
    );
    return { key, ...PROFILES[key], a, s, n, w, traits, score, months };
  }

  // ---------- reste à dépenser aujourd'hui ----------
  function daily(S, kindOf) {
    const ref = aggregate(S, kindOf, refMonths(S, 3));
    const curM = today().slice(0, 7), cur = aggregate(S, kindOf, [curM]);
    const income = Math.max(ref.income, cur.income);
    const target = (S.settings.savingsTarget ?? 20) / 100;
    const besoins = Math.max(ref.besoin, cur.besoin);       // obligations attendues sur le mois
    const envelope = income * (1 - target) - besoins;       // ce qu'on peut consacrer aux envies
    const remaining = envelope - cur.envie;
    const d = new Date(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const daysLeft = last - d.getDate() + 1;
    const spentToday = -S.tx.filter(t => t.date === today() && kindOf(t.cat) === 'out' && natureOf(S, t.cat) === 'envie').reduce((x, t) => x + t.amount, 0);
    const perDay = remaining > 0 ? (remaining + spentToday) / daysLeft : 0;
    return { income, target, besoins, envelope, spent: cur.envie, remaining, daysLeft, perDay, spentToday, leftToday: perDay - spentToday };
  }

  // ---------- priorités : où réduire en premier ----------
  function priorities(S, kindOf) {
    const p = profile(S, kindOf); const a = p.a;
    if (!a.income) return [];
    const envies = Object.entries(a.byCat).filter(([c]) => natureOf(S, c) === 'envie');
    const totalEnvie = envies.reduce((x, [, v]) => x + v, 0) || 1;
    // Enveloppe envies : 30 % des revenus (règle 50/30/20), réduite si les obligations
    // ne laissent pas de quoi atteindre l'objectif d'épargne.
    const target = (S.settings.savingsTarget ?? 20) / 100;
    const allowed = Math.max(0, Math.min(a.income * 0.30, a.income * (1 - target) - a.besoin));
    return envies.map(([cat, v]) => {
      const fair = allowed * v / totalEnvie;
      return { cat, avg: v, share: v / a.income, target: Math.min(v, fair), saving: Math.max(0, v - fair) };
    }).sort((x, y) => y.saving - x.saving || y.avg - x.avg);
  }

  // ---------- dépenses récurrentes (abonnements, prélèvements) ----------
  function recurring(S, kindOf) {
    const groups = {};
    for (const t of S.tx) {
      if (t.amount >= 0 || kindOf(t.cat) === 'in' || t.cat === 'Virement interne') continue;
      const k = merchant(t.label);
      (groups[k] = groups[k] || []).push(t);
    }
    const out = [];
    for (const [k, list] of Object.entries(groups)) {
      const months = new Set(list.map(t => ym(t.date)));
      if (months.size < 2) continue;
      const amounts = list.map(t => -t.amount), avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stable = amounts.every(x => Math.abs(x - avg) <= Math.max(2, avg * 0.15));
      if (!stable || list.length > months.size * 2) continue; // pas une dépense mensuelle régulière
      const last = list.map(t => t.date).sort().pop();
      out.push({ name: list[list.length - 1].label, key: k, avg, cat: list[0].cat, kind: kindOf(list[0].cat), last, count: months.size });
    }
    return out.sort((a, b) => b.avg - a.avg);
  }

  // ---------- conseils personnalisés ----------
  function tips(S, kindOf) {
    const p = profile(S, kindOf), a = p.a, t = [];
    if (!a.income) return ['Importez vos relevés ou connectez vos banques pour recevoir des conseils.'];
    const pr = priorities(S, kindOf).filter(x => x.saving > 5);
    if (p.key === 'deficit') t.push(`Vous perdez ${fmt(-a.saving)} par mois. Fixez un plafond strict sur vos envies (${fmt(a.envie)} actuellement).`);
    if (pr[0]) t.push(`Premier levier : <b>${pr[0].cat}</b>. Passer de ${fmt(pr[0].avg)} à ${fmt(pr[0].target)} par mois libère ${fmt(pr[0].saving)}.`);
    if (pr[1]) t.push(`Deuxième levier : <b>${pr[1].cat}</b> (${fmt(pr[1].saving)} d’économie possible).`);
    const rec = recurring(S, kindOf), subs = rec.filter(r => r.kind === 'out' && natureOf(S, r.cat) === 'envie');
    if (subs.length) t.push(`${subs.length} prélèvements réguliers non essentiels (${fmt(subs.reduce((x, r) => x + r.avg, 0))}/mois). Résiliez ceux que vous n’utilisez plus.`);
    if (a.small > 20) t.push(`Vos ${Math.round(a.small)} petits achats mensuels coûtent ${fmt(a.smallSum)}. Essayez une enveloppe hebdomadaire.`);
    if (p.n > 0.5) t.push(`Vos obligations représentent ${pct(p.n)} des revenus (repère : 50 %). Renégociez assurances, énergie et forfaits.`);
    if (p.key === 'conservateur' || p.traits.some(x => x[0].includes('dormante'))) t.push('Une fois 3 à 6 mois de dépenses de côté (épargne de précaution), placez le surplus (PEA, assurance vie, ETF) plutôt que de le laisser dormir.');
    if (p.s > 0 && p.s < 0.2) t.push(`Programmez un virement automatique de ${fmt(Math.ceil(a.income * 0.1 / 10) * 10)} le jour de la paie : on épargne d’abord, on dépense ensuite.`);
    if (p.key === 'epargnant' || p.key === 'equilibre') t.push('Votre gestion est saine : gardez le cap et vérifiez vos budgets une fois par semaine.');
    return t;
  }

  // Budgets recommandés (règle 50/30/20 adaptée à vos habitudes)
  function suggestedBudgets(S, kindOf) {
    const a = profile(S, kindOf).a, out = {};
    if (!a.income) return out;
    for (const { cat, target } of priorities(S, kindOf)) out[cat] = Math.round(target / 5) * 5;
    for (const [c, v] of Object.entries(a.byCat)) if (natureOf(S, c) === 'besoin') out[c] = Math.ceil(v / 10) * 10;
    return out;
  }

  const fmt = n => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct = x => Math.round(x * 100) + ' %';
  return { NATURE, natureOf, profile, daily, priorities, recurring, tips, suggestedBudgets, aggregate, refMonths, merchant, pct };
})();

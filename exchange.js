// Change de devises (ex. salaire en CHF converti en EUR via Telexoo, Revolut, Wise ou la banque).
// Les deux jambes (CHF qui sortent, EUR qui reviennent) ne sont ni une dépense ni un revenu :
// c'est votre argent, converti. Seul l'écart avec le taux de référence BCE est un vrai coût,
// compté en « Frais de change ».
'use strict';
const Exchange = (() => {
  const PROVIDERS = [
    ['Telexoo', /telexoo/i], ['Revolut', /revolut/i], ['Wise', /\bwise\b|transferwise/i], ['Swissquote', /swissquote/i],
    ['Yuh', /\byuh\b/i], ['Neon', /\bneon\b/i], ['iBanFirst', /ibanfirst/i], ['XE', /\bxe\b|xe\.com/i], ['Kantox', /kantox/i],
    ['Western Union', /western union/i], ['Banque', /\bchange\b|devise|conversion|\bfx\b|forex|cambio|wechsel/i]
  ];
  const WINDOW = 10;   // jours max entre l'envoi et la réception
  const TOL = 0.05;    // écart max avec le taux BCE (frais + marge du service)
  const provider = (...labels) => { const l = labels.join(' '); const p = PROVIDERS.find(([, re]) => re.test(l)); return p ? p[0] : null; };
  const isProviderLabel = l => PROVIDERS.some(([, re]) => re.test(l));
  const curOf = t => t.cur || FX.main();

  // Apparie les changes. Appelé après chaque import/synchronisation (recalcul complet, idempotent).
  function link() {
    const main = FX.main();
    const list = S.tx.filter(t => !t.manual).sort((a, b) => a.date.localeCompare(b.date));
    const used = new Set(S.tx.filter(t => t.paired).map(t => t.id)); // virements internes même devise déjà appariés
    for (const d of list) {
      if (d.amount >= 0 || used.has(d.id)) continue;
      const t0 = new Date(d.date).getTime();
      let best = null, bestGap = Infinity;
      for (const c of list) {
        if (c.amount <= 0 || used.has(c.id) || c.acc === d.acc || curOf(c) === curOf(d)) continue;
        const dt = (new Date(c.date).getTime() - t0) / 864e5;
        if (dt < -1 || dt > WINDOW) continue;
        const gap = Math.abs(c.amount + d.amount) / Math.abs(d.amount); // comparaison au taux BCE
        if (gap > TOL) continue;
        const score = gap + dt * 0.002; // privilégie le plus proche en montant puis en date
        if (score < bestGap) { bestGap = score; best = c; }
      }
      if (!best) continue;
      const c = best, cost = -d.amount - c.amount; // en devise principale : valeur BCE envoyée − reçu
      d.cat = c.cat = 'Change de devises'; d.paired = c.paired = true; d.xpair = c.id; c.xpair = d.id;
      d.fx = {
        provider: provider(d.label, c.label) || 'Autre', sent: -d.orig, sentCur: curOf(d), recv: c.orig, recvCur: curOf(c),
        rate: c.orig / -d.orig, ref: FX.rateAt(curOf(d), d.date) / FX.rateAt(curOf(c), c.date), cost, date: d.date, recvDate: c.date
      };
      used.add(d.id); used.add(c.id);
    }
    // Jambe sans contrepartie (ex. compte Revolut non connecté)
    const foreignSalary = S.tx.some(t => t.cat === 'Salaire' && curOf(t) !== main);
    for (const t of S.tx) {
      if (t.manual || t.paired || t.cat !== 'Change de devises') continue;
      // Euros reçus d'un service de change alors que le salaire en CHF n'est pas visible : c'est votre revenu
      if (t.amount > 0 && !foreignSalary) t.cat = 'Salaire';
    }
  }

  // Défait les anciens appariements avant un recalcul
  function reset(autoCat) {
    for (const t of S.tx) {
      if (!t.paired || t.manual) continue;
      delete t.paired; delete t.xpair; delete t.fx;
      t.cat = autoCat(t);
    }
  }

  // Changes sur une période (pour la carte et les conseils)
  function history(days = 365) {
    const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const ops = S.tx.filter(t => t.fx && t.date >= from).map(t => ({ ...t.fx, share: (S.accounts.find(a => a.id === t.acc) || {}).share ?? 1 })).sort((a, b) => b.date.localeCompare(a.date));
    const sentMain = ops.reduce((x, o) => x + o.sent * o.ref * FX.rateAt(o.recvCur, o.recvDate), 0);
    const cost = ops.reduce((x, o) => x + o.cost, 0);
    const byProv = {};
    for (const o of ops) { const b = byProv[o.provider] = byProv[o.provider] || { n: 0, sent: 0, cost: 0 }; b.n++; b.sent += o.sent * o.ref; b.cost += o.cost; }
    return { ops, cost, sentMain, spread: sentMain ? cost / sentMain : 0, byProv };
  }

  return { link, reset, history, provider, isProviderLabel };
})();

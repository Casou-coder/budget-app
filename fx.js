// Devises : tout est affiché et calculé dans la devise principale (Réglages, EUR par défaut).
// Chaque opération garde son montant d'origine (t.orig, t.cur) et est convertie au taux
// du jour de l'opération (taux de référence BCE via frankfurter.app, sans donnée personnelle envoyée).
'use strict';
const FX = (() => {
  const FALLBACK_EUR = { EUR: 1, CHF: 1.06, USD: 0.92, GBP: 1.17 }; // si hors ligne au premier lancement
  const main = () => S.settings.currency || 'EUR';
  const accCur = a => (a && a.currency) || 'EUR';
  const today = () => new Date().toISOString().slice(0, 10);
  const store = () => (S.fxh = S.fxh || {});
  const keysCache = {};

  function rateAt(cur, date) {
    cur = cur || 'EUR'; const m = main();
    if (cur === m) return 1;
    const h = store()[cur + '>' + m];
    if (h && h.rates) {
      if (date && h.rates[date]) return h.rates[date];
      let ks = keysCache[cur + m];
      if (!ks || ks.n !== Object.keys(h.rates).length) { const k = Object.keys(h.rates).sort(); ks = keysCache[cur + m] = { k, n: k.length }; }
      if (date && ks.k.length) { // taux du dernier jour ouvré précédent
        let lo = 0, hi = ks.k.length - 1, best = null;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (ks.k[mid] <= date) { best = ks.k[mid]; lo = mid + 1; } else hi = mid - 1; }
        if (best) return h.rates[best];
        return h.rates[ks.k[0]];
      }
      if (h.latest) return h.latest;
    }
    return (FALLBACK_EUR[cur] || 1) / (FALLBACK_EUR[m] || 1);
  }
  const now = cur => rateAt(cur, today());

  function stats(cur, days = 90) {
    const h = store()[cur + '>' + main()]; if (!h || !h.rates) { const r = now(cur); return { now: r, min: r, avg: r, max: r }; }
    const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const v = Object.entries(h.rates).filter(([d]) => d >= from).map(([, r]) => r);
    if (!v.length) return { now: now(cur), min: now(cur), avg: now(cur), max: now(cur) };
    return { now: now(cur), min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length };
  }

  // Recalcule les montants dans la devise principale (et migre les anciennes opérations)
  function reconvert() {
    const accs = Object.fromEntries(S.accounts.map(a => [a.id, a]));
    for (const t of S.tx) {
      if (t.orig == null) { t.orig = t.amount; t.cur = accCur(accs[t.acc]); }
      t.amount = Math.round(t.orig * rateAt(t.cur, t.date) * 100) / 100;
    }
  }

  async function refresh(force) {
    const m = main();
    const curs = [...new Set(S.accounts.map(accCur).concat('EUR'))].filter(c => c !== m);
    let changed = false;
    for (const c of curs) {
      const key = c + '>' + m, h = store()[key] = store()[key] || { rates: {} };
      if (!force && h.at && Date.now() - h.at < 6 * 3600e3) continue;
      const dates = S.tx.filter(t => (t.cur || accCur(S.accounts.find(a => a.id === t.acc))) === c).map(t => t.date).sort();
      const need = dates[0] || new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
      const have = Object.keys(h.rates).sort();
      const start = have.length && have[0] <= need ? have[have.length - 1] : need;
      try {
        const r = await (await fetch(`https://api.frankfurter.app/${start}..?from=${c}&to=${m}`)).json();
        for (const [d, v] of Object.entries(r.rates || {})) if (v[m]) h.rates[d] = v[m];
        const l = await (await fetch(`https://api.frankfurter.app/latest?from=${c}&to=${m}`)).json();
        if (l.rates && l.rates[m]) { h.latest = l.rates[m]; h.rates[l.date] = l.rates[m]; }
        h.at = Date.now(); changed = true;
      } catch (e) { /* hors ligne : on garde les taux connus */ }
    }
    if (changed) { reconvert(); save(); }
    return changed;
  }

  // Indicateurs frontalier : salaire perçu dans une devise étrangère
  function salary(S, months) {
    const set = new Set(months), m = main(), by = {};
    for (const t of S.tx) {
      if (t.cat !== 'Salaire' || !set.has(t.date.slice(0, 7)) || (t.cur || m) === m) continue;
      const share = (S.accounts.find(a => a.id === t.acc) || {}).share ?? 1;
      const b = by[t.cur] = by[t.cur] || { orig: 0, conv: 0 };
      b.orig += t.orig * share; b.conv += t.amount * share;
    }
    const cur = Object.keys(by).sort((a, b) => by[b].orig - by[a].orig)[0];
    if (!cur) return null;
    const n = months.length, st = stats(cur, 90);
    const orig = by[cur].orig / n, conv = by[cur].conv / n;
    return {
      cur, orig, conv, rate: st.now, min: st.min, max: st.max, avg: st.avg,
      atNow: orig * st.now, prudent: orig * Math.min(st.now, st.min),
      perCent: orig * 0.01 // impact de 1 centime de variation du taux, par mois
    };
  }

  return { main, accCur, rateAt, now, stats, reconvert, refresh, salary };
})();

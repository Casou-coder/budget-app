// Mois budgétaire : d'une paie à la suivante (et non du 1er au 31).
// Ex. paie le 25 : le salaire reçu le 25 octobre finance le « budget de novembre » (25 oct → 24 nov).
// Le jour de paie est détecté automatiquement à partir des salaires, ou réglé dans Réglages.
'use strict';
const Period = (() => {
  const TOL = 3; // une paie peut arriver jusqu'à 3 jours plus tôt (week-end, jour férié)
  let cache = { n: -1, day: 1, pays: [] };
  const pad = n => String(n).padStart(2, '0');
  const addM = (m, k) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const dim = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const dateIn = (m, day) => `${m}-${pad(Math.min(day, dim(m)))}`;
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  function detect() {
    const sal = S.tx.filter(t => t.cat === 'Salaire' && t.amount > 0);
    if (cache.n === sal.length) return cache.day;
    const best = {}; // plus gros salaire de chaque mois calendaire
    for (const t of sal) { const m = t.date.slice(0, 7); if (!best[m] || t.amount > best[m].amount) best[m] = t; }
    const days = Object.values(best).map(t => +t.date.slice(8, 10)).sort((a, b) => a - b);
    let day = 1;
    if (days.length) {
      // jour de paie « nominal » : le plus tardif parmi les jours habituels (les avances de week-end tirent vers le bas)
      const med = days[Math.floor(days.length / 2)];
      day = Math.max(...days.filter(d => Math.abs(d - med) <= TOL));
      if (day <= TOL + 1) day = 1; // paie en tout début de mois : mois calendaire
    }
    cache = { n: sal.length, day, pays: Object.values(best).map(t => t.date).sort() };
    return day;
  }
  // Dates réelles de versement du salaire (une par mois)
  const pays = () => (detect(), cache.pays);
  const bmOfPay = (d, p) => p >= 15 ? addM(d.slice(0, 7), 1) : d.slice(0, 7);
  const lastPay = date => { let r = null; for (const d of pays()) { if (d <= date) r = d; else break; } return r; };
  const payday = () => S.settings.payday || detect();
  const threshold = () => Math.max(1, payday() - TOL);

  // Mois budgétaire (AAAA-MM) auquel appartient une date
  function of(date) {
    const p = payday(), cal = date.slice(0, 7);
    if (p <= 1) return cal;
    // 1) si un salaire a été versé dans les 40 jours précédents, on est dans la période qu'il finance
    const lp = lastPay(date);
    if (lp && (new Date(date) - new Date(lp)) / 864e5 < 40 && !(S.settings.payday && Math.abs(+lp.slice(8, 10) - p) > 10)) return bmOfPay(lp, p);
    // 2) sinon (historique sans salaire), découpage théorique autour du jour de paie
    const day = +date.slice(8, 10), th = threshold();
    if (p >= 15) return day >= th ? addM(cal, 1) : cal; // paie en fin de mois → finance le mois suivant
    return day >= th ? cal : addM(cal, -1);            // paie en début de mois
  }

  // Bornes d'un mois budgétaire
  function range(bm) {
    const p = payday(), th = threshold();
    if (p <= 1) return { start: bm + '-01', end: dateIn(bm, 31) };
    const ps = pays(), i = ps.findIndex(d => bmOfPay(d, p) === bm);
    if (i >= 0) {
      const endD = ps[i + 1] ? new Date(ps[i + 1] + 'T12:00') : new Date(expectedNext(ps[i], p) + 'T12:00');
      endD.setDate(endD.getDate() - 1);
      return { start: ps[i], end: `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}` };
    }
    const startM = p >= 15 ? addM(bm, -1) : bm;
    const start = dateIn(startM, th);
    const next = new Date(dateIn(addM(startM, 1), th) + 'T12:00'); next.setDate(next.getDate() - 1);
    return { start, end: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` };
  }

  const expectedNext = (payDate, p) => dateIn(addM(payDate.slice(0, 7), 1), p);
  // Jours restants jusqu'à la prochaine paie attendue (aujourd'hui compris)
  function daysLeft() {
    const t = todayStr(), bm = of(t), p = payday(), lp = lastPay(t);
    let pay;
    if (p <= 1) pay = addM(bm, 1) + '-01';
    else if (lp && bmOfPay(lp, p) === bm) pay = expectedNext(lp, p);
    else pay = dateIn(p >= 15 ? bm : addM(bm, 1), p);
    return Math.max(1, Math.round((new Date(pay + 'T12:00') - new Date(t + 'T12:00')) / 864e5));
  }

  const current = () => of(todayStr());
  const fmtD = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const label = bm => { const r = range(bm); return payday() <= 1 ? '' : `du ${fmtD(r.start)} au ${fmtD(r.end)}`; };

  return { payday, detect, of, range, daysLeft, current, label };
})();

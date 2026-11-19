// Parsers d'import (CIC CSV/OFX, Trade Republic via pytr, CSV générique).
// Tout est exécuté localement dans le navigateur.
'use strict';
const Parsers = (() => {
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function parseNumber(v) {
    if (v == null) return NaN;
    let s = String(v).replace(/[\s €$]/g, '').replace(/EUR/i, '');
    if (!s) return NaN;
    if (s.includes(',') && s.includes('.')) {
      // 1.234,56 ou 1,234.56
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else s = s.replace(',', '.');
    return parseFloat(s);
  }

  function parseDate(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  function splitCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [';', '\t', ',', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  const find = (h, keys) => h.findIndex(x => keys.some(k => norm(x) === k)) >= 0
    ? h.findIndex(x => keys.some(k => norm(x) === k))
    : h.findIndex(x => keys.some(k => norm(x).includes(k)));

  // Transactions CSV (CIC, Trade Republic/pytr, générique)
  function parseCSV(text) {
    const rows = splitCSV(text);
    if (rows.length < 2) throw new Error('Fichier vide ou illisible');
    // trouver la ligne d'en-tête (CIC peut ajouter des lignes avant)
    let hi = rows.findIndex(r => r.some(c => /date|datum|isin/i.test(norm(c))));
    if (hi < 0) throw new Error("Aucune colonne 'Date' trouvée");
    const h = rows[hi];

    // Positions de portefeuille (pytr portfolio)
    const iIsin = find(h, ['isin']), iQty = find(h, ['quantity', 'shares', 'quantite', 'anzahl']);
    const iNet = find(h, ['netvalue', 'net value', 'valeur', 'value', 'wert']);
    const iDate = find(h, ['date d\'operation', 'date operation', 'date', 'datum']);
    const iDeb = find(h, ['debit']), iCred = find(h, ['credit']);
    const iAmt = find(h, ['montant', 'amount', 'value', 'wert', 'betrag']);
    const iLab = find(h, ['libelle', 'label', 'description', 'note', 'notiz', 'name', 'beneficiaire']);
    const iType = find(h, ['type', 'typ']);
    const iBal = find(h, ['solde', 'balance']);

    const out = []; let lastBalance = null;
    for (const r of rows.slice(hi + 1)) {
      const date = iDate >= 0 ? parseDate(r[iDate]) : null;
      if (!date) continue;
      let amount;
      if (iDeb >= 0 || iCred >= 0) {
        const d = parseNumber(r[iDeb]), c = parseNumber(r[iCred]);
        amount = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d));
      } else amount = parseNumber(r[iAmt]);
      if (isNaN(amount) || amount === 0) continue;
      const type = iType >= 0 ? (r[iType] || '').trim() : '';
      let label = (iLab >= 0 ? r[iLab] : '').trim();
      if (iIsin >= 0 && r[iIsin]) label = (label ? label + ' ' : '') + r[iIsin].trim();
      if (type && !label.toLowerCase().includes(type.toLowerCase())) label = `${type} · ${label}`.replace(/ · $/, '');
      out.push({ date, amount: Math.round(amount * 100) / 100, label: label || type || 'Opération', type });
      if (iBal >= 0) { const b = parseNumber(r[iBal]); if (!isNaN(b) && (!lastBalance || date >= lastBalance.date)) lastBalance = { date, value: b }; }
    }
    const positionsMode = !out.length && iIsin >= 0 && iNet >= 0;
    if (positionsMode) return { kind: 'positions', positions: parsePositions(rows.slice(hi + 1), h, iIsin, iQty, iNet) };
    return { kind: 'tx', tx: out, balance: lastBalance };
  }

  function parsePositions(rows, h, iIsin, iQty, iNet) {
    const iName = find(h, ['name', 'nom', 'titre']);
    return rows.map(r => ({ isin: (r[iIsin] || '').trim(), name: (r[iName] || r[iIsin] || '').trim(), qty: parseNumber(r[iQty]), value: parseNumber(r[iNet]) }))
      .filter(p => p.isin && !isNaN(p.value));
  }

  function parseOFX(text) {
    const tx = [];
    const tag = (b, t) => { const m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    for (const b of text.split(/<STMTTRN>/i).slice(1)) {
      const date = parseDate(tag(b, 'DTPOSTED')), amount = parseNumber(tag(b, 'TRNAMT'));
      if (!date || isNaN(amount)) continue;
      const label = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' ').trim();
      tx.push({ date, amount, label: label || 'Opération', fitid: tag(b, 'FITID') });
    }
    const bal = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)[\s\S]*?<DTASOF>([^<\r\n]+)/i);
    return { kind: 'tx', tx, balance: bal ? { value: parseNumber(bal[1]), date: parseDate(bal[2]) } : null };
  }

  function parse(name, text) {
    if (/\.(ofx|qfx)$/i.test(name) || /<OFX>/i.test(text)) return parseOFX(text);
    return parseCSV(text);
  }

  return { parse, parseNumber, parseDate, norm };
})();

// Connexion bancaire automatique via l'API Enable Banking (agrégateur DSP2 agréé).
// - Aucun serveur intermédiaire à nous : le téléphone signe lui-même ses requêtes (JWT RS256, WebCrypto).
// - La clé privée de votre application Enable Banking reste dans le stockage local du téléphone.
// - Accès en lecture seule (soldes + opérations), consentement bancaire renouvelable (180 jours max).
// Doc API : https://enablebanking.com/docs/api/reference/
'use strict';
const Bank = (() => {
    const cfg = () => (S.bank = S.bank || { apiBase: 'https://api.enablebanking.com', links: [] });
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64urlStr = s => b64url(new TextEncoder().encode(s));
  const redirectUrl = () => cfg().redirect || (location.origin + location.pathname.replace(/[^/]*$/, ''));
  let keyCache = null;

  async function key() {
    if (keyCache) return keyCache;
    const pem = cfg().pem; if (!pem) throw new Error('Clé privée manquante');
    if (/BEGIN RSA PRIVATE KEY/.test(pem)) throw new Error('Clé au format PKCS#1 : convertissez-la avec « openssl pkcs8 -topk8 -nocrypt -in cle.pem -out cle8.pem »');
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    keyCache = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    return keyCache;
  }
  async function jwt() {
    const now = Math.floor(Date.now() / 1000);
    const head = b64urlStr(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: cfg().appId }));
    const body = b64urlStr(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key(), new TextEncoder().encode(head + '.' + body));
    return `${head}.${body}.${b64url(sig)}`;
  }
  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(cfg().apiBase.replace(/\/$/, '') + path, {
        ...opts, headers: { Authorization: 'Bearer ' + await jwt(), 'Content-Type': 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) { throw new Error('Réseau ou CORS bloqué. Vérifiez la connexion, ou utilisez un relais (voir tools/README.md).'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.detail || j.error || `Erreur ${r.status}`);
    return j;
  }

  // ---------- parcours de connexion ----------
  async function banks(country) { return (await api(`/aspsps?country=${country}&psu_type=personal`)).aspsps || []; }

  async function start(name, country) {
    const state = uid();
    const validUntil = new Date(Date.now() + 179 * 864e5).toISOString();
    const r = await api('/auth', { method: 'POST', body: { access: { valid_until: validUntil }, aspsp: { name, country }, state, redirect_url: redirectUrl(), psu_type: 'personal' } });
    cfg().pending = { state, name, country, at: Date.now() }; save();
    location.href = r.url; // page d'authentification de la banque (forte, avec l'app de la banque)
  }

  async function complete(code) {
    const p = cfg().pending || {};
    const r = await api('/sessions', { method: 'POST', body: { code } });
    const link = { id: r.session_id, bank: p.name || (r.aspsp || {}).name || 'Banque', country: p.country, validUntil: (r.access || {}).valid_until, accounts: [] };
    for (const acc of r.accounts || []) {
      const uidAcc = acc.uid || acc;
      const iban = ((acc.account_id || {}).iban || '').slice(-4);
      const type = /SVGS|SAVINGS|LIVRET/i.test(acc.cash_account_type + ' ' + acc.name) ? 'epargne' : 'courant';
      let local = S.accounts.find(a => a.remote === uidAcc);
      if (!local) {
        const label = [acc.name, acc.product, acc.details].filter(Boolean).join(' ');
        const joint = /joint|\bm\.? (ou|et) mme|\bmr (ou|et) mme|\bmme (ou|et) m\b|\bmlle (ou|et)\b/i.test(label);
        local = { id: uid(), name: `${link.bank}${acc.name ? ' · ' + acc.name : ''}${acc.currency && acc.currency !== 'EUR' ? ' ' + acc.currency : ''}${iban ? ' ' + iban : ''}`, inst: link.bank, type, balance: 0, positions: [], remote: uidAcc, currency: acc.currency || 'EUR', share: joint ? 0.5 : 1 };
        S.accounts.push(local);
      }
      link.accounts.push({ uid: uidAcc, local: local.id });
    }
    cfg().links = cfg().links.filter(l => l.bank !== link.bank).concat(link);
    delete cfg().pending; save();
    await sync(true);
  }

  // ---------- synchronisation ----------
  const BAL_ORDER = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD'];
  async function sync(force) {
    const c = cfg(); if (!c.links.length) return;
    if (!force && c.lastSync && Date.now() - c.lastSync < 6 * 3600e3) return;
    let added = 0;
    for (const link of c.links) for (const a of link.accounts) {
      const acc = S.accounts.find(x => x.id === a.local); if (!acc) continue;
      try {
        const bal = (await api(`/accounts/${a.uid}/balances`)).balances || [];
        bal.sort((x, y) => BAL_ORDER.indexOf(x.balance_type) - BAL_ORDER.indexOf(y.balance_type));
        const b = bal.find(x => BAL_ORDER.includes(x.balance_type)) || bal[0];
        if (b) { acc.balance = parseFloat(b.balance_amount.amount); acc.balanceDate = b.reference_date || new Date().toISOString().slice(0, 10); }
        const from = a.lastDate ? new Date(new Date(a.lastDate) - 7 * 864e5) : new Date(Date.now() - 365 * 864e5);
        let ck = null; const list = [];
        do {
          const q = `date_from=${from.toISOString().slice(0, 10)}${ck ? '&continuation_key=' + encodeURIComponent(ck) : ''}`;
          const r = await api(`/accounts/${a.uid}/transactions?${q}`);
          for (const t of r.transactions || []) {
            if (t.status === 'PDNG') continue; // on attend que l'opération soit comptabilisée
            const amt = parseFloat((t.transaction_amount || {}).amount) * (t.credit_debit_indicator === 'DBIT' ? -1 : 1);
            const date = t.booking_date || t.value_date || t.transaction_date;
            const label = [].concat(t.remittance_information || []).join(' ').trim() || (t.creditor || {}).name || (t.debtor || {}).name || 'Opération';
            if (date && !isNaN(amt)) list.push({ date, amount: Math.round(amt * 100) / 100, label, fitid: t.entry_reference || t.transaction_id });
          }
          ck = r.continuation_key;
        } while (ck);
        added += ingest(acc, { tx: list }).added;
        a.lastDate = new Date().toISOString().slice(0, 10);
      } catch (e) { toast(`${acc.name} : ${e.message}`); }
    }
    if (await FX.refresh()) linkTransfers(); // taux du jour de chaque opération en devise
    c.lastSync = Date.now(); save(); snapshot();
    if (added || force) toast(`Synchronisation : ${added} nouvelle(s) opération(s)`);
    render();
  }

  // ---------- retour de la banque (?code=…&state=…) ----------
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return;
    history.replaceState(null, '', location.pathname);
    if (q.has('error')) return toast('Connexion annulée : ' + (q.get('error_description') || q.get('error')));
    const code = q.get('code');
    if (cfg().pending && cfg().pending.state === q.get('state')) {
      try { await complete(code); } catch (e) { toast(e.message); }
    } else {
      // Sur iPhone, la banque peut rouvrir Safari au lieu de l'app installée : on affiche le code à recopier.
      dialogInfo(`<h3>Presque fini</h3><p>Copiez ce code, ouvrez l'app <b>Mon Budget</b> depuis l'écran d'accueil, puis collez-le dans <b>Import › Connexion bancaire</b>.</p>
        <input readonly value="${esc(code)}" onclick="this.select()"><button class="btn" style="margin-top:8px" onclick="navigator.clipboard.writeText('${esc(code)}').then(()=>toast('Code copié'))">Copier le code</button>`);
    }
  }
  function dialogInfo(html) { const d = $('#dlg'); d.innerHTML = `<form method="dialog">${html}<div style="text-align:right;margin-top:12px"><button class="btn sec">Fermer</button></div></form>`; d.onclose = null; d.showModal(); }

  // ---------- interface ----------
  function card() {
    const c = cfg(), ready = c.appId && c.pem;
    const links = c.links.map(l => {
      const days = l.validUntil ? Math.round((new Date(l.validUntil) - Date.now()) / 864e5) : null;
      return `<div class="row"><span class="t">🏦 ${esc(l.bank)}<small>${l.accounts.length} compte(s)${days != null ? ` · consentement valable ${days} j` : ''}${days != null && days < 15 ? ' · <b class="neg">à renouveler</b>' : ''}</small></span><button class="btn sec sm" data-bank="renew" data-name="${esc(l.bank)}" data-country="${l.country || 'FR'}">Renouveler</button></div>`;
    }).join('');
    return `<div class="card"><h2>Connexion bancaire automatique</h2>
      ${links}
      ${c.links.length ? `<button class="btn sm" data-bank="sync">Synchroniser maintenant</button> <small class="mut">${c.lastSync ? 'Dernière : ' + new Date(c.lastSync).toLocaleString('fr-FR') : ''}</small>` : ''}
      ${ready ? `
        <label>Ajouter une banque</label>
        <div class="grid2"><select id="bk-country"><option value="FR">France</option><option value="DE">Allemagne</option></select><button class="btn sec" data-bank="list">Chercher</button></div>
        <div id="bk-list"></div>
        <details style="margin-top:10px"><summary class="mut">Coller un code de retour</summary><div style="display:flex;gap:6px;margin-top:6px"><input id="bk-code" placeholder="code"><button class="btn sm" data-bank="code">OK</button></div></details>`
      : `<p class="mut" style="font-size:13px">Connectez CIC, Trade Republic (compte espèces) et plus de 2 500 banques européennes en lecture seule via <b>Enable Banking</b>, gratuit pour vos propres comptes. Configuration unique de 5 minutes : voir le guide ci-dessous.</p>`}
      <details style="margin-top:10px" ${ready ? '' : 'open'}><summary class="mut">Paramètres de l’API</summary>
        <label>Application ID</label><input id="bk-app" value="${esc(c.appId || '')}" placeholder="xxxxxxxx-xxxx-…">
        <label>Clé privée (.pem)</label><input type="file" id="bk-pem" accept=".pem,.key,.txt">
        <small class="mut">${c.pem ? '✅ Clé enregistrée sur ce téléphone' : 'Aucune clé'}</small>
        <label>URL de retour (à déclarer chez Enable Banking)</label><input id="bk-redir" value="${esc(redirectUrl())}">
        <label>Adresse de l’API</label><input id="bk-base" value="${esc(c.apiBase)}">
        <div style="margin-top:8px"><button class="btn sm" data-bank="save">Enregistrer</button> ${c.links.length ? '<button class="btn sec sm" data-bank="forget" style="color:var(--neg)">Déconnecter les banques</button>' : ''}</div>
        <ol class="mut" style="font-size:13px;padding-left:18px">
          <li>Créez un compte sur <b>enablebanking.com</b> › Control Panel › <i>Applications</i> › <i>Register new</i>.</li>
          <li>Environnement <b>Production</b>, cochez « l’application générera la clé dans le navigateur » ou téléchargez la clé .pem.</li>
          <li>URL de redirection : copiez exactement celle affichée ci-dessus.</li>
          <li>Activez l’application en <b>mode restreint</b> en reliant vos propres comptes (gratuit, usage personnel).</li>
          <li>Collez l’Application ID, importez la clé .pem (via Fichiers sur iPhone), enregistrez.</li>
        </ol></details></div>`;
  }

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-bank]'); if (!el) return;
    const c = cfg(), act = el.dataset.bank;
    try {
      if (act === 'save') {
        c.appId = $('#bk-app').value.trim(); c.redirect = $('#bk-redir').value.trim(); c.apiBase = $('#bk-base').value.trim() || 'https://api.enablebanking.com';
        const f = $('#bk-pem').files[0]; if (f) { c.pem = await f.text(); keyCache = null; await key(); }
        save(); toast('Paramètres enregistrés'); render();
      } else if (act === 'list') {
        el.disabled = true; el.textContent = '…';
        const country = $('#bk-country').value, list = await banks(country);
        const pref = /cic|credit industriel|trade republic|boursorama|credit mutuel/i;
        list.sort((a, b) => (pref.test(b.name) - pref.test(a.name)) || a.name.localeCompare(b.name));
        $('#bk-list').innerHTML = `<input id="bk-filter" placeholder="Filtrer (ex. CIC)" style="margin-top:8px">` + list.map(b => `<div class="row bk-item" data-name="${esc(Parsers.norm(b.name))}"><span class="t">${esc(b.name)}</span><button class="btn sm" data-bank="connect" data-name="${esc(b.name)}" data-country="${country}">Connecter</button></div>`).join('');
        el.disabled = false; el.textContent = 'Chercher';
      } else if (act === 'connect' || act === 'renew') await start(el.dataset.name, el.dataset.country);
      else if (act === 'code') await complete($('#bk-code').value.trim());
      else if (act === 'sync') { el.disabled = true; await sync(true); }
      else if (act === 'forget') { if (confirm('Supprimer les connexions bancaires (les opérations déjà importées sont conservées) ?')) { c.links = []; delete c.pem; keyCache = null; save(); render(); } }
    } catch (err) { toast(err.message); el.disabled = false; if (act === 'list') el.textContent = 'Chercher'; }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'bk-filter') return;
    const q = Parsers.norm(e.target.value);
    document.querySelectorAll('.bk-item').forEach(r => r.classList.toggle('hide', !r.dataset.name.includes(q)));
  });

  return { card, sync, handleRedirect };
})();

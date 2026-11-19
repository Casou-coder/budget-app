// Relais optionnel, à utiliser SEULEMENT si Safari bloque les appels directs à Enable Banking (erreur « CORS »).
// À déployer sur VOTRE compte Cloudflare Workers (gratuit) : il ne stocke rien et ne fait que transmettre
// les requêtes signées par votre téléphone. Ensuite, dans l'app : Import › Paramètres de l'API ›
// Adresse de l'API = https://<votre-worker>.workers.dev
const API = 'https://api.enablebanking.com';
const ALLOWED_ORIGIN = 'https://casou-coder.github.io'; // l'adresse de votre app

export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('Origine refusée', { status: 403 });
    const url = new URL(req.url);
    const r = await fetch(API + url.pathname + url.search, {
      method: req.method,
      headers: { Authorization: req.headers.get('Authorization') || '', 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text()
    });
    return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};

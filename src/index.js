// Worker do Painel de Crise Brusque Discover.
// - /api/news → últimas notícias do Brusque Discover (via Supabase REST) com cache + retry.
// - demais rotas → assets estáticos (public/).

const SUPABASE = 'https://fnmyuwzbxgjfhzbcuvjq.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubXl1d3pieGdqZmh6YmN1dmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3NTMsImV4cCI6MjA4NjIzMzc1M30.xhWBLdW6paPQekqOoKHeNNEfV9dmd2mrwd3MBmAZ31g';
const NEWS_URL = `${SUPABASE}/rest/v1/posts`
  + '?select=title,slug,published_at'
  + '&status=eq.published&post_type=neq.video&published_at=not.is.null'
  + '&order=published_at.desc&limit=10';
const TTL = 60; // segundos
const MAX_ATTEMPTS = 2;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function fetchSupabase() {
  let last;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(NEWS_URL, { headers: H, cf: { cacheTtl: TTL } });
      if (res.ok) return res;
      last = `upstream ${res.status}`;
    } catch (e) {
      last = `upstream ${e.message || e}`;
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(last);
}

async function serveNews(url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/news`);

  try {
    const res = await fetchSupabase();
    const rows = await res.json();
    const items = (rows || []).map(r => ({
      titulo: r.title,
      url: `https://brusquediscover.com.br/noticia/${r.slug}`,
      publicado_em: r.published_at,
    }));

    const body = JSON.stringify({ updated: new Date().toISOString(), items });
    const resp = new Response(body, {
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8',
                 'Cache-Control': `public, max-age=${TTL}` },
    });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    // Tenta servir do cache se o Supabase estiver inacessível
    const stale = await cache.match(cacheKey);
    if (stale) return new Response(stale.body, { headers: stale.headers });
    return new Response(JSON.stringify({ error: String(e.message || e) }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/api/news') return serveNews(url, ctx);
    return env.ASSETS.fetch(request);
  },
  // Pré-aquece o cache do /api/news a cada minuto, pra nunca depender do
  // egress Cloudflare→Supabase na hora da chamada.
  async scheduled(_event, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request('https://paineldiscover.marcososx.workers.dev/api/news');
    try {
      const res = await fetchSupabase();
      const rows = await res.json();
      const items = (rows || []).map(r => ({
        titulo: r.title,
        url: `https://brusquediscover.com.br/noticia/${r.slug}`,
        publicado_em: r.published_at,
      }));
      const body = JSON.stringify({ updated: new Date().toISOString(), items });
      const resp = new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8',
                   'Cache-Control': `public, max-age=${TTL}` },
      });
      await cache.put(cacheKey, resp.clone());
    } catch (e) {
      console.error('scheduled: falha ao atualizar notícias', e.message || e);
    }
  },
};

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

// ── Redução de títulos com Gemini (Workers AI binding caiu no catálogo;
//    usamos a API pública do Gemini com as chaves do Marcos) ────────────
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
const TITLES_TTL = 600; // segundos de cache das reduções

function json(body, status = 200) {
  return new Response(JSON.stringify(body),
    { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function extractArray(text, n) {
  if (!text) return [];
  const out = [];
  // 1) tenta JSON array
  const m = text.match(/\[[\s\S]*\]/g);
  if (m) {
    const cand = m[m.length - 1];
    try {
      const arr = JSON.parse(cand);
      if (Array.isArray(arr)) out.push(...arr.map(x => String(x).trim()));
    } catch (_) {}
  }
  // 2) fallback: uma string por linha (sem numeração/aspas/artefatos)
  if (!out.length) {
    for (const raw of text.split(/\n+/)) {
      let line = raw.replace(/^\s*[\d.)\-–•]+\s*/, '').replace(/^["'“”]\s*/, '').replace(/\s*["'“”]$/, '').trim();
      if (line && /too long|let'?s go|aqui est|vou resumir|segue a|resultado|resposta|^[\d\W]+$/i.test(line)) continue;
      if (line && line.length < 400) out.push(line);
    }
  }
  return out.slice(0, n);
}

async function callGemini(prompt, apiKey) {
  const res = await fetch(GEMINI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error('gemini ' + res.status);
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
}

function truncateSmart(s, max = 55) {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  // corta em limite de palavra sem quebrar no meio
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.5) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:–-]+$/, '') + '…';
}

async function shortenTitles(titles, env) {
  const cache = caches.default;
  const cacheKey = new Request('https://paineldiscover.marcososx.workers.dev/api/titles/' + hashStr(JSON.stringify(titles)));
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const prompt = 'Abaixo está uma lista de títulos de notícias em português. '
    + 'Para CADA título, escreva uma versão reduzida com ATÉ 55 caracteres, '
    + 'mantendo o essencial. Saída: apenas os títulos reduzidos, um por linha, '
    + 'na MESMA ordem da entrada, sem numeração, sem aspas, sem comentários.\n\n'
    + titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  let aiItems = null;
  for (const key of [env.GEMINI_API_KEY, env.GEMINI_API_KEY_ALT].filter(Boolean)) {
    try {
      const text = await callGemini(prompt, key);
      const arr = extractArray(text, titles.length);
      if (arr.length) {
        aiItems = titles.map((t, i) => ({ original: t, curto: arr[i] || t }));
        break;
      }
    } catch (_) {}
  }

  // Valida: se algum item da IA saiu estranho, troca pelo truncamento
  // determinístico — assim o site nunca fica feio.
  const items = titles.map((t, i) => {
    const c = aiItems ? (aiItems[i]?.curto || t) : t;
    const words = (c.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
    const bad = c.length > 70
      || words < 2
      || /\([a-zÀ-ÿ]\(|\d{2,}\)|too long|let'?s go|alternativ|perfeito|char /i.test(c);
    const final = bad ? truncateSmart(t) : c.trim();
    return { original: t, curto: final };
  });

  const resp = json({ items, ai: !!aiItems });
  const clo = resp.clone();
  clo.headers.set('Cache-Control', `public, max-age=${aiItems ? TITLES_TTL : 180}`);
  await cache.put(cacheKey, clo);
  return resp;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

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
    if (url.pathname === '/api/titles' && request.method === 'POST') {
      try {
        const body = await request.json();
        const titles = (body.titles || []).slice(0, 10).map(t => String(t).trim()).filter(Boolean);
        if (!titles.length) return json({ items: [] });
        return await shortenTitles(titles, env);
      } catch (e) {
        return json({ error: String(e.message || e) }, 502);
      }
    }
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

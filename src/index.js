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

// ── Redução de títulos com IA (Groq primário + Gemini reserva) ──────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
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

async function callGroq(prompt, apiKey) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error('groq ' + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
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

function truncateSmart(s, max = 60) {
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
    + 'Reescreva cada título de forma que fique com ENTRE 40 e 60 caracteres '
    + '(contando os espaços). IMPORTANTE: corte/triture o título original, NÃO '
    + 'crie um resumo novo — mantenha o máximo de palavras do original, na ordem, '
    + 'apenas removendo trechos para caber no tamanho. Se o título original for '
    + 'menor que 40 caracteres, mantenha-o como está. '
    + 'Saída: apenas os títulos reescritos, um por linha, '
    + 'na MESMA ordem da entrada, sem numeração, sem aspas, sem comentários.\n\n'
    + titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  // Tenta Groq (estável) primeiro; Gemini como reserva. Qualquer erro
  // cai no fallback determinístico.
  let aiItems = null;
  let providerUsed = null;
  const providers = [
    { name: 'groq', call: () => callGroq(prompt, env.GROQ_API_KEY) },
    { name: 'gemini', call: () => callGemini(prompt, env.GEMINI_API_KEY) },
    { name: 'gemini2', call: () => callGemini(prompt, env.GEMINI_API_KEY_ALT) },
  ];
  for (const p of providers) {
    try {
      const text = await p.call();
      const arr = extractArray(text, titles.length);
      if (arr.length) {
        aiItems = titles.map((t, i) => ({ original: t, curto: arr[i] || t }));
        providerUsed = p.name;
        break;
      }
    } catch (_) {}
  }

  // IA travou (cota/erro) → redundância: manda os 10 títulos originais.
  // Se respondeu, valida cada item e troca só o que saiu estranho pelo
  // truncamento determinístico.
  const items = aiItems
    ? titles.map((t, i) => {
        let c = aiItems[i]?.curto || t;
        const words = (c.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
        const bad = c.length > 70 || words < 2 || /\([a-zÀ-ÿ]\(|\d{2,}\)|too long|let'?s go|alternativ|perfeito|char /i.test(c);
        if (bad) c = truncateSmart(t);
        // garante o teto de 60 caracteres no que veio da IA
        if (c.length > 60) c = c.slice(0, 59).replace(/[\s,;:–-]+$/, '') + '…';
        return { original: t, curto: c.trim() };
      })
    : titles.map(t => ({ original: t, curto: t }));

  const resp = json({ items, ai: !!aiItems, provider: providerUsed });
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

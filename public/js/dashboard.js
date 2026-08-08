// dashboard.js — Dashboard público (OSINT).
(function(){
  'use strict';
  Store.init();

  const NEWS_URL = '/api/news';
  const NEWS_INTERVAL = 10000; // monitora a cada 10 segundos

  // Fallback: se o Worker não conseguir alcançar o Supabase (timeout 522),
  // o browser consulta o Supabase direto (CORS liberado).
  const SUPABASE_DIRECT = 'https://fnmyuwzbxgjfhzbcuvjq.supabase.co/rest/v1/posts'
    + '?select=title,slug,published_at'
    + '&status=eq.published&post_type=neq.video&published_at=not.is.null'
    + '&order=published_at.desc&limit=10';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubXl1d3pieGdqZmh6YmN1dmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3NTMsImV4cCI6MjA4NjIzMzc1M30.xhWBLdW6paPQekqOoKHeNNEfV9dmd2mrwd3MBmAZ31g';

  const ALERT_LABEL = {
    normalidade: 'Normalidade',
    atencao: 'Atenção',
    emergencia: 'Emergência'
  };
  const COBERTURA_LABEL = {
    plantao: 'Estamos de plantão QG Discover',
    painel: 'Estamos ao vivo no painel de crise',
    live: 'Estamos em live (Instagram Discover)',
    youtube: 'Estamos em live (YouTube)'
  };
  const SOCIAL = {
    live: 'https://www.instagram.com/brusquediscover/',
    youtube: 'https://www.youtube.com/@BrusqueDiscover'
  };
  const ICONS = {
    live: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19.3 5 12 5 12 5s-7.3 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C4.7 19 12 19 12 19s7.3 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8C23 15.2 23 12 23 12z"/><path d="M9.8 15.2V8.8l5.7 3.2z" fill="#04121c"/></svg>'
  };

  const $ = id => document.getElementById(id);
  const track = $('ticker-track');        // notícias
  const osintTrack = $('osint-track');    // boletins (feed expandido)
  const miniTrack = $('osint-mini-track');// boletins (feed recolhido)
  const osintBox = $('osint');
  let lastNewsSig = '';
  // cache original → curto: títulos já reduzidos não são re-enviados à IA
  const titleCache = {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Fonte monitorada exibida no card (identidade do QG). Fixa por enquanto —
  // quando o "painel de trás" mandar a origem por boletim, é aqui que troca.
  const HANDLE = 'brusquediscover';
  const AVATAR = '/img/logo.png';
  // selo "verificado" (ao lado do handle, ciano) — igual às contas do pizzint
  const VERIFY_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 1.5 14.5 4l3.5-.3.6 3.5 3 1.9-1.6 3.1L23.5 18l-3.4.9-1.3 3.3L15.4 21 12 22.5 8.6 21l-3.4 1.2-1.3-3.3L.5 18l1.9-2.3L.8 12.6l3-1.9L4.4 7.2 7.9 7.5z"/><path d="M10.8 15.3 7.9 12.4l1.3-1.3 1.6 1.6 4-4 1.3 1.3z" fill="#04121c"/></svg>';
  // link externo (canto superior direito do card) — abre a matéria/boletim
  const EXT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 9.5 14.5"/><path d="M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/></svg>';

  /* ── Motor de marquee (requestAnimationFrame) ─────────────
     Roda contínuo e NUNCA reinicia do zero — o "trimilique"
     acontecia porque a animação CSS era reiniciada. Aqui o
     deslocamento é calculado pelo tempo decorrido. */
  function marquee(el, pxPerSec, vert){
    if (!el || el.dataset.marquee) return;
    el.dataset.marquee = '1';
    let pos = 0, last = null, paused = false, raf;
    const step = ts => {
      raf = requestAnimationFrame(step);
      if (paused) { last = ts; return; }
      if (last == null) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.25);
      last = ts;
      const half = (vert ? el.scrollHeight : el.scrollWidth) / 2;
      // conteúdo ainda vazio/sem tamanho: não move até popular
      if (!(half > 0) || !isFinite(half)) { pos = 0; return; }
      // feed vertical: só rola se o conteúdo (metade duplicada) transbordar o viewport
      if (vert) {
        const vp = el.parentElement ? el.parentElement.clientHeight : 0;
        if (half <= vp + 2) { pos = 0; el.style.transform = 'translate3d(0,0,0)'; return; }
      }
      pos = (pos + pxPerSec * dt) % half;
      if (!isFinite(pos)) pos = 0;
      el.style.transform = vert
        ? 'translate3d(0,' + (-pos) + 'px,0)'
        : 'translate3d(' + (-pos) + 'px,0,0)';
    };
    raf = requestAnimationFrame(step);
    el.addEventListener('mouseenter', () => { paused = true; });
    el.addEventListener('mouseleave', () => { paused = false; last = null; });
    document.addEventListener('visibilitychange', () => { last = null; });
  }

  const timeHm = ts => {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  };
  const ago = ts => {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'agora';
    if (s < 3600) return Math.floor(s/60) + 'min';
    if (s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  };

  /* ── Configurações globais ─────────────────────────────── */
  function renderConfig(cfg){
    document.body.setAttribute('data-alert', cfg.nivelAlerta || 'normalidade');
    $('alerta-txt').textContent = ALERT_LABEL[cfg.nivelAlerta] || cfg.nivelAlerta;
    const cob = cfg.statusCobertura;
    $('cobertura-txt').textContent = COBERTURA_LABEL[cob] || cob;
    const link = $('cobertura-link');
    if (SOCIAL[cob]){
      link.style.display = 'inline-flex';
      link.href = SOCIAL[cob];
      link.innerHTML = ICONS[cob];
      link.title = cob === 'youtube' ? 'Abrir YouTube' : 'Abrir Instagram';
    } else {
      link.style.display = 'none';
      link.removeAttribute('href');
      link.innerHTML = '';
    }
  }

  /* ── Ticker: últimas 10 notícias (título reduzido p/ IA) ─ */
  function renderTicker(items){
    if (!items || !items.length){
      track.innerHTML = '<span class="tk-item">Aguardando notícias do Brusque Discover…</span>';
      return;
    }
    const item = n => '<span class="tk-item"'
      + (n.titulo && n.curto && n.curto !== n.titulo ? ' title="' + esc(n.titulo) + '"' : '')
      + '>'
      + esc(n.curto || n.titulo)
      + (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener" title="Abrir matéria">&#128279;</a>' : '')
      + '</span>';
    track.innerHTML = items.map(item).join('') + items.map(item).join('');
  }

  // corta em limite de palavra no cliente (rede de segurança do título grande)
  function truncClient(s, max = 60){
    s = String(s || '').trim();
    if (s.length <= max) return s;
    let cut = s.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    if (sp > max * 0.5) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:–-]+$/, '') + '…';
  }

  async function shortenTitles(items){
    // só envia pra IA os títulos que ainda não foram reduzidos nesta sessão
    const novos = (items || []).filter(n => !titleCache[n.titulo]);
    if (novos.length){
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 15000);
        const res = await fetch('/api/titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titles: novos.map(n => n.titulo) }),
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (res.ok){
          const d = await res.json();
          // casa por ÍNDICE (a IA devolve na mesma ordem); nunca por string,
          // pra não falhar por diferença mínima de whitespace
          novos.forEach((n, i) => {
            const item = (d.items || [])[i];
            if (item && item.curto) titleCache[n.titulo] = item.curto;
          });
        }
      } catch (_) {}
    }
    // títulos já reduzidos mantêm o curto em cache; o resto usa o original
    // com garantia de tamanho (nunca estoura 60 caracteres)
    return (items || []).map(n => {
      const curto = titleCache[n.titulo] || n.titulo;
      return { ...n, curto: truncClient(curto, 60) };
    });
  }

  async function loadNews(){
    const apply = d => {
      renderTicker(d.items || []);
      $('ticker-track').dataset.loaded = '1';
      $('statusbar').textContent = 'brusquediscover.com.br · atualizado ' + timeHm(Date.now()) + ' · minuto a minuto';
    };
    const fetchWithTimeout = (u, opts, ms) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), ms);
      return fetch(u, Object.assign({ signal: ctl.signal }, opts)).finally(() => clearTimeout(t));
    };
    let items = null;
    // tenta direto do browser (mais confiável) e depois o Worker como fallback
    try {
      const res = await fetchWithTimeout(SUPABASE_DIRECT, { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } }, 8000);
      if (res.ok){
        const rows = await res.json();
        items = (rows || []).map(r => ({
          titulo: r.title,
          url: 'https://brusquediscover.com.br/noticia/' + r.slug,
          publicado_em: r.published_at
        }));
      }
    } catch (_) {}
    if (!items){
      try {
        const res = await fetchWithTimeout(NEWS_URL, { cache: 'no-store' }, 8000);
        if (res.ok) items = (await res.json()).items || [];
      } catch (_) {}
    }
    if (items && items.length){
      // só re-renderiza se as notícias mudaram (evita tremida e poupa a IA)
      const sig = items.map(n => n.titulo).join('|');
      if (sig !== lastNewsSig){
        lastNewsSig = sig;
        apply({ items: await shortenTitles(items) });
      }
    } else if (!$('ticker-track').dataset.loaded){
      renderTicker(null);
    }
  }

  /* ── OSINT Feed: boletins (caixa recolhível) ───────────── */
  function renderOsint(posts){
    $('osint-count').textContent = posts.length
      ? posts.length + (posts.length === 1 ? ' boletim' : ' boletins') : '';
    if (!posts.length){
      osintTrack.innerHTML = '<article class="bcard">'
        + '<div class="bc-title" style="padding-left:0">Aguardando boletins</div>'
        + '<div class="bc-body" style="padding-left:0">O QG publica aqui, em tempo real.</div>'
        + '</article>';
      miniTrack.innerHTML = '<span class="mini-item">Sem boletins ainda</span>';
      return;
    }
    // card no formato do feed OSINT do pizzint: avatar + handle/hora, corpo abaixo
    const card = p => '<article class="bcard">'
      + (p.url ? '<a class="bc-src" href="' + esc(p.url) + '" target="_blank" rel="noopener" title="'
          + esc(p.labelLink || 'Abrir boletim') + '">' + EXT_ICON + '</a>' : '')
      + '<div class="bc-head">'
      +   '<img class="bc-av" src="' + AVATAR + '" alt="" loading="lazy">'
      +   '<div class="bc-id">'
      +     '<span class="bc-handle">' + HANDLE + '<span class="vf">' + VERIFY_ICON + '</span></span>'
      +     '<span class="bc-time">' + timeHm(p.ts) + ' · ' + ago(p.ts) + '</span>'
      +   '</div>'
      + '</div>'
      + (p.titulo ? '<div class="bc-title">' + esc(p.titulo) + '</div>' : '')
      + (p.resumo ? '<div class="bc-body">' + esc(p.resumo) + '</div>' : '')
      + '</article>';
    const mini = p => '<span class="mini-item">'
      + '<span class="mi-time">' + timeHm(p.ts) + '</span>' + esc(p.titulo) + '</span>';
    // duplica o conteúdo p/ o loop contínuo (o marquee usa metade da altura)
    osintTrack.innerHTML = posts.map(card).join('') + posts.map(card).join('');
    miniTrack.innerHTML = posts.map(mini).join('') + posts.map(mini).join('');
  }

  // relógio do cabeçalho (HH:MM local, no lugar do "Zulu" do pizzint)
  function tickClock(){ const c = $('osint-clock'); if (c) c.textContent = timeHm(Date.now()); }

  /* ── Recolher / expandir o OSINT ───────────────────────── */
  function setOsintCollapsed(c){
    osintBox.classList.toggle('collapsed', c);
    $('osint-toggle').textContent = c ? '▴' : '▾';
  }
  const osintToggle = () => setOsintCollapsed(!osintBox.classList.contains('collapsed'));
  $('osint-head').addEventListener('click', osintToggle);
  $('osint-toggle').addEventListener('click', e => { e.stopPropagation(); osintToggle(); });

  function refreshOsint(){
    renderOsint(Store.getPosts());
  }

  /* ── INIT ──────────────────────────────────────────────── */
  renderConfig(Store.getConfig());
  refreshOsint();
  tickClock();
  loadNews();
  marquee(track, 42);
  marquee(osintTrack, 22, true);   // feed OSINT: rola na VERTICAL, devagar
  marquee(miniTrack, 55);          // strip recolhido: ticker horizontal

  window.addEventListener('storage', () => { renderConfig(Store.getConfig()); refreshOsint(); });
  setInterval(() => { renderConfig(Store.getConfig()); refreshOsint(); tickClock(); }, 4000);
  setInterval(loadNews, NEWS_INTERVAL);
})();

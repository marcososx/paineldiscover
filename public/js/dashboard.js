// dashboard.js — Dashboard público (OSINT).
(function(){
  'use strict';
  Store.init();

  const NEWS_URL = '/api/news';
  const NEWS_INTERVAL = 60000; // monitora a cada 1 minuto

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
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

  /* ── Ticker: últimas 10 notícias (título apenas) ───────── */
  function renderTicker(items){
    if (!items || !items.length){
      track.innerHTML = '<span class="tk-item">Aguardando notícias do Brusque Discover…</span>';
      return;
    }
    const item = n => '<span class="tk-item">'
      + esc(n.titulo)
      + (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener" title="Abrir matéria">&#128279;</a>' : '')
      + '</span>';
    track.innerHTML = items.map(item).join('') + items.map(item).join('');
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
    // tenta direto do browser (mais confiável) e depois o Worker como fallback
    try {
      const res = await fetchWithTimeout(SUPABASE_DIRECT, { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } }, 8000);
      if (res.ok){
        const rows = await res.json();
        apply({ items: (rows || []).map(r => ({
          titulo: r.title,
          url: 'https://brusquediscover.com.br/noticia/' + r.slug,
          publicado_em: r.published_at
        })) });
        return;
      }
    } catch (_) {}
    try {
      const res = await fetchWithTimeout(NEWS_URL, { cache: 'no-store' }, 8000);
      if (!res.ok) throw new Error(res.status);
      apply(await res.json());
    } catch (e) {
      // mantém o último ticker; mostra o fallback se nunca carregou
      if (!$('ticker-track').dataset.loaded) renderTicker(null);
    }
  }

  /* ── OSINT Feed: boletins (caixa recolhível) ───────────── */
  function renderOsint(posts){
    $('osint-count').textContent = posts.length ? posts.length + ' boletins' : '';
    if (!posts.length){
      osintTrack.innerHTML = '<div class="bcard"><h3>Aguardando publicação</h3><p>O QG vai publicar aqui em breve.</p></div>';
      miniTrack.innerHTML = '<span class="mini-item">Sem boletins ainda</span>';
      return;
    }
    const card = p => '<article class="bcard">'
      + '<div class="bt-time"><span>' + timeHm(p.ts) + '</span><span class="ago">' + ago(p.ts) + '</span></div>'
      + '<h3>' + esc(p.titulo) + '</h3>'
      + '<p>' + esc(p.resumo) + '</p>'
      + (p.url ? '<a class="link" href="' + esc(p.url) + '" target="_blank" rel="noopener">'
          + esc(p.labelLink || 'Ver mais') + ' &nearr;</a>' : '')
      + '</article>';
    const mini = p => '<span class="mini-item">'
      + '<span class="mi-time">' + timeHm(p.ts) + '</span>' + esc(p.titulo) + '</span>';
    osintTrack.innerHTML = posts.map(card).join('') + posts.map(card).join('');
    miniTrack.innerHTML = posts.map(mini).join('') + posts.map(mini).join('');
  }

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
  loadNews();

  window.addEventListener('storage', () => { renderConfig(Store.getConfig()); refreshOsint(); });
  setInterval(() => { renderConfig(Store.getConfig()); refreshOsint(); }, 4000);
  setInterval(loadNews, NEWS_INTERVAL);
})();

// dashboard.js — Dashboard público (OSINT).
(function(){
  'use strict';
  Store.init();

  const NEWS_URL = '/api/news';
  const NEWS_INTERVAL = 60000; // monitora a cada 1 minuto

  const ALERT_LABEL = {
    normalidade: 'Normalidade',
    atencao: 'Atenção',
    emergencia: 'Emergência'
  };
  const COBERTURA_LABEL = {
    plantao: 'Estamos de plantão QG Discover',
    painel: 'Estamos ao vivo no painel de crise',
    live: 'Estamos em live (Instagram Discover)'
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
    $('cobertura-txt').textContent = COBERTURA_LABEL[cfg.statusCobertura] || cfg.statusCobertura;
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
    try {
      const res = await fetch(NEWS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const d = await res.json();
      renderTicker(d.items || []);
      $('statusbar').textContent = 'brusquediscover.com.br · atualizado ' + timeHm(Date.now()) + ' · minuto a minuto';
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

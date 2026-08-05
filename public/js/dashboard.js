// dashboard.js — Dashboard público (OSINT).
(function(){
  'use strict';
  Store.init();

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
  const feedList = $('feed-list');
  const track = $('ticker-track');
  const maxChars = 160;

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
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function renderConfig(cfg){
    document.body.setAttribute('data-alert', cfg.nivelAlerta || 'normalidade');
    const al = $('alerta-txt'), cb = $('cobertura-txt');
    al.textContent = ALERT_LABEL[cfg.nivelAlerta] || cfg.nivelAlerta;
    cb.textContent = COBERTURA_LABEL[cfg.statusCobertura] || cfg.statusCobertura;
    document.querySelector('#alerta').style.setProperty('--alert',
      getComputedStyle(document.body).getPropertyValue('--alert'));
  }

  function renderFeed(posts){
    if (!posts.length){
      feedList.innerHTML = '<div class="feed-empty">Sem boletins ainda. O QG vai publicar aqui em breve.</div>';
      return;
    }
    feedList.innerHTML = posts.map(p => {
      const link = p.url ? '<a class="link" href="' + esc(p.url) + '" target="_blank" rel="noopener">'
        + esc(p.labelLink || 'Ver mais') + ' &nearr;</a>' : '';
      return '<article class="osit">'
        + '<div class="ot"><span>' + timeHm(p.ts) + '</span><span class="ago">' + ago(p.ts) + '</span></div>'
        + '<h3>' + esc(p.titulo) + '</h3>'
        + '<p>' + esc(p.resumo) + '</p>'
        + link
        + '</article>';
    }).join('');
  }

  function renderTicker(posts){
    const last10 = posts.slice(0, 10);
    if (!last10.length){
      track.innerHTML = '<span class="tk-item">Aguardando publicação…</span>';
      return;
    }
    const item = p => '<span class="tk-item">'
      + '<span class="tk-time">' + timeHm(p.ts) + '</span>'
      + esc(p.titulo)
      + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(p.labelLink || 'Abrir link') + '">&#128279;</a>' : '')
      + '</span>';
    // duplica o track para o loop ser contínuo
    track.innerHTML = last10.map(item).join('') + last10.map(item).join('');
  }

  function refresh(){
    const cfg = Store.getConfig();
    const posts = Store.getPosts();
    renderConfig(cfg);
    renderFeed(posts);
    renderTicker(posts);
  }

  refresh();
  // atualiza quando o admin grava (mesma aba) ou quando outra aba/publicação muda
  window.addEventListener('storage', refresh);
  setInterval(refresh, 4000);
})();

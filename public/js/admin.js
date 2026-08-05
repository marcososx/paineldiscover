// admin.js — Painel administrativo (backoffice).
(function(){
  'use strict';
  Store.init();

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const msg = (type, text) => {
    const bar = $('msgbar');
    bar.className = 'msg-bar ' + type;
    bar.textContent = text;
    clearTimeout(bar._t);
    bar._t = setTimeout(() => { bar.className = 'msg-bar'; }, 5000);
  };
  const timeFull = ts => {
    const d = new Date(ts);
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + ' '
      + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  };

  let session = null;

  /* ── AUTH ─────────────────────────────────────────────── */
  function doLogin(email, senha){
    const u = Store.findByEmail(email);
    if (!u || u.senha !== senha) return false;
    session = { id: u.id, role: u.role, email: u.email, nome: u.nome || u.email };
    Store.setSession(session);
    return true;
  }
  function logout(){ Store.logout(); session = null; location.reload(); }

  function showPanel(){
    $('view-login').style.display = 'none';
    $('view-panel').classList.add('show');
    $('who-name').textContent = session.nome;
    // aba usuários só para master
    $('tab-usuarios').style.display = session.role === 'master' ? '' : 'none';
    loadBoletins();
    loadConfig();
    loadUsers();
    loadPerfil();
  }

  $('login-form').addEventListener('submit', e => {
    e.preventDefault();
    if (doLogin($('lg-email').value.trim(), $('lg-senha').value)){
      showPanel();
    } else {
      $('login-msg').style.display = 'block';
    }
  });
  $('btn-sair').addEventListener('click', logout);

  /* ── TABS ─────────────────────────────────────────────── */
  $('tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    if (btn.id === 'tab-usuarios' && session.role !== 'master') return;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('show'));
    $('tab-' + btn.dataset.tab).classList.add('show');
  });

  /* ── BOLETINS ─────────────────────────────────────────── */
  const pfTitulo = $('p-titulo'), pfResumo = $('p-resumo');
  pfTitulo.addEventListener('input', () => $('p-titulo-count').textContent = pfTitulo.value.length + '/30');
  pfResumo.addEventListener('input', () => $('p-resumo-count').textContent = pfResumo.value.length + '/160');

  $('post-form').addEventListener('submit', e => {
    e.preventDefault();
    const titulo = pfTitulo.value.trim();
    const resumo = pfResumo.value.trim();
    if (titulo.length > 30) return msg('err', 'Título deve ter no máximo 30 caracteres.');
    if (resumo.length > 160) return msg('err', 'Resumo deve ter no máximo 160 caracteres.');
    const url = $('p-link').value.trim();
    const labelLink = $('p-label').value.trim() || (url ? 'Ver mais' : '');
    Store.addPost({ titulo, resumo, url, labelLink });
    e.target.reset();
    $('p-titulo-count').textContent = '0/30';
    $('p-resumo-count').textContent = '0/160';
    msg('ok', 'Boletim publicado no painel público.');
    loadBoletins();
  });

  function loadBoletins(){
    const posts = Store.getPosts();
    const list = $('post-list');
    if (!posts.length){
      list.innerHTML = '<div class="hint" style="text-align:center;padding:20px">Nenhum boletim publicado.</div>';
      return;
    }
    list.innerHTML = posts.map(p => {
      const link = p.url ? '<a class="pi-link" href="' + esc(p.url) + '" target="_blank" rel="noopener">'
        + esc(p.labelLink || 'Ver mais') + ' &nearr;</a>' : '';
      return '<div class="post-item" data-id="' + p.id + '">'
        + '<div class="pi-main">'
        + '<div class="pi-time">' + timeFull(p.ts) + '</div>'
        + '<h4>' + esc(p.titulo) + '</h4>'
        + '<p>' + esc(p.resumo) + '</p>'
        + link
        + '</div>'
        + '<button class="pi-del" title="Excluir" data-del="' + p.id + '">&times;</button>'
        + '</div>';
    }).join('');
  }
  $('post-list').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    Store.removePost(del.dataset.del);
    loadBoletins();
    msg('ok', 'Boletim removido.');
  });

  /* ── CONFIGURAÇÕES ────────────────────────────────────── */
  function loadConfig(){
    const c = Store.getConfig();
    $('c-alerta').value = c.nivelAlerta;
    $('c-cobertura').value = c.statusCobertura;
    renderPreview();
  }
  function renderPreview(){
    const c = { nivelAlerta: $('c-alerta').value, statusCobertura: $('c-cobertura').value };
    const labels = { normalidade:'Normalidade', atencao:'Atenção', emergencia:'Emergência' };
    const cob = { plantao:'Estamos de plantão QG Discover', painel:'Estamos ao vivo no painel de crise',
                  live:'Estamos em live (Instagram Discover)' };
    $('pv-badge-txt').textContent = labels[c.nivelAlerta];
    $('pv-badge').style.setProperty('--alert', c.nivelAlerta === 'emergencia' ? 'var(--red)'
      : c.nivelAlerta === 'atencao' ? 'var(--amber)' : 'var(--green)');
    $('pv-txt').textContent = cob[c.statusCobertura];
  }
  $('c-alerta').addEventListener('change', renderPreview);
  $('c-cobertura').addEventListener('change', renderPreview);
  $('btn-save-config').addEventListener('click', () => {
    Store.setConfig({ nivelAlerta: $('c-alerta').value, statusCobertura: $('c-cobertura').value });
    msg('ok', 'Configurações salvas e aplicadas ao painel público.');
  });

  /* ── USUÁRIOS ─────────────────────────────────────────── */
  $('user-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('u-email').value.trim().toLowerCase();
    if (Store.findByEmail(email)) return msg('err', 'Já existe um usuário com esse e-mail.');
    Store.addUser({
      nome: $('u-nome').value.trim() || email,
      email,
      telefone: $('u-telefone').value.trim(),
      senha: $('u-senha').value || 'trocar123',
      role: 'operador'
    });
    e.target.reset();
    msg('ok', 'Usuário criado com efeito imediato.');
    loadUsers();
  });

  function loadUsers(){
    const users = Store.getUsers();
    $('user-list').innerHTML = users.map(u => {
      return '<div class="user-item" data-id="' + u.id + '">'
        + '<div class="ui-avatar">' + esc((u.nome || '?')[0].toUpperCase()) + '</div>'
        + '<div class="ui-info"><b>' + esc(u.nome) + '</b>'
        + '<span>' + esc(u.email) + (u.telefone ? ' · ' + esc(u.telefone) : '') + '</span></div>'
        + '<span class="ui-role">' + (u.role === 'master' ? 'Master' : 'Operador') + '</span>'
        + '<div class="ui-actions">'
        + (u.role !== 'master' ? '<button class="mini-btn" data-reset="' + u.id + '">Redefinir senha</button>'
          + '<button class="mini-btn danger" data-deluser="' + u.id + '">Excluir</button>' : '')
        + '</div></div>';
    }).join('');
  }
  $('user-list').addEventListener('click', e => {
    const reset = e.target.closest('[data-reset]');
    if (reset){
      const nova = prompt('Nova senha provisória para este operador:');
      if (nova !== null && nova !== ''){
        Store.updateUser(reset.dataset.reset, { senha: nova });
        loadUsers();
        msg('ok', 'Senha redefinida pelo Admin Master.');
      }
      return;
    }
    const del = e.target.closest('[data-deluser]');
    if (del && confirm('Excluir este usuário?')){
      Store.removeUser(del.dataset.deluser);
      loadUsers();
      msg('ok', 'Usuário excluído.');
    }
  });

  /* ── PERFIL ───────────────────────────────────────────── */
  function loadPerfil(){
    const u = Store.getUsers().find(x => x.id === session.id);
    if (!u) return;
    $('pf-email').value = u.email;
    $('pf-telefone').value = u.telefone || '';
  }
  $('btn-save-perfil').addEventListener('click', () => {
    const u = Store.getUsers().find(x => x.id === session.id);
    if (!u) return;
    const tel = $('pf-telefone').value.trim();
    const atual = $('pf-atual').value;
    const nova = $('pf-nova').value;
    if (!tel) return msg('err', 'O campo Telefone é obrigatório (notificações).');
    if (nova && atual !== u.senha) return msg('err', 'Senha atual incorreta.');
    const patch = { telefone: tel };
    if (nova) patch.senha = nova;
    Store.updateUser(u.id, patch);
    $('pf-atual').value = ''; $('pf-nova').value = '';
    msg('ok', 'Perfil atualizado.');
  });

  /* ── INIT ─────────────────────────────────────────────── */
  session = Store.getSession();
  if (session && Store.getUsers().some(u => u.id === session.id)){
    showPanel();
  }
})();

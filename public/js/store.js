// store.js — Camada de dados do Painel de Crise Brusque Discover.
//
// ATENÇÃO: hoje usa localStorage (funciona standalone, admin <-> dashboard na
// mesma origem). Quando for conectar com um domínio/API real, basta trocar as
// funções internas por fetch() para o seu Worker/back-end — a assinatura fica
// a mesma para as páginas (dashboard.js e admin.js não mudam).

const Store = (() => {
  const K = {
    posts: 'pd_posts',
    config: 'pd_config',
    users: 'pd_users',
    session: 'pd_session',
  };
  const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const seed = () => {
    if (!localStorage.getItem(K.users)) {
      write(K.users, [
        { id: 'u_master', nome: 'Admin Master', email: 'admin@brusquediscover.com.br',
          telefone: '', senha: 'admin123', role: 'master' }
      ]);
    }
    if (!localStorage.getItem(K.posts)) write(K.posts, []);
    if (!localStorage.getItem(K.config)) {
      write(K.config, { nivelAlerta: 'normalidade', statusCobertura: 'plantao' });
    }
  };

  return {
    init() { seed(); },

    // ── Boletins / posts ──────────────────────────────────────────────
    getPosts() { return read(K.posts, []); },
    addPost(p) {
      const ps = read(K.posts, []);
      ps.unshift({ id: 'p_' + Date.now(), ts: Date.now(), ...p });
      write(K.posts, ps);
      return ps[0];
    },
    removePost(id) { write(K.posts, read(K.posts, []).filter(p => p.id !== id)); },

    // ── Configurações globais ─────────────────────────────────────────
    getConfig() { return read(K.config, { nivelAlerta: 'normalidade', statusCobertura: 'plantao' }); },
    setConfig(c) { write(K.config, c); },

    // ── Usuários ──────────────────────────────────────────────────────
    getUsers() { return read(K.users, []); },
    addUser(u) { const us = read(K.users, []); us.push({ id: 'u_' + Date.now(), ...u }); write(K.users, us); },
    updateUser(id, patch) {
      write(K.users, read(K.users, []).map(u => u.id === id ? { ...u, ...patch } : u));
    },
    removeUser(id) { write(K.users, read(K.users, []).filter(u => u.id !== id)); },
    findByEmail(email) { return read(K.users, []).find(u => u.email === email); },

    // ── Sessão ────────────────────────────────────────────────────────
    getSession() { return read(K.session, null); },
    setSession(s) { write(K.session, s); },
    logout() { localStorage.removeItem(K.session); }
  };
})();

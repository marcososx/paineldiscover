# Painel de Crise — Brusque Discover

Ferramenta estratégica de gestão de comunicação e monitoramento em situações de
emergência em Brusque/SC. Dividida em duas visões:

1. **Dashboard / Front-End** (`/`) — visualizador público/operacional com tema
   dark (estilo OSINT / Pizza Index), feed de boletins, ticker de notícias,
   status do plantão e mapa de crise incorporado.
2. **Backoffice / Admin** (`/admin.html`) — alimentação rápida de boletins,
   definição de nível de alerta e status de cobertura, gestão de usuários e
   alteração de senha.

## Estrutura

```
public/
  index.html       → Dashboard público (raiz)
  admin.html       → Painel administrativo
  css/shared.css   → tema dark + componentes comuns
  css/dashboard.css
  css/admin.css
  js/store.js      → camada de dados (localStorage agora; pronta p/ trocar por API)
  js/dashboard.js
  js/admin.js
wrangler.jsonc     → deploy em Cloudflare Workers (assets estáticos)
```

## Execução local

Basta servir a pasta `public/` com qualquer servidor estático:

```bash
npx serve public        # ou: python3 -m http.server -d public
```

Acesse `/` (painel público) e `/admin.html` (admin).

## Acesso inicial (admin)

| E-mail | Senha |
|---|---|
| `admin@brusquediscover.com.br` | `admin123` |

> Troque a senha do Admin Master no primeiro acesso (aba **Perfil**).

## Camada de dados

Hoje o `store.js` usa `localStorage`, então admin e dashboard conversam na mesma
origem sem backend. Quando o painel for conectado a um domínio/API real, basta
trocar as funções internas do `store.js` por `fetch()` para o Worker/back-end —
a assinatura é a mesma e as páginas não precisam mudar.

## Deploy

```bash
npx wrangler deploy
```

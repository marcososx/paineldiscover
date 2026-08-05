# Painel de Crise — Brusque Discover

Ferramenta estratégica de gestão de comunicação e monitoramento em situações de
emergência em Brusque/SC. Dividida em duas visões:

1. **Dashboard / Front-End** (`/`) — visualizador público/operacional com tema
   dark (estilo OSINT / Pizza Index): ticker com as **últimas 10 notícias do
   Brusque Discover** (atualizadas a cada minuto), **feed OSINT horizontal**
   sobreposto ao mapa com os boletins do QG, status do plantão e nível de alerta.
2. **Backoffice / Admin** (`/admin`) — alimentação rápida de boletins,
   definição de nível de alerta e status de cobertura, gestão de usuários e
   alteração de senha.

## Estrutura

```
src/index.js       → Worker (assets + endpoint /api/news das notícias)
public/
  index.html       → Dashboard público (raiz)
  admin/           → Painel administrativo
  img/logo.png     → logo do Brusque Discover
  css/shared.css   → tema dark + componentes comuns
  css/dashboard.css
  css/admin.css
  js/store.js      → camada de dados (localStorage agora; pronta p/ trocar por API)
  js/dashboard.js
  js/admin.js
wrangler.jsonc     → deploy em Cloudflare Workers (assets estáticos + worker)
```

## Notícias do Brusque Discover

O ticker do dashboard busca em `GET /api/news` (no próprio Worker) as **10
últimas notícias** publicadas no site, via API REST do Supabase do
Brusque Discover. O dashboard consulta a cada **1 minuto**.

## Execução local

Basta servir a pasta `public/` com qualquer servidor estático:

```bash
npx serve public        # ou: python3 -m http.server -d public
```

Acesse `/` (painel público) e `/admin` (admin).

## Acesso inicial (super admin)

| Login | Senha |
|---|---|
| `marcososx` | `depoisamanha` |

> Troque a senha no primeiro acesso (aba **Perfil**). O login aceita o usuário
> ou o e-mail do operador.

## Camada de dados

Hoje o `store.js` usa `localStorage`, então admin e dashboard conversam na mesma
origem sem backend. Quando o painel for conectado a um domínio/API real, basta
trocar as funções internas do `store.js` por `fetch()` para o Worker/back-end —
a assinatura é a mesma e as páginas não precisam mudar.

## Deploy

```bash
npx wrangler deploy
```

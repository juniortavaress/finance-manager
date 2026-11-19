# Atmos — Gestão Financeira

App pessoal de gestão financeira: contas em múltiplos bancos, cartões de crédito com faturas e parcelamentos, débitos automáticos, categorias, investimentos e relatórios.

- **Frontend**: React + Vite, deploy no Vercel — [frontend/README.md](frontend/README.md)
- **Backend**: Flask + SQLAlchemy + Alembic — [backend/README.md](backend/README.md)
- **Banco**: Postgres — local na máquina para desenvolvimento, [Supabase](https://supabase.com) em produção
- **Schema**: ver [schema-banco-dados (1).md](<schema-banco-dados (1).md>) para o modelo relacional completo
- **Mock visual original**: [financas (5).html](<financas (5).html>) — identidade visual seguida pelo frontend (Fraunces + IBM Plex, paleta teal/gold/brick)

## Rodando localmente

1. **Backend** — siga [backend/README.md](backend/README.md): crie o venv, configure `.env`, rode as migrations e o seed.
2. **Frontend** — siga [frontend/README.md](frontend/README.md): `npm install`, configure `.env`, `npm run dev`.
3. Acesse `http://localhost:5173` e entre com:
   ```
   email: junior@gmail.com
   senha: 123456
   ```

## App instalável (PWA)

O frontend é um PWA: `manifest.webmanifest` + `sw.js` + ícones em `frontend/public`. Em produção (HTTPS) o navegador oferece **Instalar aplicativo** (Chrome/Edge/Android) ou **Compartilhar → Adicionar à Tela de Início** (iPhone); também há o botão em *Configurações → Aplicativo*. O service worker só guarda o shell e os arquivos estáticos — dados da API nunca ficam em cache offline.

## Backups

`backups/` (ignorada pelo git) guarda cópias locais do banco de produção em JSON, uma por tabela (`prod-completo-AAAA-MM-DD.json`).

## Deploy

- **Frontend** → Vercel (root directory `frontend/`).
- **Backend** → qualquer host que rode Flask/WSGI (Render, Railway, Fly.io etc.), apontando `DATABASE_URL` para o Postgres do Supabase.
- **Banco** → Supabase (Postgres gerenciado). **Rode `flask db upgrade` no banco de produção ANTES de subir o backend novo** — há migrations que criam tabelas usadas pelo código (`stock_price_monthly`, `computed_cache`).

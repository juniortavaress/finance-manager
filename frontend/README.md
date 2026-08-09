# Atmos — Frontend (React + Vite)

Interface do app de gestão financeira Atmos, seguindo a identidade visual do mock original (Fraunces + IBM Plex Sans/Mono, paleta teal/gold/brick).

## Setup local

```bash
cd frontend
npm install
copy .env.example .env      # ajuste VITE_API_URL se necessario
npm run dev
```

Abre em `http://localhost:5173`. Certifique-se que o backend está rodando em `http://localhost:5000` (ou ajuste `VITE_API_URL`).

## Login de demonstração

```
email: junior@gmail.com
senha: 123456
```

## Estrutura

```
src/
  api/            client HTTP (fetch + JWT) e funcoes por recurso REST
  context/        AuthContext (sessao) e DataContext (bancos/contas/categorias/cartoes)
  components/     Sidebar, layout, modais (nova transacao, debito automatico, etc.)
  pages/          uma pagina por tela (Dashboard, Contas, Transacoes, Parcelas, Cartoes, Categorias, Investimentos, Relatorios, Config)
  styles/         CSS portado do mock original, dividido por area (layout, cards, listas, modal, login)
  hooks/          useFetch (fetch + loading + error)
  utils/          formatacao de moeda e datas
```

## Build de produção

```bash
npm run build
```

Gera a pasta `dist/`.

## Deploy no Vercel

1. Importe o repositório no Vercel, selecionando a pasta `frontend` como *Root Directory*.
2. Framework preset: **Vite**.
3. Configure a variável de ambiente `VITE_API_URL` apontando para a URL pública do backend Flask.
4. O arquivo `vercel.json` já cuida do rewrite de rotas para SPA (React Router).

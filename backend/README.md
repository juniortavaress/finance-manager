# Atmos — Backend (Flask)

API REST em Flask + SQLAlchemy + Alembic, para o app de gestão financeira Atmos. Local usa Postgres (na máquina), produção usa o Postgres do Supabase.

## Setup local

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

pip install -r requirements.txt
copy .env.example .env         # ajuste DATABASE_URL, JWT_SECRET etc.
```

Preencha `.env` com a connection string do seu Postgres local, por exemplo:

```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/cofre
```

Crie o banco (se ainda não existir):

```bash
psql -U postgres -c "CREATE DATABASE cofre;"
```

Rode as migrations:

```bash
flask db upgrade
```

Popule o usuário de demonstração (`junior@gmail.com` / senha `123456`) e categorias padrão:

```bash
flask seed
```

Suba o servidor:

```bash
python wsgi.py
# ou: flask run
```

A API sobe em `http://localhost:5000/api`.

## Estrutura

```
app/
  models/        modelos SQLAlchemy (um arquivo por dominio, espelham schema-banco-dados.md)
  routes/        blueprints Flask (um arquivo por recurso REST)
  services/      regras de negocio (calculo de saldo, faturas, autenticacao)
  auth_decorator.py  decorator @login_required (valida JWT)
  seed.py        popula usuario de demo + dados de exemplo
  cli.py         comando `flask seed`
migrations/      Alembic (Flask-Migrate)
wsgi.py          entrypoint da aplicacao
```

## Autenticação

Login real com bcrypt + JWT (`POST /api/auth/login`). Todas as rotas de dados exigem header:

```
Authorization: Bearer <token>
```

## Deploy em produção (Supabase)

1. Crie um projeto no [Supabase](https://supabase.com).
2. Em **Project Settings → Database → Connection string**, copie a URI (modo *Transaction*, porta 6543 é recomendado para apps serverless; porta 5432 para conexão direta).
3. Configure `DATABASE_URL` no seu provedor de hosting (Render, Railway, Fly.io etc.) com o prefixo `postgresql+psycopg://` e a senha do banco.
4. Rode `flask db upgrade` apontando para o Supabase (uma vez, via CI/CD ou manualmente) para criar as tabelas.
5. Rode `flask seed` uma vez, se quiser o usuário de demonstração também em produção.
6. Configure `CORS_ORIGINS` com a URL do frontend publicado no Vercel.

## Comandos úteis

```bash
flask db migrate -m "descricao"   # gera nova migration a partir dos models
flask db upgrade                  # aplica migrations pendentes
flask seed                        # popula dados de demonstracao
```

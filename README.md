# Studio de Imagens

MVP local para gerar imagens de campanha com uma foto de modelo, até cinco fotos de produtos e desdobramentos por formato usando uma camada de providers de IA.

## Stack

- React + Vite no frontend
- Node + Express no backend
- PostgreSQL local para usuários, projetos, assets, jobs, presets e histórico
- Storage local em `storage/uploads` e `storage/generated`
- Provider mock por padrão e provider Gemini/Nano Banana configurável

## Setup local

Use Node 22. Se usar `nvm`:

```bash
nvm use
```

1. Instale dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo `.env`:

   ```bash
   cp .env.example .env
   ```

3. Crie o banco PostgreSQL local informado em `DATABASE_URL`.

4. Rode as migrações:

   ```bash
   npm run db:migrate
   ```

5. Suba o app:

   ```bash
   npm run dev
   ```

Frontend: `http://localhost:5173`

API: `http://localhost:4000`

## Docker

Para subir uma stack local completa com PostgreSQL, API e frontend:

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

URLs:

- Frontend: `http://localhost:8080`
- API direta: `http://localhost:4001`
- API via frontend/Nginx: `http://localhost:8080/api`
- PostgreSQL: `localhost:5433`

Os dados do banco ficam no volume `postgres_data`.

Os uploads e imagens geradas ficam no volume `app_storage`, montado em `/app/storage` no container da API.

Em produção, altere pelo menos:

- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `CLIENT_URL`
- `VITE_API_URL`, se o frontend precisar chamar uma API fora do Nginx
- `AI_PROVIDER`
- `GEMINI_API_KEY`, se usar Gemini

## IA

Por padrão, `AI_PROVIDER=mock`. Esse modo gera arquivos SVG locais e permite validar login, upload, jobs, histórico e desdobramentos sem custo de API.

Para usar Gemini/Nano Banana:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua-chave
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
```

A implementação real fica isolada em `server/src/providers/geminiProvider.js`, então novos modelos podem ser adicionados implementando a mesma interface. Para o Nano Banana 2, o modelo configurado é `gemini-3.1-flash-image-preview`.

## Fluxo do MVP

1. Criar conta ou entrar.
2. Criar um projeto.
3. Enviar uma imagem do modelo e de 1 a 5 imagens de produtos.
4. Preencher os campos guiados de prompt.
5. Gerar a imagem principal.
6. Selecionar presets e criar desdobramentos por IA.
7. Baixar cada resultado gerado.

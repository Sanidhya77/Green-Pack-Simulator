# Green-Pack-Simulator

Web-based sustainable packaging choice simulator with:
- React study frontend (`client/`)
- Node + SQLite logging backend (`server/`)
- Server-side AI trade-off explanation endpoint (ChatGPT key first)

## Study flow implemented
1. Consent + intro
2. Baseline question
3. Part A (10 trials, with AI explanation)
4. Final summary of choice focus patterns

Each trial logs:
- selected product option
- reason
- confidence
- optional reflection
- AI explanation metadata (when shown)

## Run locally

### 1) Start backend
```bash
cd server
npm install
```

Create `server/.env`:
```env
PORT=4000
OPENAI_API_KEY=your_chatgpt_api_key_here
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
FRONTEND_ORIGIN=http://localhost:5173
```

Run:
```bash
npm run dev
```

### 2) Start frontend
```bash
cd client
npm install
npm run dev
```

Frontend expects backend at `http://localhost:4000`.
Override with `VITE_API_BASE_URL` if needed.

## Data storage
- SQLite file: `server/data/study.sqlite`
- Schema: `server/src/db/schema.sql`

## Deploy (Option A: Vercel + hosted backend)

Use this for production study runs:

1. Deploy `client/` to Vercel
2. Deploy `server/` to a Node host (Render/Railway/Fly)
3. Set backend environment variables:
   - `OPENAI_API_KEY`
   - `AI_PROVIDER`
   - `AI_MODEL`
   - `FRONTEND_ORIGIN` = your Vercel site URL
4. Set frontend environment variable:
   - `VITE_API_BASE_URL` = your backend URL

Do not host the current SQLite-backed backend on Vercel serverless directly.

## Image sourcing recommendations for trial consistency
Use one fixed image per product category and keep visuals constant across option variants.

Recommended process:
1. Curate 10-12 product photos from licensed stock or open datasets.
2. Normalize all images to same ratio (e.g. 4:3), neutral background, similar lighting.
3. Avoid visible brand/eco claims in the base photo.
4. Store in `client/public/assets/products/`.
5. Map image IDs in trial definitions so only packaging/price/label attributes vary.

This prevents visual bias from unrelated image differences.
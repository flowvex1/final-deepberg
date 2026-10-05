# Deepberg

Deepberg is a market-intelligence dashboard that combines a depth-themed
landing experience with live stocks, options flow, volatility, news, signals,
AI analysis, watchlists, and browser-local paper trading.

> Deepberg is an educational project, not financial advice. Market data may be
> delayed or incomplete. Never make investment decisions from this app alone.

## Stack

- React 19, Vite, Tailwind CSS, TanStack Query, Recharts
- Express 5, TypeScript, Pino
- Yahoo Finance market data
- PostgreSQL and Drizzle ORM for shared options-flow history
- Optional OpenAI-compatible provider for AI features

## Local setup

Requirements: Node.js 22+, pnpm 11+, PostgreSQL 16+, and optionally Ollama.

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

The local launcher uses `http://localhost:5174` for the app and
`http://localhost:8081` for the API. Edit `start-local.sh` or export environment
variables if your PostgreSQL connection differs.

For local Ollama:

```bash
ollama pull qwen2.5:14b-instruct
ollama serve
```

Set `AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:11434/v1`,
`AI_INTEGRATIONS_OPENAI_API_KEY=ollama`, and
`AI_MODEL=qwen2.5:14b-instruct`. AI credentials are optional; the rest of the
app remains available without them.

## Quality checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Railway

1. Push this repository to GitHub.
2. Create a Railway project from the repository.
3. Add PostgreSQL and expose `DATABASE_URL` to the service.
4. Set `APP_ORIGIN` to the Railway public URL.
5. Optionally set the AI and Finnhub variables from `.env.example`.
6. Deploy. `railway.json` runs migrations and starts the single Express service,
   which serves both `/api/*` and the built SPA.

Watchlists and paper portfolios are stored in each visitor's browser for the
public demo. Discord webhook administration is intentionally unavailable.

## Repository layout

- `artifacts/stock-analyzer` — Deepberg React application
- `artifacts/api-server` — Express API and production static host
- `lib/api-client-react` / `lib/api-zod` — generated API clients and schemas
- `lib/db` — Drizzle schema and migrations

## License

MIT

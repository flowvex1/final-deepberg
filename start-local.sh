#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Deepberg — local launcher (landing + app)
# Starts the backend API + the React frontend together.
# Stop everything with Ctrl+C.
# ─────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

# Make sure Postgres@16 + pnpm are on PATH
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# ---- shared config ----
export NODE_ENV=development
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/deepberg"
export AI_INTEGRATIONS_OPENAI_BASE_URL="http://localhost:11434/v1"   # local Ollama
export AI_INTEGRATIONS_OPENAI_API_KEY="ollama"                      # any non-empty string
export LOG_LEVEL=info

BACKEND_PORT=8081
FRONTEND_PORT=5174

echo "▶ Starting backend (API) on http://localhost:$BACKEND_PORT ..."
( PORT=$BACKEND_PORT pnpm --filter @workspace/api-server run dev ) &
BACKEND_PID=$!

# stop the backend if this script is interrupted
trap "echo; echo '⏹  Shutting down...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT TERM

echo "⏳ Waiting for backend to come up..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/healthz" >/dev/null 2>&1; then
    echo "✅ Backend is up."
    break
  fi
  sleep 1
done

echo "▶ Starting frontend on http://localhost:$FRONTEND_PORT ..."
echo "──────────────────────────────────────────────"
echo "  Open in your browser:  http://localhost:$FRONTEND_PORT"
echo "──────────────────────────────────────────────"
PORT=$FRONTEND_PORT BASE_PATH="/" API_PROXY_TARGET="http://localhost:$BACKEND_PORT" \
  pnpm --filter @workspace/stock-analyzer run dev

# if frontend exits, clean up backend too
kill $BACKEND_PID 2>/dev/null || true

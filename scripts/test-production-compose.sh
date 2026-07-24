#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="tablecanvas-smoke-$RANDOM"
ACCESS_SECRET="$(openssl rand -hex 32)"
REFRESH_SECRET="$(openssl rand -hex 32)"

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes --remove-orphans
}
trap cleanup EXIT

export JWT_ACCESS_SECRET="$ACCESS_SECRET"
export JWT_REFRESH_SECRET="$REFRESH_SECRET"
export FRONTEND_URL="https://app.example.test"
export BACKEND_PORT=13001
export FRONTEND_PORT=18080

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" config --quiet
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up --build --detach --wait

curl --fail --silent --show-error "http://localhost:$BACKEND_PORT/api/health" > /dev/null
curl --fail --silent --show-error "http://localhost:$BACKEND_PORT/api/ready" > /dev/null
curl --fail --silent --show-error "http://localhost:$FRONTEND_PORT/" > /dev/null
curl --fail --silent --show-error "http://localhost:$FRONTEND_PORT/api/ready" > /dev/null

headers="$(curl --fail --silent --show-error --head "http://localhost:$FRONTEND_PORT/duckdb/duckdb-mvp.wasm")"
grep -qi '^content-type: application/wasm' <<< "$headers"
grep -qi '^cross-origin-opener-policy: same-origin-allow-popups' <<< "$headers"
grep -qi '^cache-control: public, max-age=3600, must-revalidate' <<< "$headers"

cors_headers="$(curl --fail --silent --show-error --head \
  -H 'Origin: https://app.example.test' \
  "http://localhost:$BACKEND_PORT/api/health")"
grep -qi '^access-control-allow-origin: https://app.example.test' <<< "$cors_headers"

echo "Production Compose smoke test passed."

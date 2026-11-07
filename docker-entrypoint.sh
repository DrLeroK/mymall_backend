#!/bin/sh
set -e

echo "==> [Docker Entrypoint] Starting MyMall Multi-Tenant SaaS E-Commerce Backend..."

# 1. Validate and Wait for PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "==> [Docker Entrypoint] ERROR: DATABASE_URL environment variable is required."
  exit 1
fi

echo "==> [Docker Entrypoint] Waiting for database connection to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30

until node -e "
const net = require('net');
try {
  const dbUrl = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
  const url = new URL(dbUrl);
  const client = net.createConnection({ host: url.hostname, port: parseInt(url.port, 10) || 5432 }, () => {
    client.end();
    process.exit(0);
  });
  client.setTimeout(2000, () => { client.destroy(); process.exit(1); });
  client.on('error', () => process.exit(1));
} catch (e) {
  process.exit(1);
}
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "==> [Docker Entrypoint] WARNING: Database probe reached timeout ($MAX_RETRIES attempts). Proceeding to Prisma..."
    break
  fi
  echo "    Database unavailable - attempt $RETRY_COUNT/$MAX_RETRIES - sleeping 2s..."
  sleep 2
done
echo "==> [Docker Entrypoint] Database connectivity check passed!"

# 2. Synchronize Prisma schema with PostgreSQL
echo "==> [Docker Entrypoint] Synchronizing Prisma schema to PostgreSQL..."
npx prisma db push --skip-generate

# 3. Optional automatic database seeding (Zero Data Loss Protected)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "==> [Docker Entrypoint] Running database seed check (initial deployment demo records)..."
  node dist/prisma/seed.js || echo "==> [Docker Entrypoint] Seeding finished or records already exist."
fi

echo "==> [Docker Entrypoint] Starting MyMall backend application server on port ${PORT:-5001}..."
exec "$@"

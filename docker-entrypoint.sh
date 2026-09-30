#!/bin/sh
set -e

echo "==> [Docker Entrypoint] Starting MyMall Multi-Tenant E-Commerce Backend..."

# 1. Validate and Wait for PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "==> [Docker Entrypoint] ERROR: DATABASE_URL environment variable is required."
  exit 1
fi

echo "==> [Docker Entrypoint] Waiting for database connection to be ready..."
until node -e "
const net = require('net');
const url = new URL(process.env.DATABASE_URL);
const client = net.createConnection({ host: url.hostname, port: url.port || 5432 }, () => {
  client.end();
  process.exit(0);
});
client.on('error', () => process.exit(1));
" 2>/dev/null; do
  echo "    Database is unavailable - sleeping 2s..."
  sleep 2
done
echo "==> [Docker Entrypoint] Database is connected and ready!"

# 2. Synchronize Prisma schema with PostgreSQL
echo "==> [Docker Entrypoint] Synchronizing Prisma schema to PostgreSQL..."
npx prisma db push --skip-generate

# 3. Optional automatic database seeding
if [ "$SEED_DATABASE" = "true" ]; then
  echo "==> [Docker Entrypoint] Running database seed (stores, plans, admin accounts)..."
  npx tsx prisma/seed.ts || echo "==> [Docker Entrypoint] Seeding finished or records already exist."
fi

# 4. Ensure upload directories exist
mkdir -p uploads/screenshots uploads/products uploads/branding

echo "==> [Docker Entrypoint] Starting MyMall application server..."
exec "$@"

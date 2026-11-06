# ==============================================================================
# Base Stage: Shared dependencies & OpenSSL for Debian Bookworm
# ==============================================================================
FROM node:22-slim AS base

WORKDIR /app

# Install OpenSSL and ca-certificates required by Prisma and PostgreSQL
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Stage 1: Build & Compilation Stage
# ==============================================================================
FROM base AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies (clean install from package-lock.json)
RUN npm ci

# Copy Prisma schema and generate Prisma Client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and TypeScript configuration
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to JavaScript (into /app/dist)
RUN npm run build

# ==============================================================================
# Stage 2: Production Runtime Stage
# ==============================================================================
FROM base AS runner

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Copy complete node_modules (including Prisma client & CLI tools) from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript output
COPY --from=builder /app/dist ./dist

# Copy Prisma schema and seed script
COPY prisma ./prisma

# Ensure static uploads directories exist
RUN mkdir -p /app/uploads/screenshots /app/uploads/avatars /app/uploads/products /app/uploads/branding /app/uploads/receipts /app/uploads/general

# Copy startup entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5001

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]

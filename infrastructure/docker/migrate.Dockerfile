# One-shot job: apply migrations and the reference seed (idempotent). Never loads demo data.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile --filter @tanda/database...
COPY packages packages
RUN pnpm --filter @tanda/shared build && pnpm --filter @tanda/database generate
WORKDIR /repo/packages/database
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

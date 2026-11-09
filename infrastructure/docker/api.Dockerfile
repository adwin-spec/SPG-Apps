# syntax=docker/dockerfile:1.7
# API + worker image (same image, different command). Multi-stage, non-root runtime.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @tanda/api... --filter @tanda/database...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @tanda/shared build && pnpm --filter @tanda/database generate && pnpm --filter @tanda/api build \
 && pnpm deploy --filter @tanda/api --prod --legacy /out \
 && cp -r packages/database/generated /out/node_modules/@tanda/database/generated \
 && cp -r packages/database/prisma /out/prisma

FROM base AS runtime
ENV NODE_ENV=production TZ=UTC
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /out/prisma ./prisma
RUN useradd --system --uid 10001 app && mkdir -p /app/storage && chown app /app/storage
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

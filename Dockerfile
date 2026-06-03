# Hiive backend — one image used for CI (tests + migrations) AND runtime.
# Cloud Build / Cloud Run override the container args:
#   run start:prod        → boot the API           (deploy)
#   run test:ci           → migrate + jest          (CI)
#   run prisma:migrate:ci → prisma migrate deploy    (release migrations)
FROM node:20-bookworm-slim

# Prisma needs OpenSSL at build (engine) and runtime.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install ALL deps (incl. dev: nest CLI, jest, prisma) — the image also runs CI.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then compile the Nest app.
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

ENV NODE_ENV=production

# `npm` entrypoint so callers pass `run <script>` (Cloud Run --args, CI steps).
ENTRYPOINT ["npm"]
CMD ["run", "start:prod"]

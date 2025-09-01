# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine AS build-base

# Toolchain and headers for building native modules (build only)
RUN apk add --no-cache \
  libc6-compat \
  python3 make g++ pkgconfig \
  pixman-dev cairo-dev jpeg-dev giflib-dev librsvg-dev pango-dev

# Set Python path for node-gyp and create symlink
ENV PYTHON=/usr/bin/python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Runtime-only base (no compilers, only shared libs)
FROM node:20-alpine AS runtime-base
RUN apk add --no-cache \
  libc6-compat \
  pixman cairo jpeg giflib librsvg pango \
  ffmpeg

# Install dependencies only when needed
FROM build-base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Generate Prisma client (separate stage for better caching)
FROM deps AS prisma-builder
WORKDIR /app
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# Rebuild the source code only when needed
FROM build-base AS builder
WORKDIR /app

# Accept build arguments for environment variables needed during build
ARG DATABASE_URL
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL

# Set environment variables for the build process
ENV DATABASE_URL=$DATABASE_URL
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL

COPY --from=deps /app/node_modules ./node_modules

# Copy minimal files first to leverage caching of Prisma generate
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# Copy project files
COPY package.json package-lock.json* ./

# Copy source code in layers for better caching
COPY tsconfig.json ./
COPY next.config.js ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY components.json ./

# Copy source directories
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY scripts ./scripts
COPY types ./types
COPY hooks ./hooks
COPY contexts ./contexts
COPY i18n ./i18n
COPY messages ./messages
COPY prisma ./prisma

# Copy public assets
COPY public ./public
COPY app-logo.png ./

# Build the application
RUN npm run build

# Development stage
FROM build-base AS dev
WORKDIR /app

# Install all dependencies for development
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci

# Copy source code including scripts with correct ownership
COPY --chown=node:node . .

# Generate Prisma client for development
RUN npx prisma generate

USER node

EXPOSE 3000

# Use development server
CMD ["npm", "run", "dev"]

# Production app image (Next.js standalone, no compilers)
FROM runtime-base AS runner-app
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

USER node

# Copy only the Next.js standalone output and public assets
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]

# Production worker image (with prod node_modules and prisma client)
FROM build-base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM runtime-base AS runner-worker
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy generated Prisma client from builder (ensures correct engines are present)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy runtime files needed by workers
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER node

# Production migration runner (includes dev deps for prisma CLI only)
FROM runtime-base AS runner-migrate
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Bring in dev dependencies so prisma CLI is available
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy schema and package for potential prisma resolution
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

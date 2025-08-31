# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine AS base

# Install system dependencies needed for native modules
RUN apk add --no-cache libc6-compat python3 make g++ pkgconfig pixman-dev cairo-dev jpeg-dev giflib-dev librsvg-dev pango-dev

# Set Python path for node-gyp and create symlink
ENV PYTHON=/usr/bin/python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install dependencies only when needed
FROM base AS deps
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
FROM base AS builder
WORKDIR /app

# Accept build arguments for environment variables needed during build
ARG DATABASE_URL
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL

# Set environment variables for the build process
ENV DATABASE_URL=$DATABASE_URL
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy Prisma generated files from prisma-builder stage
COPY --from=prisma-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-builder /app/node_modules/@prisma ./node_modules/@prisma

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
FROM base AS dev
WORKDIR /app

# Install all dependencies for development
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code including scripts
COPY . .

# Generate Prisma client for development
RUN npx prisma generate

# Create non-root user for development
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Use development server
CMD ["npm", "run", "dev"]

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy Prisma generated client and schema
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy the built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy runtime files needed for workers
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Fix ownership of all files to nextjs user
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]

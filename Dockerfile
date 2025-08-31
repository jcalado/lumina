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

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

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

# Copy the built application
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]

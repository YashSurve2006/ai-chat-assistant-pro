# ══════════════════════════════════════════════════════════
# Dockerfile — AI Chat Assistant Pro
# Multi-stage build for minimal production image
# ══════════════════════════════════════════════════════════

# ── Stage 1: Builder ────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (cache layer optimization)
COPY package*.json ./

# Install ALL deps (including devDeps for any build steps)
RUN npm ci --include=dev

# Copy source
COPY . .

# ── Stage 2: Production ──────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production deps
RUN npm ci --omit=dev && npm cache clean --force

# Copy source from builder
COPY --from=builder --chown=nodeuser:nodejs /app .

# Create necessary directories
RUN mkdir -p logs uploads && \
    chown -R nodeuser:nodejs logs uploads

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Start server
CMD ["node", "server.js"]

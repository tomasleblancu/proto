FROM node:22-slim

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends curl git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code tsx

# Create data directories
RUN mkdir -p /data/sessions /data/claude /data/claude-config

WORKDIR /app

# Install dependencies — copy package.json files first for cache
COPY package.json .
COPY web/package.json web/
RUN npm install --ignore-scripts

# Copy source
COPY . .

# Frontend env vars (baked into Vite bundle at build time)
# VITE_GATEWAY_URL: omit for all-in-one deploy (frontend auto-detects same origin)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GATEWAY_URL=""
ARG VITE_INTERNAL_SECRET=""
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_GATEWAY_URL=${VITE_GATEWAY_URL}
ENV VITE_INTERNAL_SECRET=${VITE_INTERNAL_SECRET}

# Build frontend
RUN cd web && npx vite build

ENV DATA_DIR=/data
ENV CLAUDE_CONFIG_DIR=/data/claude
ENV HOME=/data
ENV PROTO_APP_ROOT=/app

EXPOSE ${PORT:-8092}

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]

FROM node:22-slim

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends curl git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code tsx

# Create data directories
RUN mkdir -p /data/sessions /data/claude /data/claude-config

WORKDIR /app

# Install dependencies
COPY package.json .
COPY packages/core-shared/package.json packages/core-shared/
COPY packages/core-mcp/package.json packages/core-mcp/
COPY packages/core-gateway/package.json packages/core-gateway/
COPY examples/hermes/package.json examples/hermes/
RUN npm install --ignore-scripts

# Copy source
COPY tsconfig.json .
COPY packages/core-shared/ packages/core-shared/
COPY packages/core-mcp/ packages/core-mcp/
COPY packages/core-gateway/ packages/core-gateway/
COPY examples/hermes/ examples/hermes/

ENV DATA_DIR=/data
ENV CLAUDE_CONFIG_DIR=/data/claude
ENV HOME=/data
ENV PROTO_APP_ROOT=/app/examples/hermes

EXPOSE ${PORT:-8090}

# Entrypoint: login to Claude if needed, then start gateway
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]

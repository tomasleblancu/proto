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
COPY packages/shared/package.json packages/shared/
COPY packages/mcp/package.json packages/mcp/
COPY packages/gateway/package.json packages/gateway/
RUN npm install --ignore-scripts

# Copy source
COPY tsconfig.json .
COPY packages/shared/ packages/shared/
COPY packages/mcp/ packages/mcp/
COPY packages/gateway/ packages/gateway/
COPY project.yaml .
COPY prompts/ prompts/
COPY skills/ skills/

ENV DATA_DIR=/data
ENV CLAUDE_CONFIG_DIR=/data/claude
ENV HOME=/data

EXPOSE ${PORT:-8090}

# Entrypoint: login to Claude if needed, then start gateway
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]

FROM node:22-slim

ARG APP_NAME=minimal
ENV PROTO_APP_NAME=${APP_NAME}

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
COPY examples/${APP_NAME}/package.json examples/${APP_NAME}/
RUN npm install --ignore-scripts

# Copy source
COPY tsconfig.json .
COPY packages/core-shared/ packages/core-shared/
COPY packages/core-mcp/ packages/core-mcp/
COPY packages/core-gateway/ packages/core-gateway/
COPY examples/${APP_NAME}/ examples/${APP_NAME}/

ENV DATA_DIR=/data
ENV CLAUDE_CONFIG_DIR=/data/claude
ENV HOME=/data
ENV PROTO_APP_ROOT=/app/examples/${APP_NAME}

EXPOSE ${PORT:-8090}

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]

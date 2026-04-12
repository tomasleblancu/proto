#!/bin/bash
set -e

APP_NAME="${PROTO_APP_NAME:-proto}"

mkdir -p /data/claude /data/sessions /data/claude-config

# Ensure MCP tool permissions are pre-approved
cat > /data/claude/settings.json << EOF
{
  "permissions": {
    "allow": [
      "mcp__${APP_NAME}__*",
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)"
    ]
  }
}
EOF

# Authenticate Claude via setup token (non-interactive)
if [ -n "$CLAUDE_SETUP_TOKEN" ]; then
  echo "[$APP_NAME] Authenticating with setup token..."
  echo "$CLAUDE_SETUP_TOKEN" | claude setup-token 2>/dev/null && echo "[$APP_NAME] Claude auth OK" || echo "[$APP_NAME] Setup token failed"
elif claude -p "ok" --output-format text --max-turns 1 > /dev/null 2>&1; then
  echo "[$APP_NAME] Claude already authenticated"
else
  echo "[$APP_NAME] No CLAUDE_SETUP_TOKEN set and Claude not authenticated."
  echo "[$APP_NAME] Set CLAUDE_SETUP_TOKEN env var or run: docker exec -it $APP_NAME claude setup-token"
  echo "[$APP_NAME] Starting gateway anyway (chat will fail until auth is done)"
fi

echo "[$APP_NAME] Starting gateway on port ${PORT:-8090}"
exec npx tsx packages/core-gateway/src/server.ts

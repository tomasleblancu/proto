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

# Check if Claude is authenticated
if ! claude --version > /dev/null 2>&1; then
  echo "[$APP_NAME] Claude Code not available"
  exit 1
fi

# Test auth with a simple call
echo "[$APP_NAME] Testing Claude auth..."
if claude -p "ok" --output-format text --max-turns 1 > /dev/null 2>&1; then
  echo "[$APP_NAME] Claude auth OK"
else
  echo "[$APP_NAME] Claude not authenticated. Run: docker exec -it $APP_NAME claude login"
  echo "[$APP_NAME] Starting gateway anyway (will fail on chat requests until auth is done)"
fi

echo "[$APP_NAME] Starting gateway on port ${PORT:-8090}"
exec npx tsx packages/core-gateway/src/server.ts

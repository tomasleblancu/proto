#!/bin/bash
set -e

mkdir -p /data/claude /data/sessions /data/claude-config

# Ensure MCP tool permissions are pre-approved
cat > /data/claude/settings.json << 'EOF'
{
  "permissions": {
    "allow": [
      "mcp__hermes__*",
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
  echo "[hermes] Claude Code not available"
  exit 1
fi

# Test auth with a simple call
echo "[hermes] Testing Claude auth..."
if claude -p "ok" --output-format text --max-turns 1 > /dev/null 2>&1; then
  echo "[hermes] Claude auth OK"
else
  echo "[hermes] Claude not authenticated. Run: docker exec -it hermes claude login"
  echo "[hermes] Starting gateway anyway (will fail on chat requests until auth is done)"
fi

echo "[hermes] Starting gateway on port ${PORT:-8090}"
exec npx tsx packages/core-gateway/src/server.ts

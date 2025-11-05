#!/bin/bash
# Setup MCP Servers in CCW Session
# Run this at the start of each CCW session to install MCP capabilities

set -e

echo "🔧 Setting up MCP-like capabilities in CCW session..."

# Install required tools
echo "📦 Installing jq (JSON processor)..."
command -v jq >/dev/null 2>&1 || {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install jq
  else
    apt-get update && apt-get install -y jq
  fi
}

# Install GitHub CLI if not present
echo "📦 Installing GitHub CLI..."
command -v gh >/dev/null 2>&1 || {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install gh
  else
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt update
    apt install gh
  fi
}

# Authenticate GitHub CLI with token
if [ -n "$GITHUB_TOKEN" ]; then
  echo "$GITHUB_TOKEN" | gh auth login --with-token
  echo "✅ GitHub CLI authenticated"
else
  echo "⚠️  GITHUB_TOKEN not set - GitHub operations will fail"
fi

# Verify Linear API key
if [ -n "$LINEAR_API_KEY" ]; then
  echo "✅ LINEAR_API_KEY detected"
else
  echo "⚠️  LINEAR_API_KEY not set - Linear operations will fail"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Note: This script is deprecated. Use install-official-mcps.sh instead for official MCP servers."
echo ""
echo "Usage:"
echo "  source .claude-code/mcp-helpers/install-official-mcps.sh"
echo "  source .claude-code/mcp-helpers/mcp-client.sh"

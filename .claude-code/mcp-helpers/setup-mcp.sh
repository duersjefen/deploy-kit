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

# Source helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/linear.sh"
source "$SCRIPT_DIR/github.sh"

echo ""
echo "✅ MCP-like setup complete!"
echo ""
echo "Available functions:"
echo "  Linear: linear_list_my_issues, linear_get_issue, linear_update_issue_state, linear_create_comment"
echo "  GitHub: github_create_pr, github_merge_pr, github_delete_branch, github_create_release"
echo ""
echo "Usage: source .claude-code/mcp-helpers/setup-mcp.sh"

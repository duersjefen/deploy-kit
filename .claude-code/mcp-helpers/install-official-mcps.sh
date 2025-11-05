#!/bin/bash
# Install Official MCP Servers in CCW
# This installs the REAL MCP servers (Playwright, Context7, Linear) instead of API wrappers

set -e

echo "🔧 Installing Official MCP Servers for CCW..."
echo ""

# Create MCP servers directory
mkdir -p ~/.mcp-servers
cd ~/.mcp-servers

# Install Playwright MCP Server
echo "📦 Installing @modelcontextprotocol/server-playwright..."
npm install -g @modelcontextprotocol/server-playwright

# Install Context7 MCP Server
echo "📦 Installing context7-mcp..."
npm install -g @context7/mcp-server

# Install Linear MCP Server
echo "📦 Installing @modelcontextprotocol/server-linear..."
npm install -g @modelcontextprotocol/server-linear

# Install Next.js Devtools MCP
echo "📦 Installing next-devtools-mcp..."
npm install -g next-devtools-mcp

echo ""
echo "✅ Official MCP servers installed!"
echo ""
echo "Installed servers:"
echo "  - Playwright (browser automation)"
echo "  - Context7 (library documentation)"
echo "  - Linear (issue tracking)"
echo "  - Next.js Devtools (Next.js runtime)"
echo ""
echo "Note: Serena is a desktop app and cannot be installed in CCW."
echo "      Use the API wrappers in linear.sh/github.sh instead."
echo ""
echo "To use these servers, you'll need to:"
echo "1. Start them as background processes"
echo "2. Send JSON-RPC requests via stdio/HTTP"
echo "3. See mcp-client.sh for usage examples"

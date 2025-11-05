#!/bin/bash
# MCP JSON-RPC Client
# Communicates with official MCP servers via stdio

# Start an MCP server in the background
mcp_start_server() {
  local server_name="$1"
  local command="$2"
  shift 2
  local args=("$@")

  echo "Starting MCP server: $server_name"

  # Create named pipe for communication
  mkfifo "/tmp/mcp-${server_name}-in" 2>/dev/null || true
  mkfifo "/tmp/mcp-${server_name}-out" 2>/dev/null || true

  # Start server with stdio pipes
  $command "${args[@]}" < "/tmp/mcp-${server_name}-in" > "/tmp/mcp-${server_name}-out" 2>&1 &

  echo $! > "/tmp/mcp-${server_name}.pid"
  echo "Started $server_name (PID: $(cat /tmp/mcp-${server_name}.pid))"
}

# Send JSON-RPC request to MCP server
mcp_call() {
  local server_name="$1"
  local method="$2"
  local params="$3"

  local request_id=$((RANDOM))

  # Build JSON-RPC request
  local request=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": $request_id,
  "method": "$method",
  "params": $params
}
EOF
)

  # Send request to server
  echo "$request" > "/tmp/mcp-${server_name}-in"

  # Read response
  timeout 5 cat "/tmp/mcp-${server_name}-out" | grep "\"id\":$request_id" || echo "Timeout waiting for response"
}

# Stop MCP server
mcp_stop_server() {
  local server_name="$1"

  if [ -f "/tmp/mcp-${server_name}.pid" ]; then
    local pid=$(cat "/tmp/mcp-${server_name}.pid")
    kill "$pid" 2>/dev/null || true
    rm "/tmp/mcp-${server_name}.pid"
    rm "/tmp/mcp-${server_name}-in" 2>/dev/null || true
    rm "/tmp/mcp-${server_name}-out" 2>/dev/null || true
    echo "Stopped $server_name"
  fi
}

# Example: Start Playwright MCP server
start_playwright() {
  mcp_start_server "playwright" "mcp-server-playwright" "--headless"
}

# Example: Start Context7 MCP server
start_context7() {
  mcp_start_server "context7" "context7-mcp-server"
}

# Example: Start Linear MCP server
start_linear() {
  if [ -z "$LINEAR_API_KEY" ]; then
    echo "Error: LINEAR_API_KEY environment variable not set"
    return 1
  fi
  mcp_start_server "linear" "mcp-server-linear" "--api-key" "$LINEAR_API_KEY"
}

# Example: List tools from an MCP server
mcp_list_tools() {
  local server_name="$1"
  mcp_call "$server_name" "tools/list" "{}"
}

# Example: Call a tool
mcp_call_tool() {
  local server_name="$1"
  local tool_name="$2"
  local tool_params="$3"

  mcp_call "$server_name" "tools/call" "{\"name\": \"$tool_name\", \"arguments\": $tool_params}"
}

# Export functions
export -f mcp_start_server
export -f mcp_call
export -f mcp_stop_server
export -f start_playwright
export -f start_context7
export -f start_linear
export -f mcp_list_tools
export -f mcp_call_tool

echo "MCP client functions loaded!"
echo "Usage:"
echo "  start_playwright    # Start Playwright MCP server"
echo "  start_context7      # Start Context7 MCP server"
echo "  start_linear        # Start Linear MCP server (requires LINEAR_API_KEY)"
echo "  mcp_list_tools <server>  # List available tools"
echo "  mcp_call_tool <server> <tool> <params>  # Call a tool"

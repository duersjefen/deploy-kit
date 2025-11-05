# Claude Code for the Web (CCW) Setup

This directory contains helper scripts and templates to use deploy-kit with Claude Code for the Web (CCW) using official MCP servers.

## Directory Structure

```
.claude-code/
├── mcp-helpers/                      # MCP server setup
│   ├── install-official-mcps.sh     # Install Playwright, Context7, Linear MCP servers
│   ├── mcp-client.sh                # JSON-RPC client for MCP communication
│   └── setup-mcp.sh                 # Deprecated - use install + client instead
├── workflows/                        # Reusable workflows
│   └── ship-pr.md                   # Complete PR workflow
├── templates/                        # Prompt templates
│   └── ccw-feature-task.md          # Feature implementation template
├── SETUP_GUIDE.md                   # Complete setup guide with cost estimation
└── README.md                        # This file
```

## Quick Start

### 1. Configure CCW Environment

In CCW, create a new environment with these variables:

```
GITHUB_TOKEN=gho_your_token_here
LINEAR_API_KEY=lin_api_your_key_here
NPM_TOKEN=npm_your_token_here
```

**How to get tokens:**

- **GitHub Token**: `gh auth token` (on your Mac)
- **Linear API Key**: https://linear.app/settings/api
- **NPM Token**: `cat ~/.npmrc | grep _authToken` (on your Mac)

### 2. Start CCW Session

In your first message to CCW, include:

```
I'm working on deploy-kit. Set up the development environment:

# Install official MCP servers (Playwright, Context7, Linear)
source .claude-code/mcp-helpers/install-official-mcps.sh

# Start MCP servers
source .claude-code/mcp-helpers/mcp-client.sh
start_playwright
start_context7
start_linear

Now implement: [DESCRIBE YOUR TASK HERE]
```

### 3. Use MCP Tools

After setup, you can use these tools:

**Playwright (Browser Automation):**
```bash
mcp_call_tool "playwright" "browser_navigate" '{"url": "http://localhost:3000"}'
mcp_call_tool "playwright" "browser_take_screenshot" '{"filename": "test.png"}'
```

**Context7 (Library Documentation):**
```bash
mcp_call_tool "context7" "get-library-docs" '{"libraryId": "/vercel/next.js", "topic": "routing"}'
```

**Linear (Issue Tracking):**
```bash
mcp_call_tool "linear" "list_issues" '{"assignee": "me"}'
mcp_call_tool "linear" "get_issue" '{"id": "DEP-17"}'
mcp_call_tool "linear" "update_issue" '{"id": "issue-id", "state": "Done"}'
```

**GitHub (Use gh CLI directly):**
```bash
gh pr create --title "feat: Add feature" --body "Description"
gh pr merge --squash
```

## Workflows

### Ship PR Workflow

See `.claude-code/workflows/ship-pr.md` for the complete workflow that:
1. Commits changes
2. Pushes to remote
3. Creates PR
4. Merges PR
5. Updates Linear issue
6. Bumps version (packages only)
7. Publishes to npm (packages only)

### Feature Task Template

See `.claude-code/templates/ccw-feature-task.md` for a step-by-step guide to implementing features in CCW.

## Tips for Using CCW

**DO:**
- ✅ Use templates to give CCW clear workflows
- ✅ Install MCP servers at start of each session
- ✅ Set environment variables in CCW config (not in prompts)
- ✅ Copy full workflows from `workflows/` directory into prompts
- ✅ Use official MCP tools for maximum feature parity with Desktop CC

**DON'T:**
- ❌ Paste API keys in chat (use environment variables)
- ❌ Skip the MCP installation (required for full functionality)
- ❌ Expect real-time feedback (CCW is async, check back later)

## Maximizing Your 1250€ Credit

**High-value CCW tasks:**
- Complex feature implementations (4-8 hour tasks)
- Multi-file refactoring across entire codebase
- Test suite generation for untested code
- Documentation generation from codebase analysis
- Migration tasks (framework upgrades, API migrations)

**Low-value CCW tasks (use Desktop CC instead):**
- Quick bug fixes (< 30 min)
- Single file edits
- Interactive debugging sessions
- Tasks requiring visual feedback

## Troubleshooting

**"MCP server not responding"**
```bash
# Check if server is running
ps aux | grep mcp-server

# Restart server
mcp_stop_server "playwright"
start_playwright
```

**"LINEAR_API_KEY not set"**
- Check CCW environment configuration
- Verify variable is spelled exactly: `LINEAR_API_KEY`

**"GitHub CLI not authenticated"**
- Check GITHUB_TOKEN is set in CCW environment
- Re-run install script

**"npm publish failed"**
- Check NPM_TOKEN is set in CCW environment
- Verify token: `npm whoami` (should show your username)

## More Information

See `SETUP_GUIDE.md` for complete setup instructions and cost estimation for your €1250 credit.

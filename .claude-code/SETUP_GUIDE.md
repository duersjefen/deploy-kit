# CCW Setup Guide - Official MCP Servers

This guide shows how to use OFFICIAL MCP servers in Claude Code for the Web (CCW).

## Two Approaches Available

### Approach A: Official MCP Servers (Recommended)

**Pros:**
- ✅ Same exact tools as Desktop Claude Code
- ✅ Full feature parity (Playwright, Context7, Linear)
- ✅ Well-maintained official packages
- ✅ More powerful than API wrappers

**Cons:**
- ⚠️ More complex setup (JSON-RPC client needed)
- ⚠️ Requires managing server processes
- ⚠️ Debugging is harder

**Files:**
- `.claude-code/mcp-helpers/install-official-mcps.sh` - Install official packages
- `.claude-code/mcp-helpers/mcp-client.sh` - JSON-RPC client

### Approach B: API Wrappers (Simpler)

**Pros:**
- ✅ Simple bash functions
- ✅ Easy to debug (just curl commands)
- ✅ No server management
- ✅ Direct API calls

**Cons:**
- ⚠️ Limited to Linear/GitHub only (no Playwright, Context7)
- ⚠️ Need to write wrappers for each API

**Files:**
- `.claude-code/mcp-helpers/linear.sh` - Linear API wrappers
- `.claude-code/mcp-helpers/github.sh` - GitHub API wrappers

## Recommended Hybrid Approach

**Use BOTH:**

1. **Official MCPs for:** Playwright (browser), Context7 (docs)
2. **API Wrappers for:** Linear, GitHub (simpler, faster)

Why? Playwright and Context7 don't have simple REST APIs, so the official MCP servers are essential. Linear and GitHub DO have REST APIs, so wrappers are simpler.

## Setup Instructions

### Step 1: Get Your API Tokens

Run these commands on your **local machine** (not CCW):

```bash
# Authenticate with 1Password
eval $(op signin)

# Get Linear API Key
op item get "Linear" --fields label=password --reveal

# Get GitHub Token
op item get "GitHub" --fields label=token --reveal

# Get npm Token
op item get "npm" --fields label=token --reveal
```

Copy the output tokens to `.claude-code/ENV_TEMPLATE.txt`.

### Step 2: Configure CCW Environment

In CCW, create a new environment:

**Name:** `deploy-kit-dev`

**Environment Variables:** (paste from ENV_TEMPLATE.txt)
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
NPM_TOKEN=npm_xxxxxxxxxxxxx
```

**Network Access:** Full network access

### Step 3: First CCW Session Prompt

Start your first CCW session with this prompt:

```
I'm working on the deploy-kit project. Please set up the development environment:

# Install official MCP servers
source .claude-code/mcp-helpers/install-official-mcps.sh

# Start Playwright and Context7 servers
source .claude-code/mcp-helpers/mcp-client.sh
start_playwright
start_context7

# Load API wrapper functions for Linear/GitHub
source .claude-code/mcp-helpers/linear.sh
source .claude-code/mcp-helpers/github.sh

Now I'm ready to work on: [describe your task]
```

### Step 4: Use MCP Tools

**Playwright (Official MCP):**
```bash
# Take screenshot
mcp_call_tool "playwright" "browser_take_screenshot" '{"url": "http://localhost:3000"}'

# Navigate and click
mcp_call_tool "playwright" "browser_navigate" '{"url": "http://localhost:3000"}'
mcp_call_tool "playwright" "browser_click" '{"selector": "button.submit"}'
```

**Context7 (Official MCP):**
```bash
# Get Next.js documentation
mcp_call_tool "context7" "get-library-docs" '{"libraryId": "/vercel/next.js", "topic": "routing"}'
```

**Linear (API Wrapper - Simpler):**
```bash
# List my issues
linear_list_my_issues

# Get issue details
linear_get_issue "DEP-17"

# Update issue state
linear_update_issue_state "DEP-17" "Done"
```

**GitHub (API Wrapper - Simpler):**
```bash
# Create PR
github_create_pr "feat: Add feature" "Description here"

# Merge PR
github_merge_pr "123"
```

## Cost Estimation (1250€ Credit)

**CCW Pricing:** ~€0.015 per message (Sonnet 3.5)

**Your 1250€ credit = ~83,000 messages**

**High-value tasks (recommended):**
- Complex features: 100-300 messages (€1.50-€4.50)
- Multi-file refactoring: 50-150 messages (€0.75-€2.25)
- Test generation: 80-200 messages (€1.20-€3.00)
- Migration tasks: 200-500 messages (€3.00-€7.50)

**Low-value tasks (use Desktop CC instead):**
- Quick fixes: 5-10 messages (€0.08-€0.15) - Not worth CCW overhead
- Single file edits: 3-8 messages (€0.05-€0.12) - Too simple
- Interactive debugging: 20-100 messages (€0.30-€1.50) - Better on Desktop

**Estimated usage:**
- 50 complex features = €75-€225
- 100 refactorings = €75-€225
- 20 migrations = €60-€150
- **Total: €210-€600 of your €1250 credit**

You could realistically complete **150-250 complex tasks** with your credit.

## Tips for Maximizing Credit

1. **Batch related tasks** - "Implement feature X, Y, and Z" (saves context)
2. **Use templates** - Copy workflows from `.claude-code/templates/`
3. **Clear requirements** - Detailed specs = fewer back-and-forth messages
4. **Async workflow** - Start task, check back later (no real-time waiting)
5. **Desktop CC for iteration** - Use CCW for implementation, Desktop for tweaks

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

**"Permission denied"**
```bash
# Make scripts executable
chmod +x .claude-code/mcp-helpers/*.sh
```

## Next Steps

1. ✅ Get your API tokens using 1Password commands above
2. ✅ Configure CCW environment with tokens
3. ✅ Run first session setup prompt
4. ✅ Start with a small task to test workflow
5. ✅ Scale up to complex features once comfortable

---

**Questions?** Check `.claude-code/README.md` for more examples.

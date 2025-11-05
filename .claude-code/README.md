# Claude Code for the Web (CCW) Setup

This directory contains helper scripts and templates to use deploy-kit with Claude Code for the Web (CCW), replacing MCP servers with API calls.

## Directory Structure

```
.claude-code/
├── mcp-helpers/           # MCP server replacements
│   ├── setup-mcp.sh      # Setup script for CCW session
│   ├── linear.sh         # Linear API helper functions
│   └── github.sh         # GitHub API helper functions
├── workflows/            # Reusable workflows
│   └── ship-pr.md        # Complete PR workflow
├── templates/            # Prompt templates
│   └── ccw-feature-task.md  # Feature implementation template
└── README.md             # This file
```

## Quick Start

### 1. Configure CCW Environment

In CCW, create a new environment with these variables:

```
GITHUB_TOKEN=ghp_your_token_here
LINEAR_API_KEY=lin_api_your_key_here
NPM_TOKEN=npm_your_token_here
```

**How to get tokens:**

- **GitHub Token**: https://github.com/settings/tokens (needs: `repo`, `workflow`)
- **Linear API Key**: https://linear.app/settings/api
- **NPM Token**: `npm token create` (needs: `Read and Publish`)

### 2. Start CCW Session

In your first message to CCW, include:

```
Please run the setup script:

source .claude-code/mcp-helpers/setup-mcp.sh

This will install jq, GitHub CLI, and load helper functions for Linear and GitHub operations.
```

### 3. Use Helper Functions

After setup, you can use these functions:

**Linear:**
- `linear_list_my_issues` - List issues assigned to you
- `linear_get_issue "DEP-17"` - Get issue details
- `linear_update_issue_state "DEP-17" "Done"` - Update issue state
- `linear_create_comment "issue-id" "comment text"` - Add comment

**GitHub:**
- `github_create_pr "title" "body"` - Create PR from current branch
- `github_merge_pr "123"` - Merge PR #123 (squash merge)
- `github_delete_branch "branch-name"` - Delete branch
- `github_create_release "v1.0.0" "Release v1.0.0" "body"` - Create release

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
- ✅ Source setup-mcp.sh at start of each session
- ✅ Set environment variables in CCW config (not in prompts)
- ✅ Copy full workflows from `workflows/` directory into prompts
- ✅ Use helper functions instead of manual API calls

**DON'T:**
- ❌ Paste API keys in chat (use environment variables)
- ❌ Skip the setup script (jq and gh are required)
- ❌ Try to use Desktop Claude Code's MCP servers (they don't work in CCW)
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

**"jq: command not found"**
- Run `source .claude-code/mcp-helpers/setup-mcp.sh` again

**"GitHub CLI not authenticated"**
- Check GITHUB_TOKEN is set in CCW environment
- Re-run setup script

**"Linear API request failed"**
- Check LINEAR_API_KEY is set in CCW environment
- Verify API key at https://linear.app/settings/api

**"npm publish failed"**
- Check NPM_TOKEN is set in CCW environment
- Verify token: `npm whoami` (should show your username)

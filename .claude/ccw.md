# Deploy-Kit - Claude Code for Web (CCW) Environment

**IMPORTANT:** This file is only loaded in CCW environments (when `CLAUDE_CODE_REMOTE=true`).

---

## Environment Detection

You are in **Claude Code for Web (CCW)** when:
- `CLAUDE_CODE_REMOTE=true` environment variable is set
- Running in cloud-based development environment

---

## Key Principle: Use APIs with curl

In CCW, we use **HTTP APIs with curl** instead of CLI tools:

**GitHub Operations:**
- Use **GitHub REST API** with curl instead of `gh` CLI
- Requires: `GITHUB_TOKEN` environment variable

**Linear Operations:**
- Use **Linear GraphQL API** with curl
- Requires: `LINEAR_API_KEY` environment variable

---

## Examples

### Create GitHub PR

```bash
# Get current branch and repo
BRANCH=$(git branch --show-current)
REPO=$(git config --get remote.origin.url | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|')

# Create PR
curl -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/pulls" \
  -d "{
    \"title\": \"feat: Description (DEP-X)\",
    \"body\": \"## Summary\\nChanges made...\\n\\nLinear: DEP-X\",
    \"head\": \"$BRANCH\",
    \"base\": \"main\"
  }"
```

### Query Linear Issues

```bash
# Get issue details
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d '{"query": "query { issue(id: \"DEP-21\") { id identifier title description state { name } } }"}'
```

---

## Limitations in CCW

**Cannot:**
- Publish to npm (no auth token)
- Deploy to AWS (no AWS credentials)

**Can:**
- All git operations
- Build and test code
- GitHub operations via API
- Linear operations via API
- All development tasks

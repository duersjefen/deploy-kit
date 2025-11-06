# Deploy-Kit - Claude Code for Web (CCW) Environment

**IMPORTANT:** This file is loaded in CCW environments (when `CLAUDE_CODE_REMOTE=true`).

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
- Base URL: `https://api.github.com`

**Linear Operations:**
- Use **Linear GraphQL API** with curl
- Requires: `LINEAR_API_KEY` environment variable
- Base URL: `https://api.linear.app/graphql`
- **CRITICAL:** ALWAYS use `curl -k` (skip SSL verification)

---

## Extracting Repo Information

```bash
# Get repo owner/name (handles proxy URLs correctly)
REPO=$(git config --get remote.origin.url | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|' | sed 's|^local_proxy@[^/]*/git/||')
# Output: "duersjefen/deploy-kit"

# Get current branch
BRANCH=$(git branch --show-current)

# Get default branch
DEFAULT_BRANCH=$(git remote show origin | grep "HEAD branch" | sed 's/.*: //')
```

**Why the double sed?**
- First sed: Extracts `owner/repo` from git URLs
- Second sed: Removes `local_proxy@127.0.0.1:19541/git/` prefix (CCW specific)

---

## GitHub API Examples

### Create PR

```bash
REPO=$(git config --get remote.origin.url | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|' | sed 's|^local_proxy@[^/]*/git/||')
BRANCH=$(git branch --show-current)

curl -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/pulls" \
  -d "{
    \"title\": \"feat: Your feature description (DEP-X)\",
    \"body\": \"## Summary\n\nWhat changed\n\n## Changes\n- Item 1\n- Item 2\n\nLinear: DEP-X\n🤖 Generated with Claude Code\",
    \"head\": \"${BRANCH}\",
    \"base\": \"main\"
  }"
```

**Response contains:** PR number, URL, merge status

### Merge PR (Squash)

```bash
curl -X PUT \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/merge" \
  -d "{
    \"merge_method\": \"squash\",
    \"commit_title\": \"feat: Description (#${PR_NUMBER})\",
    \"commit_message\": \"Summary of changes\"
  }"
```

**Response:** `{"sha": "...", "merged": true, "message": "Pull Request successfully merged"}`

### Extract PR Number from Response

```bash
PR_RESPONSE=$(curl -s -X POST ... )
PR_NUMBER=$(echo "$PR_RESPONSE" | grep -o '"number": *[0-9]*' | head -1 | grep -o '[0-9]*')
```

### Check PR Status

```bash
curl -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}"
```

---

## Linear API Examples

### Get Issue Details

```bash
# By identifier (DEP-31)
curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d '{"query": "query { issue(id: \"DEP-31\") { id identifier title description state { name } priority priorityLabel labels { nodes { name } } assignee { name email } } }"}'
```

**Note:** Linear uses identifiers (DEP-31) in queries, but UUIDs in mutations

### Update Issue to Done (Complete Workflow)

**Step 1:** Get issue UUID and team's Done state UUID
```bash
curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d '{"query": "query { issue(id: \"DEP-31\") { id team { states(filter: { type: { eq: \"completed\" } }) { nodes { id name } } } } }"}'
```

**Response:**
```json
{
  "data": {
    "issue": {
      "id": "7c4ab083-19be-4f5a-96f6-5c3237def046",
      "team": {
        "states": {
          "nodes": [{"id": "b9a89684-c517-4906-bb09-b5ff6608fb2d", "name": "Done"}]
        }
      }
    }
  }
}
```

**Step 2:** Update issue with UUIDs
```bash
ISSUE_UUID="7c4ab083-19be-4f5a-96f6-5c3237def046"
STATE_UUID="b9a89684-c517-4906-bb09-b5ff6608fb2d"

curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"${ISSUE_UUID}\\\", input: { stateId: \\\"${STATE_UUID}\\\" }) { success issue { identifier state { name } } } }\"}"
```

**Response:** `{"data": {"issueUpdate": {"success": true, "issue": {"identifier": "DEP-31", "state": {"name": "Done"}}}}}`

### List Team Issues (Backlog)

```bash
curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d '{"query": "query { team(id: \"DEP\") { issues(first: 20, filter: { state: { type: { eq: \"backlog\" } } }) { nodes { id identifier title state { name } priority assignee { name } } } } }"}'
```

### Add Comment to Issue

```bash
curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d "{\"query\": \"mutation { commentCreate(input: { issueId: \\\"${ISSUE_UUID}\\\", body: \\\"Completed in PR #172\\\" }) { success comment { id } } }\"}"
```

---

## Error Handling

### Linear SSL Certificate Errors

**Problem:**
```
TLS_error:|268435581:SSL routines:OPENSSL_internal:CERTIFICATE_VERIFY_FAILED
```

**Solution:** ALWAYS use `curl -k` for Linear API
- The `-k` flag skips SSL certificate verification
- Required in CCW environment due to certificate validation issues

### GitHub 403 Errors on Push

**Problem:**
```
error: RPC failed; HTTP 403
fatal: the remote end hung up unexpectedly
```

**Cause:** Branch name doesn't match session ID pattern

**Solution:** Branch must start with `claude/` and end with matching session ID
- Example: `claude/fix-npm-release-dep-31-011CUr8sDfqqr2699pjyjKcK`

### Extracting Data from API Responses

**Without jq (use grep):**
```bash
# Extract PR number
echo "$PR_RESPONSE" | grep -o '"number": *[0-9]*' | head -1 | grep -o '[0-9]*'

# Extract URL
echo "$PR_RESPONSE" | grep -o '"html_url": *"[^"]*"' | head -1 | sed 's/"html_url": *"\(.*\)"/\1/'

# Extract merge status
echo "$MERGE_RESPONSE" | grep -o '"merged": *[^,]*' | head -1
```

---

## Complete PR + Linear Workflow

```bash
# 1. Get repo info
REPO=$(git config --get remote.origin.url | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|' | sed 's|^local_proxy@[^/]*/git/||')
BRANCH=$(git branch --show-current)

# 2. Push branch
git push -u origin $BRANCH

# 3. Create PR
PR_RESPONSE=$(curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/pulls" \
  -d "{\"title\": \"fix: Issue (DEP-31)\", \"body\": \"Linear: DEP-31\", \"head\": \"${BRANCH}\", \"base\": \"main\"}")

PR_NUMBER=$(echo "$PR_RESPONSE" | grep -o '"number": *[0-9]*' | head -1 | grep -o '[0-9]*')

# 4. Merge PR
curl -X PUT \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/merge" \
  -d '{"merge_method": "squash"}'

# 5. Get Linear issue and Done state
LINEAR_RESPONSE=$(curl -sk -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d '{"query": "query { issue(id: \"DEP-31\") { id team { states(filter: { type: { eq: \"completed\" } }) { nodes { id } } } } }"}')

# Extract UUIDs (requires manual inspection of LINEAR_RESPONSE)
ISSUE_UUID=$(echo "$LINEAR_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# 6. Update Linear issue
curl -k -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"${ISSUE_UUID}\\\", input: { stateId: \\\"${STATE_UUID}\\\" }) { success } }\"}"
```

---

## Cheat Sheet

| Task | Command Pattern | Key Flags |
|------|----------------|-----------|
| Create GitHub PR | `curl -X POST .../pulls` | `-H "Authorization: token ${GITHUB_TOKEN}"` |
| Merge GitHub PR | `curl -X PUT .../pulls/N/merge` | `merge_method: "squash"` |
| Get Linear issue | `curl -k -X POST .../graphql` | `-k` (skip SSL), use identifier in query |
| Update Linear issue | `curl -k -X POST .../graphql` | `-k`, use UUID in mutation |
| Extract repo name | `git config ... \| sed ... \| sed ...` | Double sed for proxy URLs |

---

## Limitations in CCW

**Cannot:**
- Publish to npm (no npm auth token)
- Deploy to AWS (no AWS credentials)
- Use `gh` CLI (blocked/unavailable)
- Use `linear` CLI (blocked/unavailable)

**Can:**
- All git operations (push, pull, commit, branch)
- Build and test code (npm, pnpm, node)
- GitHub operations via REST API
- Linear operations via GraphQL API
- All development tasks (read, write, edit files)

---

## Tips for Efficiency

1. **Store REPO variable early** - Avoids repeating the sed chain
2. **Use `-s` flag with curl** - Silent mode, cleaner output when piping to grep
3. **Always use curl -k for Linear** - Prevents SSL errors 100% of the time
4. **Extract PR number immediately** - Needed for merge operation
5. **Query Linear with identifier, mutate with UUID** - Different formats for different operations
6. **Get Done state dynamically** - Each team has different state UUIDs

---

---
description: Ship PR - commit, push, merge, sync, publish (if package)
argument-hint: [linear-issue-id]
---

# Ship PR

Complete workflow: Commit → Push → PR → Merge → Sync → Publish (if package)

## Workflow

**1. Commit changes**
```bash
git add -A && git commit -m "[conventional commit message based on changes]"
```

**2. Push and create PR**
```bash
git push -u origin $(git branch --show-current)

gh pr create --title "[title from commits]" --body "$(cat <<'EOF'
## Summary
[Key changes]

[Linear: ISSUE-ID (if provided)]
🤖 Generated with Claude Code
EOF
)"
```

**3. Merge PR**
```bash
PR_NUMBER=$(gh pr view --json number -q .number)
gh pr merge $PR_NUMBER --squash --delete-branch 2>&1 | grep -v "already used by worktree" || true
```

**4. Sync local main**

Conductor worktree:
```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||')
git -C "$PROJECT_ROOT" pull origin main
```

Regular project:
```bash
git checkout main && git pull origin main
```

**5. Update Linear (if issue ID provided)**

Use Linear MCP to update issue state to "Done" and add PR comment.

**6. Publish to npm (if public package)**

Check package status:
```bash
PRIVATE=$(jq -r '.private // false' package.json)
VERSION=$(jq -r '.version // ""' package.json)
```

If package is public (`PRIVATE == false` AND `VERSION` exists):

Ask: **"Publish v$VERSION to npm? (yes/no)"**

If yes:
```bash
npm publish
echo "✅ Published v$VERSION to npm"
```

## Safety

- Use `--squash` for merges
- Suppress Conductor "already used by worktree" warnings
- Skip npm publish for private packages
- Stop on errors

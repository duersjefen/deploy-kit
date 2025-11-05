# Sync Main (Conductor Workspace)

Safely integrate latest changes from origin/main into current Conductor workspace.

**What this does:**
1. Updates local `main` (parent worktree) from `origin/main`
2. Rebases your current feature branch onto the updated `main`

**When to use:**
- Other PRs have been merged to main and you want to sync
- Before creating a PR to ensure you're up-to-date with main
- To resolve "branch is out of date" issues

## Safety Checks

Before syncing, perform these checks in order:

1. **Verify we're in a Conductor workspace:**
   ```bash
   pwd
   ```
   - Path must contain `/.conductor/[workspace-name]`
   - If not, STOP and say: "This command only works in Conductor workspaces"

2. **Check for uncommitted changes:**
   ```bash
   git status --short
   ```
   - If ANY uncommitted changes exist, STOP and say: "Please commit or stash your changes first"

3. **Fetch from origin and update local main if needed:**
   ```bash
   PROJECT_ROOT=$(git rev-parse --show-toplevel | sed 's|/.conductor/[^/]*$||')
   git -C "$PROJECT_ROOT" fetch origin
   COMMITS_BEHIND=$(git -C "$PROJECT_ROOT" rev-list --count main..origin/main)
   ```
   - Tell user: "Local main is $COMMITS_BEHIND commits behind origin/main"
   - If behind, update it: `git -C "$PROJECT_ROOT" pull origin main`
   - If 0 commits behind, say: "Local main already up to date"

4. **Check if current branch is behind main:**
   ```bash
   git log HEAD..main --oneline
   ```
   - Count and show commits in main that are NOT in current branch
   - Tell user: "Your branch is X commits behind main"
   - If 0 commits behind, say: "✅ Already up to date with main!" and STOP
   - If commits exist, list them and say: "Will rebase these commits onto your branch"

## Sync Workflow (only if check 4 shows commits behind)

Execute rebase:

```bash
# Rebase current branch onto updated main
git rebase main
```

Note: Step 3 already updated local main if needed, so we only need to rebase here.

## After Sync

- Show: `git log --oneline -5`
- Say: "✅ Synced with main. Run tests before continuing work."

## If Rebase Conflicts

Guide user step-by-step:
1. `git status` - Show conflicted files
2. Tell them to resolve conflicts in editor
3. `git add <resolved-files>`
4. `git rebase --continue`

To abort: `git rebase --abort`

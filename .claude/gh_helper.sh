#!/bin/bash
# GitHub helper that auto-detects gh CLI or falls back to curl
# Works in CCW, local, Conductor - anywhere with GITHUB_TOKEN

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh CLI is available and working
gh_available() {
  if command -v gh &> /dev/null; then
    # Try to run gh auth status silently
    if gh auth status &> /dev/null; then
      return 0
    fi
  fi
  return 1
}

# Get current repo in owner/repo format
get_repo() {
  git config --get remote.origin.url | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|'
}

# Create PR - tries gh, falls back to curl
gh_pr_create() {
  local title="$1"
  local body="$2"
  local head=$(git branch --show-current)
  local base="${3:-main}"
  local repo=$(get_repo)

  if gh_available; then
    echo -e "${GREEN}Using gh CLI to create PR${NC}"
    gh pr create --title "$title" --body "$body" --base "$base"
  else
    echo -e "${YELLOW}gh CLI not available, using GitHub API${NC}"

    if [ -z "$GITHUB_TOKEN" ]; then
      echo "❌ Error: GITHUB_TOKEN not set and gh CLI not available"
      return 1
    fi

    # Escape quotes and newlines for JSON
    body_json=$(echo "$body" | jq -Rs .)
    title_json=$(echo "$title" | jq -Rs .)

    response=$(curl -s -X POST \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${repo}/pulls" \
      -d "{
        \"title\": $title_json,
        \"body\": $body_json,
        \"head\": \"$head\",
        \"base\": \"$base\"
      }")

    pr_url=$(echo "$response" | jq -r '.html_url // empty')
    pr_number=$(echo "$response" | jq -r '.number // empty')

    if [ -n "$pr_url" ]; then
      echo -e "${GREEN}✓${NC} Pull request created: $pr_url"
      echo "$pr_number" > /tmp/gh_pr_number
      return 0
    else
      error=$(echo "$response" | jq -r '.message // "Unknown error"')
      echo "❌ Error creating PR: $error"
      echo "$response" | jq . 2>/dev/null || echo "$response"
      return 1
    fi
  fi
}

# Get PR number for current branch
gh_pr_view_number() {
  local repo=$(get_repo)
  local head=$(git branch --show-current)

  if gh_available; then
    gh pr view --json number -q .number 2>/dev/null || echo ""
  else
    # Check temp file first (from recent pr create)
    if [ -f /tmp/gh_pr_number ]; then
      cat /tmp/gh_pr_number
      return 0
    fi

    if [ -z "$GITHUB_TOKEN" ]; then
      echo "❌ Error: GITHUB_TOKEN not set"
      return 1
    fi

    # Query GitHub API for PR on current branch
    response=$(curl -s \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${repo}/pulls?head=${repo%/*}:${head}&state=open")

    echo "$response" | jq -r '.[0].number // empty'
  fi
}

# Merge PR - tries gh, falls back to curl
gh_pr_merge() {
  local pr_number="$1"
  local merge_method="${2:-squash}"
  local repo=$(get_repo)

  # Auto-detect PR number if not provided
  if [ -z "$pr_number" ]; then
    pr_number=$(gh_pr_view_number)
    if [ -z "$pr_number" ]; then
      echo "❌ Error: Could not find PR number"
      return 1
    fi
  fi

  if gh_available; then
    echo -e "${GREEN}Using gh CLI to merge PR #${pr_number}${NC}"
    gh pr merge "$pr_number" --$merge_method --delete-branch 2>&1 | grep -v "already used by worktree" || true
  else
    echo -e "${YELLOW}gh CLI not available, using GitHub API${NC}"

    if [ -z "$GITHUB_TOKEN" ]; then
      echo "❌ Error: GITHUB_TOKEN not set and gh CLI not available"
      return 1
    fi

    response=$(curl -s -X PUT \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${repo}/pulls/${pr_number}/merge" \
      -d "{\"merge_method\": \"$merge_method\"}")

    merged=$(echo "$response" | jq -r '.merged // false')

    if [ "$merged" = "true" ]; then
      sha=$(echo "$response" | jq -r '.sha')
      echo -e "${GREEN}✓${NC} Pull Request successfully merged (${sha:0:7})"

      # Delete branch
      branch=$(git branch --show-current)
      curl -s -X DELETE \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${repo}/git/refs/heads/${branch}" > /dev/null
      echo -e "${GREEN}✓${NC} Deleted branch: $branch"

      rm -f /tmp/gh_pr_number
      return 0
    else
      error=$(echo "$response" | jq -r '.message // "Unknown error"')
      echo "❌ Error merging PR: $error"
      echo "$response" | jq . 2>/dev/null || echo "$response"
      return 1
    fi
  fi
}

# Get PR details
gh_pr_view() {
  local pr_number="$1"
  local repo=$(get_repo)

  if [ -z "$pr_number" ]; then
    pr_number=$(gh_pr_view_number)
  fi

  if gh_available; then
    gh pr view "$pr_number"
  else
    if [ -z "$GITHUB_TOKEN" ]; then
      echo "❌ Error: GITHUB_TOKEN not set"
      return 1
    fi

    response=$(curl -s \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${repo}/pulls/${pr_number}")

    # Format output similar to gh pr view
    title=$(echo "$response" | jq -r '.title')
    state=$(echo "$response" | jq -r '.state')
    url=$(echo "$response" | jq -r '.html_url')
    body=$(echo "$response" | jq -r '.body // ""')

    echo "$title #$pr_number"
    echo "State: $state"
    echo "URL: $url"
    echo ""
    echo "$body"
  fi
}

# Main command dispatcher
case "${1:-}" in
  pr)
    case "${2:-}" in
      create)
        shift 2
        # Parse --title and --body flags
        title=""
        body=""
        base="main"
        while [[ $# -gt 0 ]]; do
          case $1 in
            --title) title="$2"; shift 2 ;;
            --body) body="$2"; shift 2 ;;
            --base) base="$2"; shift 2 ;;
            *) shift ;;
          esac
        done
        gh_pr_create "$title" "$body" "$base"
        ;;
      merge)
        shift 2
        pr_number=""
        merge_method="squash"
        while [[ $# -gt 0 ]]; do
          case $1 in
            --squash) merge_method="squash"; shift ;;
            --merge) merge_method="merge"; shift ;;
            --rebase) merge_method="rebase"; shift ;;
            --delete-branch) shift ;; # We always delete
            *) pr_number="$1"; shift ;;
          esac
        done
        gh_pr_merge "$pr_number" "$merge_method"
        ;;
      view)
        shift 2
        gh_pr_view "$@"
        ;;
      *)
        echo "Usage: gh_helper.sh pr {create|merge|view}"
        exit 1
        ;;
    esac
    ;;
  *)
    echo "GitHub Helper - Auto-detects gh CLI or uses curl fallback"
    echo ""
    echo "Usage:"
    echo "  gh_helper.sh pr create --title 'Title' --body 'Body' [--base main]"
    echo "  gh_helper.sh pr merge [PR_NUMBER] [--squash|--merge|--rebase]"
    echo "  gh_helper.sh pr view [PR_NUMBER]"
    echo ""
    if gh_available; then
      echo "Status: gh CLI is available and authenticated ✓"
    else
      echo "Status: gh CLI not available, will use GitHub API"
      if [ -n "$GITHUB_TOKEN" ]; then
        echo "        GITHUB_TOKEN detected ✓"
      else
        echo "        ⚠️  GITHUB_TOKEN not set"
      fi
    fi
    exit 1
    ;;
esac

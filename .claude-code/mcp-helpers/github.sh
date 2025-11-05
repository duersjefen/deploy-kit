#!/bin/bash
# GitHub CLI Helper Functions (MCP Replacement for CCW)
# Requires: GITHUB_TOKEN environment variable

GH_API="https://api.github.com"

# Create pull request
github_create_pr() {
  local title="$1"
  local body="$2"
  local branch="$(git branch --show-current)"
  local repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

  curl -s -X POST "$GH_API/repos/$repo/pulls" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"$title\",
      \"body\": \"$body\",
      \"head\": \"$branch\",
      \"base\": \"main\"
    }" | jq -r '.number'
}

# Merge pull request (squash)
github_merge_pr() {
  local pr_number="$1"
  local repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

  curl -s -X PUT "$GH_API/repos/$repo/pulls/$pr_number/merge" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "merge_method": "squash"
    }' | jq -r '.merged'
}

# Delete branch after merge
github_delete_branch() {
  local branch="$1"
  local repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

  curl -s -X DELETE "$GH_API/repos/$repo/git/refs/heads/$branch" \
    -H "Authorization: token $GITHUB_TOKEN"
}

# Get latest release version
github_get_latest_release() {
  local repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

  curl -s "$GH_API/repos/$repo/releases/latest" \
    -H "Authorization: token $GITHUB_TOKEN" | jq -r '.tag_name'
}

# Create GitHub release
github_create_release() {
  local tag="$1"
  local name="$2"
  local body="$3"
  local repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

  curl -s -X POST "$GH_API/repos/$repo/releases" \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"tag_name\": \"$tag\",
      \"name\": \"$name\",
      \"body\": \"$body\",
      \"draft\": false,
      \"prerelease\": false
    }" | jq -r '.html_url'
}

# Export functions
export -f github_create_pr
export -f github_merge_pr
export -f github_delete_branch
export -f github_get_latest_release
export -f github_create_release

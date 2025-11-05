#!/bin/bash
# Linear API Helper Functions (MCP Replacement for CCW)
# Requires: LINEAR_API_KEY environment variable

LINEAR_API="https://api.linear.app/graphql"

# List issues assigned to me
linear_list_my_issues() {
  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "query": "query { viewer { assignedIssues { nodes { id identifier title state { name } } } } }"
    }' | jq -r '.data.viewer.assignedIssues.nodes[] | "\(.identifier): \(.title) [\(.state.name)]"'
}

# Get issue details by identifier (e.g., DEP-16)
linear_get_issue() {
  local identifier="$1"
  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"query { issue(id: \\\"$identifier\\\") { id identifier title description state { name } } }\"
    }" | jq -r '.data.issue'
}

# Update issue state (e.g., "Done", "In Progress")
linear_update_issue_state() {
  local issue_id="$1"
  local state_name="$2"

  # Get state ID from name
  local state_id=$(curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"query { workflowStates { nodes { id name } } }\"
    }" | jq -r ".data.workflowStates.nodes[] | select(.name == \"$state_name\") | .id")

  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"mutation { issueUpdate(id: \\\"$issue_id\\\", input: { stateId: \\\"$state_id\\\" }) { success } }\"
    }" | jq -r '.data.issueUpdate.success'
}

# Create comment on issue
linear_create_comment() {
  local issue_id="$1"
  local body="$2"

  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": \"mutation { commentCreate(input: { issueId: \\\"$issue_id\\\", body: \\\"$body\\\" }) { success } }\"
    }" | jq -r '.data.commentCreate.success'
}

# Export functions
export -f linear_list_my_issues
export -f linear_get_issue
export -f linear_update_issue_state
export -f linear_create_comment

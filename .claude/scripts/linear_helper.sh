#!/bin/bash
# Linear CLI Helper for CCW
# Simple wrapper around Linear GraphQL API

set -e

if [ -z "$LINEAR_API_KEY" ]; then
  echo "Error: LINEAR_API_KEY environment variable not set"
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  get-issue)
    ISSUE_ID="$1"
    if [ -z "$ISSUE_ID" ]; then
      echo "Usage: linear_helper.sh get-issue <issue-id-or-identifier>"
      exit 1
    fi

    # Use the issue query directly - works for both ID and identifier
    QUERY="query { issue(id: \\\"$ISSUE_ID\\\") { id identifier title description state { name } priority priorityLabel assignee { name } labels { nodes { name } } } }"

    curl -s -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: $LINEAR_API_KEY" \
      -d "{\"query\": \"$QUERY\"}" | jq '.'
    ;;

  list-issues)
    TEAM="${1:-DEP}"
    LIMIT="${2:-10}"

    QUERY="query { issues(filter: { team: { key: { eq: \\\"$TEAM\\\" } } }, orderBy: updatedAt, first: $LIMIT) { nodes { id identifier title state { name } assignee { name } } } }"

    curl -s -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: $LINEAR_API_KEY" \
      -d "{\"query\": \"$QUERY\"}" | jq -r '.data.issues.nodes[] | "\(.identifier): \(.title) [\(.state.name)]"'
    ;;

  update-state)
    ISSUE_ID="$1"
    STATE="$2"

    if [ -z "$ISSUE_ID" ] || [ -z "$STATE" ]; then
      echo "Usage: linear_helper.sh update-state <issue-id> <state-name>"
      echo "Common states: Todo, In Progress, Done, Canceled"
      exit 1
    fi

    # First get the state ID
    STATE_QUERY="query { workflowStates { nodes { id name } } }"
    STATE_ID=$(curl -s -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: $LINEAR_API_KEY" \
      -d "{\"query\": \"$STATE_QUERY\"}" | \
      jq -r ".data.workflowStates.nodes[] | select(.name == \"$STATE\") | .id")

    if [ -z "$STATE_ID" ]; then
      echo "Error: State '$STATE' not found"
      exit 1
    fi

    # Update the issue
    MUTATION="mutation { issueUpdate(id: \\\"$ISSUE_ID\\\", input: { stateId: \\\"$STATE_ID\\\" }) { success issue { id identifier state { name } } } }"

    curl -s -X POST https://api.linear.app/graphql \
      -H "Content-Type: application/json" \
      -H "Authorization: $LINEAR_API_KEY" \
      -d "{\"query\": \"$MUTATION\"}" | jq '.'
    ;;

  --help|help)
    echo "Linear CLI Helper"
    echo ""
    echo "Usage: linear_helper.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  get-issue <id>           Get issue details by ID or identifier (e.g., DEP-21)"
    echo "  list-issues [team] [n]   List recent issues (default: DEP team, 10 issues)"
    echo "  update-state <id> <state> Update issue state (e.g., 'Done', 'In Progress')"
    echo "  help                     Show this help"
    echo ""
    echo "Environment:"
    echo "  LINEAR_API_KEY          Required - your Linear API key"
    echo ""
    echo "Examples:"
    echo "  linear_helper.sh get-issue DEP-21"
    echo "  linear_helper.sh list-issues DEP 5"
    echo "  linear_helper.sh update-state 011CUpqCxQnHnpkdk2UzQKi1 Done"
    ;;

  *)
    echo "Unknown command: $COMMAND"
    echo "Run 'linear_helper.sh help' for usage"
    exit 1
    ;;
esac

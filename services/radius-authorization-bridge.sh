#!/bin/bash
set -u
USERNAME="${1:-}"
[[ -n "$USERNAME" ]] || exit 2
RESPONSE=$(curl --silent --show-error --max-time 5 --request POST http://127.0.0.1:3000/api/radius/authorize-card --header 'Content-Type: application/json' --data "{\"username\":\"$USERNAME\"}") || exit 2
DECISION=$(printf '%s' "$RESPONSE" | sed -n 's/.*"decision":"\([^"]*\)".*/\1/p')
[[ "$DECISION" == "allow" ]] && exit 0
exit 1

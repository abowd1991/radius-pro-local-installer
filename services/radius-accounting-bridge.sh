#!/usr/bin/env bash
# Reliable AccountingBridge delivery for Radius Pro V2.
# FreeRADIUS continues accounting independently; this bridge only mirrors the
# event to the application. Stop retries are safe because SessionEngine is idempotent.

set -u

BRIDGE_URL="http://127.0.0.1:3000/api/radius/accounting"
LOG_DIR="/var/log/radius-pro"
LOG_FILE="${LOG_DIR}/accounting-bridge.log"

ACCT_STATUS_TYPE="${1:-${ACCT_STATUS_TYPE:-}}"
ACCT_SESSION_ID="${2:-${ACCT_SESSION_ID:-}}"
ACCT_UNIQUE_SESSION_ID="${3:-${ACCT_UNIQUE_SESSION_ID:-}}"
USER_NAME="${4:-${USER_NAME:-}}"
NAS_IP_ADDRESS="${5:-${NAS_IP_ADDRESS:-}}"
FRAMED_IP_ADDRESS="${6:-${FRAMED_IP_ADDRESS:-}}"
ACCT_SESSION_TIME="${7:-${ACCT_SESSION_TIME:-0}}"
ACCT_INPUT_OCTETS="${8:-${ACCT_INPUT_OCTETS:-0}}"
ACCT_OUTPUT_OCTETS="${9:-${ACCT_OUTPUT_OCTETS:-0}}"
ACCT_TERMINATE_CAUSE="${10:-${ACCT_TERMINATE_CAUSE:-NAS-Request}}"

PAYLOAD=$(cat <<EOF
{"ACCT_STATUS_TYPE":"${ACCT_STATUS_TYPE}","ACCT_SESSION_ID":"${ACCT_SESSION_ID}","ACCT_UNIQUE_SESSION_ID":"${ACCT_UNIQUE_SESSION_ID}","USER_NAME":"${USER_NAME}","NAS_IP_ADDRESS":"${NAS_IP_ADDRESS}","FRAMED_IP_ADDRESS":"${FRAMED_IP_ADDRESS}","ACCT_SESSION_TIME":"${ACCT_SESSION_TIME}","ACCT_INPUT_OCTETS":"${ACCT_INPUT_OCTETS}","ACCT_OUTPUT_OCTETS":"${ACCT_OUTPUT_OCTETS}","ACCT_TERMINATE_CAUSE":"${ACCT_TERMINATE_CAUSE}"}
EOF
)

mkdir -p "$LOG_DIR" 2>/dev/null || true

post_once() {
  local code
  code=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 1 --max-time 4 \
    --request POST --header 'Content-Type: application/json' \
    --data "$PAYLOAD" "$BRIDGE_URL" 2>/dev/null) || code="000"
  [[ "$code" =~ ^2[0-9][0-9]$ ]]
}

# Start/Interim retain the prior single-attempt non-blocking behavior.
attempts=1
if [[ "$ACCT_STATUS_TYPE" == "Stop" ]]; then
  attempts=3
fi

attempt=1
while (( attempt <= attempts )); do
  if post_once; then
    if [[ "$ACCT_STATUS_TYPE" == "Stop" ]]; then
      printf '%s stop-delivered session=%s user=%s attempt=%d\n' "$(date -Is)" "$ACCT_SESSION_ID" "$USER_NAME" "$attempt" >> "$LOG_FILE"
    fi
    exit 0
  fi
  if [[ "$ACCT_STATUS_TYPE" == "Stop" ]]; then
    printf '%s stop-delivery-failed session=%s user=%s attempt=%d\n' "$(date -Is)" "$ACCT_SESSION_ID" "$USER_NAME" "$attempt" >> "$LOG_FILE"
  fi
  ((attempt++))
  sleep 1
done

# Never make FreeRADIUS accounting fail because application delivery failed.
exit 0

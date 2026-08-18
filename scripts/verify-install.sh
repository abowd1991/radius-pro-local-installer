#!/usr/bin/env bash
set -euo pipefail

failures=0
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label" >&2
    failures=$((failures + 1))
  fi
}

check "mysql" mysqladmin ping -u radiuspro -p"${RADIUS_PRO_APP_DB_PASSWORD:?}" --silent
check "redis" redis-cli -a "${RADIUS_PRO_REDIS_PASSWORD:?}" ping
check "freeradius-config" freeradius -XC
check "freeradius-service" systemctl is-active --quiet freeradius
check "l2tp-service" systemctl is-active --quiet xl2tpd
check "ipsec-service" systemctl is-active --quiet strongswan-starter
check "pptp-service" systemctl is-active --quiet pptpd
check "sstp-service" systemctl is-active --quiet accel-ppp
check "vpn-api" curl -fsS http://127.0.0.1:8080/health
check "coa-api" curl -fsS http://127.0.0.1:8082/health
check "coa-api-service" systemctl is-active --quiet radius-pro-coa
check "nginx" systemctl is-active --quiet nginx
check "application" curl -fsS http://127.0.0.1:3000/health

if (( failures > 0 )); then
  printf 'INSTALLATION_VERIFICATION_FAILED count=%d\n' "$failures" >&2
  exit 1
fi

printf 'INSTALLATION_VERIFICATION_OK\n'

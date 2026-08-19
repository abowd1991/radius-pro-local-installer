#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load installer functions only; never invoke its main installation routine.
# A real temporary pathname preserves the installer's self-location logic.
TEST_INSTALLER="$(mktemp "$ROOT_DIR/.installer-preflight.XXXXXX")"
trap 'rm -f "$TEST_INSTALLER"' EXIT
sed '/^main "\$@"$/d' "$ROOT_DIR/install.sh" > "$TEST_INSTALLER"
# shellcheck disable=SC1090
source "$TEST_INSTALLER"

require_root() { :; }
mkdir() { :; }
touch() { :; }
chmod() { :; }
log() { :; }

run_case() {
  local version="$1"
  local expected="$2"
  local os_file
  os_file="$(mktemp)"
  cat > "$os_file" <<EOF
ID=ubuntu
VERSION_ID="${version}"
PRETTY_NAME="Ubuntu ${version} LTS"
EOF

  if (RADIUS_PRO_OS_RELEASE_FILE="$os_file" check_system >/dev/null 2>&1); then
    actual="pass"
  else
    actual="fail"
  fi
  rm -f "$os_file"
  [[ "$actual" == "$expected" ]] || {
    printf 'preflight case %s: expected %s, got %s\n' "$version" "$expected" "$actual" >&2
    exit 1
  }
}

for version in 20.04 22.04 24.04 26.04; do
  run_case "$version" pass
done
run_case 23.10 fail
run_case 18.04 fail

grep -Fq 'for candidate in libsnmp-dev libnet-snmp-dev; do' "$ROOT_DIR/install.sh"
grep -Fq '"$snmp_dev_package"' "$ROOT_DIR/install.sh"
grep -Fq 'install -m 0644 "$nodesource_keyring" /etc/apt/keyrings/nodesource.gpg' "$ROOT_DIR/install.sh"
grep -Fq "grep -Fq 'deb.nodesource.com' \"\$source_file\"" "$ROOT_DIR/install.sh"
grep -Fq 'rm -f /etc/apt/keyrings/nodesource.gpg' "$ROOT_DIR/install.sh"
grep -Fq 'local pcre_package="libpcre2-dev"' "$ROOT_DIR/install.sh"
grep -Fq 'local accel_pppd_bin="/usr/local/sbin/accel-pppd"' "$ROOT_DIR/install.sh"
grep -Fq 'ExecStart=/usr/local/sbin/accel-pppd' "$ROOT_DIR/install.sh"
test -f "$ROOT_DIR/scripts/bootstrap-owner.mjs"
grep -Fq 'install -m 0600 "${INSTALLER_SOURCE_DIR}/scripts/bootstrap-owner.mjs" "$INSTALL_DIR/scripts/bootstrap-owner.mjs"' "$ROOT_DIR/install.sh"
grep -Fq 'reusing installer secrets from interrupted installation' "$ROOT_DIR/install.sh"
grep -Fq 'mysql --protocol=socket -uroot "-p${MYSQL_ROOT_PASSWORD}" -e' "$ROOT_DIR/install.sh"

printf 'INSTALLER_PREFLIGHT_TEST_OK\n'

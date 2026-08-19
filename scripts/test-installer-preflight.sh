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
grep -Fq 'RADIUS_PRO_RESET_MYSQL:-0' "$ROOT_DIR/install.sh"
grep -Fq 'mysqld --initialize-insecure --user=mysql --datadir=/var/lib/mysql' "$ROOT_DIR/install.sh"
grep -Fq 'JWT_SECRET=${JWT_SECRET}' "$ROOT_DIR/install.sh"
grep -Fq 'if [[ -z "${JWT_SECRET:-}" ]]; then' "$ROOT_DIR/install.sh"
grep -Fq 'source "$INSTALL_DIR/.env"' "$ROOT_DIR/install.sh"
grep -Fq 'database migrations did not create radius_pro.users' "$ROOT_DIR/install.sh"
grep -Fq 'database migrations did not create radius_pro.users.preferredCurrency' "$ROOT_DIR/install.sh"
grep -Fq 'ADMIN_PASSWORD="${RADIUS_PRO_ADMIN_PASSWORD:-admin}"' "$ROOT_DIR/install.sh"
grep -Fq 'pool {' "$ROOT_DIR/install.sh"
! grep -Fq 'pool { start =' "$ROOT_DIR/install.sh"
grep -Fq '${BASH_SOURCE[0]:-}' "$ROOT_DIR/install.sh"
grep -Fq 'explicit clean-test reset requested' "$ROOT_DIR/install.sh"
grep -Fq 'rm -rf "$INSTALL_DIR" "$CONFIG_DIR"' "$ROOT_DIR/install.sh"
grep -Fq 'pm2 startup systemd -u root --hp /root >/dev/null' "$ROOT_DIR/install.sh"
! grep -Fq 'pm2 startup systemd -u root --hp /root | tail -n 1 | bash' "$ROOT_DIR/install.sh"
grep -Fq 'ufw allow in proto gre from any to any comment "PPTP GRE"' "$ROOT_DIR/install.sh"
! grep -Fq 'ufw allow proto gre comment "PPTP GRE"' "$ROOT_DIR/install.sh"
grep -Fq 'Type=forking' "$ROOT_DIR/install.sh"
grep -Fq 'PIDFile=/run/accel-ppp.pid' "$ROOT_DIR/install.sh"
grep -Fq 'Restart=on-failure' "$ROOT_DIR/install.sh"
grep -Fq 'systemctl reload nginx' "$ROOT_DIR/install.sh"
grep -Fq 'systemctl start nginx' "$ROOT_DIR/install.sh"
grep -Fq 'redirectPath = "/login"' "$ROOT_DIR/app/client/src/_core/hooks/useAuth.ts"
grep -Fq 'if (!oauthPortalUrl || !appId) return "/login";' "$ROOT_DIR/app/client/src/const.ts"
while IFS= read -r -d '' migration; do
  statements=$(grep -cE ';[[:space:]]*$' "$migration" || true)
  breakpoints=$(grep -c '^--> statement-breakpoint$' "$migration" || true)
  if (( statements > 1 && breakpoints != statements - 1 )); then
    printf 'Migration has unsplit SQL statements: %s\n' "$migration" >&2
    exit 1
  fi
done < <(find "$ROOT_DIR/app/drizzle" -maxdepth 1 -type f -name '*.sql' -print0)
if grep -RInE 'ADD[[:space:]]+COLUMN[[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS' "$ROOT_DIR/app/drizzle"/*.sql; then
  printf 'MySQL-incompatible ADD COLUMN IF NOT EXISTS was found in migrations\n' >&2
  exit 1
fi
grep -Fq "ALTER TABLE \`users\` ADD \`preferredCurrency\` enum('USD','ILS','JOD','SAR','AED','EGP','YER') DEFAULT 'USD' NOT NULL;" "$ROOT_DIR/app/drizzle/0112_repair_users_preferred_currency.sql"

printf 'INSTALLER_PREFLIGHT_TEST_OK\n'

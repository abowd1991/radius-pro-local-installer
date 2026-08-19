#!/usr/bin/env bash
# Radius Pro Local V2 — Official Production Installer
# Fresh supported Ubuntu LTS installations only.
set -Eeuo pipefail
umask 077

readonly INSTALLER_REPOSITORY="https://github.com/abowd1991/radius-pro-local-installer.git"
readonly INSTALLER_REF="${RADIUS_PRO_INSTALLER_REF:-v3.1.5}"
readonly INSTALLER_WORKDIR="/root/radius-pro-installer"
readonly INSTALLER_SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
readonly INSTALLER_SOURCE_DIR="$(cd "$(dirname "$INSTALLER_SCRIPT_PATH")" && pwd)"
RELEASE_VERSION=""
readonly INSTALL_DIR="/opt/radius-pro"
readonly CONFIG_DIR="/etc/radius-pro"
readonly LOG_DIR="/var/log/radius-pro"
readonly BACKUP_DIR="/var/backups/radius-pro"
readonly RADIUS_DIR="/etc/freeradius/3.0"
readonly INSTALL_LOG="/var/log/radius-pro-install.log"
readonly ACCEL_PPP_COMMIT="b8f6eafe61ffcf6645a51cc2bc13c93cab4955fe"
readonly NODESOURCE_KEY_FINGERPRINT="6F71F525282841EEDAF851B42F59B5F99B1BE0B4"

log() { printf '[radius-pro] %s\n' "$*" | tee -a "$INSTALL_LOG"; }
die() { printf '[radius-pro] ERROR: %s\n' "$*" >&2; exit 1; }
require_root() { [[ ${EUID} -eq 0 ]] || die "run as root"; }
random_hex() { openssl rand -hex "$1"; }
public_ipv4() { curl -4fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}'; }

bootstrap_from_remote() {
  if [[ -d "${INSTALLER_SOURCE_DIR}/app" && -d "${INSTALLER_SOURCE_DIR}/services" && -d "${INSTALLER_SOURCE_DIR}/templates" ]]; then
    return
  fi
  if ! command -v git >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq git ca-certificates
  fi
  rm -rf "$INSTALLER_WORKDIR"
  git clone --depth 1 --branch "$INSTALLER_REF" "$INSTALLER_REPOSITORY" "$INSTALLER_WORKDIR"
  exec bash "$INSTALLER_WORKDIR/install.sh" "$@"
}

load_release_version() {
  RELEASE_VERSION="$(tr -d '\n' < "${INSTALLER_SOURCE_DIR}/VERSION")"
  [[ -n "$RELEASE_VERSION" ]] || die "official installer VERSION is missing"
}

on_error() {
  local code=$?
  printf '[radius-pro] installer failed at line %s (exit %s)\n' "$1" "$code" | tee -a "$INSTALL_LOG" >&2
  exit "$code"
}
trap 'on_error $LINENO' ERR

check_system() {
  require_root
  local os_release_file="${RADIUS_PRO_OS_RELEASE_FILE:-/etc/os-release}"
  [[ -r "$os_release_file" ]] || die "Ubuntu LTS is required; unable to read ${os_release_file}"
  # shellcheck disable=SC1090
  . "$os_release_file"
  [[ "$ID" == "ubuntu" ]] || die "Ubuntu Server LTS is required; found ${PRETTY_NAME:-unknown}"
  case "$VERSION_ID" in
    20.04|22.04|24.04|26.04) ;;
    *) die "supported releases are Ubuntu 20.04, 22.04, 24.04 and 26.04 LTS; found ${PRETTY_NAME:-unknown}" ;;
  esac
  [[ "$(dpkg --print-architecture)" == "amd64" ]] || die "only Ubuntu amd64 is currently supported"
  (( $(free -m | awk '/^Mem:/{print $2}') >= 1024 )) || die "at least 1 GiB RAM is required"
  (( $(df -Pm / | awk 'NR==2 {print $4}') >= 10240 )) || die "at least 10 GiB free disk is required"
  [[ ! -e "$INSTALL_DIR/.release-manifest" ]] || die "an existing Radius Pro release was found; this installer is fresh-install only"
  mkdir -p "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"
  touch "$INSTALL_LOG"
  chmod 600 "$INSTALL_LOG"
  log "system checks passed for Ubuntu ${VERSION_ID} LTS / Radius Pro ${RELEASE_VERSION}"
}

create_secrets() {
  PUBLIC_IP="${RADIUS_PRO_PUBLIC_IP:-$(public_ipv4)}"
  [[ -n "$PUBLIC_IP" ]] || die "unable to determine public IPv4; set RADIUS_PRO_PUBLIC_IP before running"
  DOMAIN="${RADIUS_PRO_DOMAIN:-$PUBLIC_IP}"
  ADMIN_USERNAME="${RADIUS_PRO_ADMIN_USERNAME:-admin}"
  ADMIN_EMAIL="${RADIUS_PRO_ADMIN_EMAIL:-admin@${DOMAIN}}"
  ADMIN_PASSWORD="${RADIUS_PRO_ADMIN_PASSWORD:-$(random_hex 16)}"
  MYSQL_ROOT_PASSWORD="$(random_hex 32)"
  APP_DB_PASSWORD="$(random_hex 32)"
  RADIUS_DB_PASSWORD="$(random_hex 32)"
  REDIS_PASSWORD="$(random_hex 32)"
  JWT_SECRET="$(random_hex 48)"
  LOCAL_RADIUS_SECRET="$(random_hex 24)"
  VPN_IPSEC_PSK="${RADIUS_PRO_VPN_PSK:-$(random_hex 24)}"
  VPN_API_KEY="$(random_hex 32)"
  COA_API_KEY="$(random_hex 32)"
  cat > "$CONFIG_DIR/installer.env" <<EOF
RADIUS_PRO_VERSION=${RELEASE_VERSION}
RADIUS_PRO_PUBLIC_IP=${PUBLIC_IP}
RADIUS_PRO_DOMAIN=${DOMAIN}
RADIUS_PRO_ADMIN_USERNAME=${ADMIN_USERNAME}
RADIUS_PRO_ADMIN_EMAIL=${ADMIN_EMAIL}
RADIUS_PRO_ADMIN_PASSWORD=${ADMIN_PASSWORD}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
RADIUS_PRO_APP_DB_PASSWORD=${APP_DB_PASSWORD}
RADIUS_PRO_RADIUS_DB_PASSWORD=${RADIUS_DB_PASSWORD}
RADIUS_PRO_REDIS_PASSWORD=${REDIS_PASSWORD}
RADIUS_PRO_LOCAL_RADIUS_SECRET=${LOCAL_RADIUS_SECRET}
RADIUS_PRO_VPN_PSK=${VPN_IPSEC_PSK}
RADIUS_PRO_VPN_API_KEY=${VPN_API_KEY}
VPS_COA_API_KEY=${COA_API_KEY}
EOF
  chmod 600 "$CONFIG_DIR/installer.env"
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  local source_file
  while IFS= read -r -d '' source_file; do
    if grep -Fq 'deb.nodesource.com' "$source_file"; then
      rm -f "$source_file"
    fi
  done < <(find /etc/apt/sources.list.d -maxdepth 1 -type f -print0 2>/dev/null)
  rm -f /etc/apt/keyrings/nodesource.gpg
  apt-get update -qq
  apt-get install -y -qq software-properties-common
  if command -v add-apt-repository >/dev/null 2>&1; then
    add-apt-repository -y universe >/dev/null 2>&1 || true
  fi
  apt-get update -qq

  local pcre_package="libpcre3-dev"
  if ! apt-cache show "$pcre_package" >/dev/null 2>&1; then
    pcre_package="libpcre2-dev"
  fi
  apt-cache show "$pcre_package" >/dev/null 2>&1 || die "no supported PCRE development package is available"

  local mysql_dev_package="libmysqlclient-dev"
  if ! apt-cache show "$mysql_dev_package" >/dev/null 2>&1; then
    mysql_dev_package="default-libmysqlclient-dev"
  fi
  apt-cache show "$mysql_dev_package" >/dev/null 2>&1 || die "no MySQL client development package is available"

  local snmp_dev_package=""
  for candidate in libsnmp-dev libnet-snmp-dev; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      snmp_dev_package="$candidate"
      break
    fi
  done
  [[ -n "$snmp_dev_package" ]] || die "no supported Net-SNMP development package is available"

  apt-get install -y -qq \
    ca-certificates curl git gnupg lsb-release unzip zip jq \
    build-essential cmake pkg-config \
    "$pcre_package" libssl-dev liblua5.3-dev libpq-dev "$mysql_dev_package" \
    libgnutls28-dev libreadline-dev libcap-dev libmnl-dev "$snmp_dev_package" \
    mysql-server redis-server nginx ufw fail2ban cron logrotate \
    freeradius freeradius-mysql freeradius-utils \
    strongswan strongswan-starter strongswan-pki libcharon-extra-plugins xl2tpd ppp pptpd \
    python3 python3-pip python3-venv python3-pymysql python3-mysql.connector python3-flask \
    openssl net-tools iptables

  if apt-cache show "linux-headers-$(uname -r)" >/dev/null 2>&1; then
    apt-get install -y -qq "linux-headers-$(uname -r)"
  else
    log "kernel headers for $(uname -r) are unavailable; continuing because accel-ppp is built without a kernel driver"
  fi

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22.* ]]; then
    install -d -m 0755 /etc/apt/keyrings
    local nodesource_key="/tmp/nodesource-node22.gpg.key"
    local nodesource_keyring="/tmp/nodesource-node22.gpg"
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$nodesource_key"
    local actual_fingerprint
    actual_fingerprint="$(gpg --show-keys --with-colons "$nodesource_key" | awk -F: '$1 == "fpr" {print toupper($10); exit}')"
    [[ "$actual_fingerprint" == "$NODESOURCE_KEY_FINGERPRINT" ]] || die "NodeSource signing key fingerprint verification failed"
    gpg --dearmor --yes --output "$nodesource_keyring" "$nodesource_key"
    install -m 0644 "$nodesource_keyring" /etc/apt/keyrings/nodesource.gpg
    rm -f "$nodesource_key" "$nodesource_keyring"
    printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
  fi
  command -v pnpm >/dev/null 2>&1 || npm install --global pnpm@10
  command -v pm2 >/dev/null 2>&1 || npm install --global pm2
  log "system packages, Node.js, pnpm and PM2 installed"
}

install_accel_ppp() {
  if /usr/sbin/accel-pppd -V 2>/dev/null | grep -q "${ACCEL_PPP_COMMIT:0:8}"; then
    log "accel-ppp reference build already present"
    return
  fi
  local source_dir="/usr/local/src/accel-ppp-${ACCEL_PPP_COMMIT:0:8}"
  rm -rf "$source_dir"
  git clone https://github.com/accel-ppp/accel-ppp.git "$source_dir"
  git -C "$source_dir" checkout --detach "$ACCEL_PPP_COMMIT"
  cmake -S "$source_dir" -B "$source_dir/build" \
    -DBUILD_DRIVER=FALSE -DCMAKE_BUILD_TYPE=Release -DRADIUS=FALSE -DNETSNMP=FALSE -DSHAPER=FALSE
  cmake --build "$source_dir/build" --parallel "$(nproc)"
  cmake --install "$source_dir/build"
  /usr/sbin/accel-pppd -V | grep -q "${ACCEL_PPP_COMMIT:0:8}" || die "accel-ppp build verification failed"
  log "accel-ppp ${ACCEL_PPP_COMMIT:0:8} installed"
}

configure_mysql() {
  source "$CONFIG_DIR/installer.env"
  systemctl enable --now mysql
  mysql --protocol=socket -uroot <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS radius_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'radiuspro'@'localhost' IDENTIFIED BY '${RADIUS_PRO_APP_DB_PASSWORD}';
ALTER USER 'radiuspro'@'localhost' IDENTIFIED BY '${RADIUS_PRO_APP_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON radius_pro.* TO 'radiuspro'@'localhost';
CREATE USER IF NOT EXISTS 'freeradius'@'localhost' IDENTIFIED BY '${RADIUS_PRO_RADIUS_DB_PASSWORD}';
ALTER USER 'freeradius'@'localhost' IDENTIFIED BY '${RADIUS_PRO_RADIUS_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON radius_pro.* TO 'freeradius'@'localhost';
FLUSH PRIVILEGES;
SQL
  cat > /root/.mysql_credentials <<EOF
MYSQL_ROOT_PASS=${MYSQL_ROOT_PASSWORD}
MYSQL_APP_PASS=${RADIUS_PRO_APP_DB_PASSWORD}
MYSQL_RADIUS_PASS=${RADIUS_PRO_RADIUS_DB_PASSWORD}
EOF
  chmod 600 /root/.mysql_credentials
  log "local MySQL database and least-privilege accounts configured"
}

configure_redis() {
  source "$CONFIG_DIR/installer.env"
  cat > /etc/redis/redis.conf <<EOF
bind 127.0.0.1 ::1
protected-mode yes
port 6379
requirepass ${RADIUS_PRO_REDIS_PASSWORD}
supervised systemd
daemonize no
appendonly no
save 900 1
save 300 10
maxmemory 256mb
maxmemory-policy allkeys-lru
dir /var/lib/redis
logfile /var/log/redis/redis-server.log
EOF
  systemctl enable redis-server
  systemctl restart redis-server
  redis-cli -a "$RADIUS_PRO_REDIS_PASSWORD" ping | grep -q PONG
  log "Redis configured as an authenticated loopback-only service"
}

stage_application() {
  rm -rf "$INSTALL_DIR"
  install -d -m 0750 "$INSTALL_DIR"
  cp -a "${INSTALLER_SOURCE_DIR}/app/." "$INSTALL_DIR/"
  cp "${INSTALLER_SOURCE_DIR}/services/coa-api.py" "$INSTALL_DIR/coa_api.py"
  mkdir -p "$INSTALL_DIR/uploads"
  chmod 0750 "$INSTALL_DIR/uploads"
  source "$CONFIG_DIR/installer.env"
  cat > "$INSTALL_DIR/.env" <<EOF
NODE_ENV=production
PORT=3000
TZ=UTC
DATABASE_URL=mysql://radiuspro:${RADIUS_PRO_APP_DB_PASSWORD}@127.0.0.1:3306/radius_pro
JWT_SECRET=${JWT_SECRET}
REDIS_URL=redis://:${RADIUS_PRO_REDIS_PASSWORD}@127.0.0.1:6379
LOCAL_STORAGE_ENABLED=true
LOCAL_STORAGE_DIR=${INSTALL_DIR}/uploads
OWNER_OPEN_ID=local_admin_owner
OWNER_NAME=Administrator
VPS_PUBLIC_IP=${RADIUS_PRO_PUBLIC_IP}
VPS_LEGACY_URL=http://127.0.0.1:8080
VPS_LEGACY_SECRET=${RADIUS_PRO_VPN_API_KEY}
VPS_MANAGEMENT_URL=http://127.0.0.1:8080
VPS_MANAGEMENT_API_KEY=${RADIUS_PRO_VPN_API_KEY}
VPS_COA_API_URL=http://127.0.0.1:8082
VPS_COA_API_KEY=${VPS_COA_API_KEY}
VPS_SSH_HOST=127.0.0.1
VPS_SSH_PORT=22
VPS_SSH_USER=root
EOF
  chmod 600 "$INSTALL_DIR/.env"
  cd "$INSTALL_DIR"
  pnpm install --frozen-lockfile
  pnpm exec tsx scripts/run-migrations.ts
  set -a
  source "$INSTALL_DIR/.env"
  source "$CONFIG_DIR/installer.env"
  set +a
  node scripts/bootstrap-owner.mjs
  pnpm build
  cat > "$INSTALL_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: "radius-pro",
    script: "./dist/index.js",
    cwd: "${INSTALL_DIR}",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 10,
    env: { NODE_ENV: "production", PORT: 3000, TZ: "UTC" }
  }]
};
EOF
  cat > "$INSTALL_DIR/.release-manifest" <<EOF
version=${RELEASE_VERSION}
installed_at=$(date -u +%FT%TZ)
storage=local
EOF
  log "application package built, migrated and configured for local storage"
}

configure_radius() {
  source "$CONFIG_DIR/installer.env"
  if ! mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -Nse "SHOW TABLES FROM radius_pro LIKE 'radcheck'" | grep -qx 'radcheck'; then
    mysql -uroot -p"$MYSQL_ROOT_PASSWORD" radius_pro < "$RADIUS_DIR/mods-config/sql/main/mysql/schema.sql"
  fi
  install -d -o freerad -g freerad -m 0750 "$RADIUS_DIR/dynamic-clients"
  cat > "$RADIUS_DIR/mods-available/sql" <<EOF
sql {
  driver = "rlm_sql_mysql"
  dialect = "mysql"
  server = "127.0.0.1"
  port = 3306
  login = "freeradius"
  password = "${RADIUS_PRO_RADIUS_DB_PASSWORD}"
  radius_db = "radius_pro"
  read_clients = yes
  client_table = "nas"
  authcheck_table = "radcheck"
  authreply_table = "radreply"
  groupcheck_table = "radgroupcheck"
  groupreply_table = "radgroupreply"
  usergroup_table = "radusergroup"
  acct_table1 = "radacct"
  acct_table2 = "radacct"
  postauth_table = "radpostauth"
  pool { start = 5 min = 3 max = 32 spare = 3 uses = 0 lifetime = 0 idle_timeout = 60 }
}
EOF
  install -m 0640 "${INSTALLER_SOURCE_DIR}/templates/freeradius/default" "$RADIUS_DIR/sites-available/default"
  install -m 0640 "${INSTALLER_SOURCE_DIR}/templates/freeradius/exec" "$RADIUS_DIR/mods-available/exec"
  ln -sfn "$RADIUS_DIR/mods-available/sql" "$RADIUS_DIR/mods-enabled/sql"
  ln -sfn "$RADIUS_DIR/mods-available/exec" "$RADIUS_DIR/mods-enabled/exec"
  ln -sfn "$RADIUS_DIR/mods-available/dynamic_clients" "$RADIUS_DIR/mods-enabled/dynamic_clients"
  ln -sfn "$RADIUS_DIR/sites-available/default" "$RADIUS_DIR/sites-enabled/default"
  cat > "$RADIUS_DIR/clients.conf" <<EOF
client localhost {
  ipaddr = 127.0.0.1
  secret = ${RADIUS_PRO_LOCAL_RADIUS_SECRET}
  shortname = localhost
  require_message_authenticator = no
}
EOF
  install -m 0750 "${INSTALLER_SOURCE_DIR}/services/radius-authorization-bridge.sh" /usr/local/bin/radius-authorization-bridge.sh
  install -m 0750 "${INSTALLER_SOURCE_DIR}/services/radius-accounting-bridge.sh" /usr/local/bin/radius-accounting-bridge.sh
  chown -R freerad:freerad "$RADIUS_DIR/dynamic-clients" "$RADIUS_DIR/mods-available/sql" "$RADIUS_DIR/mods-available/exec"
  freeradius -XC
  systemctl enable freeradius
  log "FreeRADIUS configured with fail-closed NAS isolation and V2 bridges"
}

configure_vpn() {
  source "$CONFIG_DIR/installer.env"
  cat > /etc/ipsec.conf <<'EOF'
config setup
    charondebug="ike 2, knl 1, cfg 0, net 1"
    uniqueids=no
conn %default
    ikelifetime=24h
    keylife=8h
    margintime=9m
    rekeymargin=3m
    keyingtries=1
    keyexchange=ikev1
    authby=secret
conn L2TP-PSK
    keyexchange=ikev1
    left=%defaultroute
    leftprotoport=17/1701
    right=%any
    rightprotoport=17/%any
    type=transport
    auto=add
    dpddelay=30
    dpdtimeout=120
    dpdaction=clear
    forceencaps=yes
    ike=aes128-sha1-modp2048,aes256-sha1-modp2048,aes128-sha256-modp2048,aes256-sha256-modp2048,3des-sha1-modp1024,aes128-sha1-modp1024!
    esp=aes128-sha1-modp2048,aes256-sha1-modp2048,aes128-sha1-modp1024,aes256-sha1-modp1024,aes128-sha1,aes256-sha1,3des-sha1-modp1024,3des-sha1!
EOF
  printf ': PSK "%s"\n' "$RADIUS_PRO_VPN_PSK" > /etc/ipsec.secrets
  chmod 600 /etc/ipsec.secrets
  cat > /etc/xl2tpd/xl2tpd.conf <<'EOF'
[global]
ipsec saref = yes
saref refinfo = 30
port = 1701
[lns default]
ip range = 192.168.30.10-192.168.30.250
local ip = 192.168.30.1
require chap = yes
refuse pap = yes
require authentication = yes
name = VPN
ppp debug = yes
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
EOF
  cat > /etc/ppp/options.xl2tpd <<'EOF'
ipcp-accept-local
ipcp-accept-remote
ms-dns 8.8.8.8
ms-dns 8.8.4.4
noccp
auth
mtu 1400
mru 1400
proxyarp
lcp-echo-failure 4
lcp-echo-interval 30
connect-delay 5000
nodefaultroute
EOF
  cat > /etc/pptpd.conf <<'EOF'
option /etc/ppp/pptpd-options
logwtmp
localip 192.168.32.1
remoteip 192.168.32.10-245
EOF
  cat > /etc/ppp/pptpd-options <<'EOF'
name pptpd
refuse-pap
refuse-chap
refuse-mschap
require-mschap-v2
ms-dns 8.8.8.8
ms-dns 8.8.4.4
proxyarp
lock
nobsdcomp
novj
novjccomp
nologfd
EOF
  printf '# Managed by Radius Pro VPN API\n' > /etc/ppp/chap-secrets
  chmod 600 /etc/ppp/chap-secrets
  install -d -m 0750 /etc/accel-ppp /var/log/accel-ppp
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout /etc/accel-ppp/server.key -out /etc/accel-ppp/server.crt \
    -subj "/CN=${RADIUS_PRO_PUBLIC_IP}" >/dev/null 2>&1
  chmod 600 /etc/accel-ppp/server.key
  cat > /etc/accel-ppp.conf <<'EOF'
[modules]
log_syslog
sstp
auth_mschap_v2
chap-secrets
ippool
cli
[common]
check-ip=1
[core]
thread-count=4
log-error=/var/log/accel-ppp/core.log
[log]
log-file=/var/log/accel-ppp/accel-ppp.log
log-emerg=/var/log/accel-ppp/emerg.log
copy=1
level=3
[sstp]
port=8443
ssl-pemfile=/etc/accel-ppp/server.crt
ssl-keyfile=/etc/accel-ppp/server.key
verbose=1
accept=ssl
ifname=sstp%d
ip-pool=sstp_pool
[client-ip-range]
0.0.0.0/1
128.0.0.0/2
224.0.0.0/3
208.0.0.0/4
200.0.0.0/5
196.0.0.0/6
194.0.0.0/7
193.0.0.0/8
192.0.0.0/9
192.192.0.0/10
192.128.0.0/11
192.176.0.0/12
192.160.0.0/13
192.172.0.0/14
192.170.0.0/15
192.169.0.0/16
192.168.128.0/17
192.168.64.0/18
192.168.32.0/19
192.168.0.0/20
192.168.16.0/21
192.168.24.0/22
192.168.28.0/23
192.168.30.0/24
[chap-secrets]
gw-ip-address=192.168.31.1
chap-secrets=/etc/ppp/chap-secrets
[ppp]
mtu=1400
mru=1400
verbose=1
min-mtu=1280
mppe=require
[dns]
dns1=8.8.8.8
dns2=8.8.4.4
[ip-pool]
gw-ip-address=192.168.31.1
192.168.31.100-192.168.31.254,sstp_pool
[cli]
tcp=127.0.0.1:2001
sessions-columns=ifname,username,ip,type,state,uptime
EOF
  cat > /etc/systemd/system/accel-ppp.service <<'EOF'
[Unit]
Description=Accel-PPP VPN daemon
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStart=/usr/sbin/accel-pppd -c /etc/accel-ppp.conf -p /run/accel-ppp.pid -d
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  cat > /etc/sysctl.d/99-radius-pro.conf <<'EOF'
net.ipv4.ip_forward=1
EOF
  sysctl --system >/dev/null
  log "L2TP/IPsec, PPTP and SSTP configuration staged"
}

configure_local_apis() {
  source "$CONFIG_DIR/installer.env"
  install -m 0750 "${INSTALLER_SOURCE_DIR}/services/vpn-api.py" /opt/vpn-api.py
  install -m 0750 "${INSTALLER_SOURCE_DIR}/services/coa-api.py" /opt/radius-pro/coa_api.py
  cat > "$CONFIG_DIR/vpn-api.env" <<EOF
RADIUS_PRO_VPN_API_HOST=127.0.0.1
RADIUS_PRO_VPN_API_PORT=8080
RADIUS_PRO_VPN_API_KEY=${RADIUS_PRO_VPN_API_KEY}
RADIUS_PRO_DB_HOST=127.0.0.1
RADIUS_PRO_DB_PORT=3306
RADIUS_PRO_DB_USER=radiuspro
RADIUS_PRO_DB_PASSWORD=${RADIUS_PRO_APP_DB_PASSWORD}
RADIUS_PRO_DB_NAME=radius_pro
RADIUS_PRO_L2TP_POOL_START=192.168.30.10
RADIUS_PRO_L2TP_POOL_END=192.168.30.250
RADIUS_PRO_L2TP_LOCAL_IP=192.168.30.1
RADIUS_PRO_SSTP_POOL_START=192.168.31.100
RADIUS_PRO_SSTP_POOL_END=192.168.31.254
RADIUS_PRO_SSTP_LOCAL_IP=192.168.31.1
RADIUS_PRO_PPTP_POOL_START=192.168.32.10
RADIUS_PRO_PPTP_POOL_END=192.168.32.245
RADIUS_PRO_PPTP_LOCAL_IP=192.168.32.1
EOF
  cat > "$CONFIG_DIR/coa-api.env" <<EOF
VPS_COA_API_KEY=${VPS_COA_API_KEY}
EOF
  chmod 600 "$CONFIG_DIR/vpn-api.env" "$CONFIG_DIR/coa-api.env"
  cat > /etc/systemd/system/radius-pro-vpn-api.service <<'EOF'
[Unit]
Description=Radius Pro local VPN API
After=network-online.target mysql.service
Wants=network-online.target
[Service]
Type=simple
EnvironmentFile=/etc/radius-pro/vpn-api.env
ExecStart=/usr/bin/python3 /opt/vpn-api.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  cat > /etc/systemd/system/radius-pro-coa.service <<'EOF'
[Unit]
Description=Radius Pro local CoA API
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
EnvironmentFile=/etc/radius-pro/coa-api.env
WorkingDirectory=/opt/radius-pro
ExecStart=/usr/bin/python3 /opt/radius-pro/coa_api.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  log "loopback-only VPN and CoA APIs configured"
}

configure_application_and_proxy() {
  source "$CONFIG_DIR/installer.env"
  cd "$INSTALL_DIR"
  pm2 start ecosystem.config.cjs --only radius-pro
  pm2 save
  env PATH="$PATH" pm2 startup systemd -u root --hp /root | tail -n 1 | bash
  cat > /etc/nginx/sites-available/radius-pro <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 50m;
    location = /api/radius/accounting {
        allow 127.0.0.1;
        allow ::1;
        deny all;
        proxy_pass http://127.0.0.1:3000;
    }
    location = /api/radius/authorize-card {
        allow 127.0.0.1;
        allow ::1;
        deny all;
        proxy_pass http://127.0.0.1:3000;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
  ln -sfn /etc/nginx/sites-available/radius-pro /etc/nginx/sites-enabled/radius-pro
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  log "PM2 application and Nginx reverse proxy configured"
}

configure_firewall_and_maintenance() {
  source "$CONFIG_DIR/installer.env"
  local ssh_port="${RADIUS_PRO_SSH_PORT:-22}"
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${ssh_port}/tcp" comment "SSH"
  ufw allow 80/tcp comment "Radius Pro HTTP"
  ufw allow 1812/udp comment "RADIUS authentication"
  ufw allow 1813/udp comment "RADIUS accounting"
  ufw allow 3799/udp comment "RADIUS CoA"
  ufw allow 500/udp comment "IPsec IKE"
  ufw allow 4500/udp comment "IPsec NAT-T"
  ufw allow 1701/udp comment "L2TP"
  ufw allow 1723/tcp comment "PPTP"
  ufw allow proto gre comment "PPTP GRE"
  ufw allow 8443/tcp comment "SSTP"
  ufw --force enable
  cat > /usr/local/bin/radius-pro-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /root/.mysql_credentials
stamp=$(date -u +%Y%m%d-%H%M%S)
target=/var/backups/radius-pro
mkdir -p "$target"
mysqldump -uroot -p"$MYSQL_ROOT_PASS" --single-transaction --routines --triggers radius_pro | gzip > "$target/radius_pro_${stamp}.sql.gz"
items=(/etc/radius-pro /etc/freeradius /etc/ipsec.conf /etc/ipsec.secrets /etc/xl2tpd /etc/ppp /etc/accel-ppp.conf /etc/nginx/sites-enabled/radius-pro /opt/radius-pro/.env /opt/radius-pro/.release-manifest /opt/radius-pro/uploads /opt/vpn-api.py)
[[ -f /var/lib/redis/dump.rdb ]] && items+=(/var/lib/redis/dump.rdb)
tar -czf "$target/radius_pro_config_${stamp}.tar.gz" "${items[@]}"
find "$target" -type f -mtime +30 -delete
EOF
  chmod 700 /usr/local/bin/radius-pro-backup
  install -m 0700 "${INSTALLER_SOURCE_DIR}/scripts/radius-pro-restore" /usr/local/bin/radius-pro-restore
  install -m 0700 "${INSTALLER_SOURCE_DIR}/scripts/radius-pro-verify-backup" /usr/local/bin/radius-pro-verify-backup
  cat > /etc/cron.d/radius-pro-backup <<'EOF'
0 2 * * * root /usr/local/bin/radius-pro-backup >/var/log/radius-pro/backup.log 2>&1
EOF
  cat > /etc/logrotate.d/radius-pro <<'EOF'
/var/log/radius-pro/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
}
EOF
  systemctl enable --now cron fail2ban
  log "firewall, backup and log rotation configured"
}

start_and_verify() {
  source "$CONFIG_DIR/installer.env"
  systemctl enable --now strongswan-starter xl2tpd pptpd accel-ppp radius-pro-vpn-api radius-pro-coa freeradius nginx
  sleep 5
  set -a
  source "$CONFIG_DIR/installer.env"
  set +a
  "${INSTALLER_SOURCE_DIR}/scripts/verify-install.sh"
  /usr/local/bin/radius-pro-backup
  cat > /root/AGENTS.md <<EOF
# Radius Pro Local V2 — Production Installation

- Release: ${RELEASE_VERSION}
- App: ${INSTALL_DIR}
- App environment: ${INSTALL_DIR}/.env
- System secrets: ${CONFIG_DIR}/installer.env
- VPN API environment: ${CONFIG_DIR}/vpn-api.env
- MySQL credentials: /root/.mysql_credentials
- Backups: ${BACKUP_DIR}
- Verification: /root/radius-pro-installer/scripts/verify-install.sh
- Health: curl http://127.0.0.1:3000/health

The installed system uses local MySQL, Redis, local file storage, FreeRADIUS 3, L2TP/IPsec, PPTP and SSTP on 8443. NAS isolation is fail-closed in FreeRADIUS. Do not modify FreeRADIUS, VPN or firewall settings without a full backup and explicit approval.
EOF
  chmod 600 /root/AGENTS.md
  log "Radius Pro ${RELEASE_VERSION} installation completed successfully"
  printf '\nInstallation complete. Credentials are stored at %s/installer.env\n' "$CONFIG_DIR"
}

main() {
  bootstrap_from_remote "$@"
  load_release_version
  check_system
  create_secrets
  install_packages
  install_accel_ppp
  configure_mysql
  configure_redis
  stage_application
  configure_radius
  configure_vpn
  configure_local_apis
  configure_application_and_proxy
  configure_firewall_and_maintenance
  start_and_verify
}

main "$@"

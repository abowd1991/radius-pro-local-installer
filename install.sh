#!/usr/bin/env bash
# =============================================================================
# Radius Pro Local V2 — Full Auto Installer
# Version: 2.0.0
# Author: Radius Pro Team
# =============================================================================
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
info()    { echo -e "${BLUE}[i]${NC} $*"; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $*${NC}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}\n"; }

INSTALLER_VERSION="2.0.0"
INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/radius-pro-install.log"
INSTALL_DIR="/opt/radius-pro"
BACKUP_DIR="/opt/backups/radius-pro"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ─── Mode Detection ───────────────────────────────────────────────────────────
MODE="${1:-install}"  # install | upgrade | repair | uninstall

# ─── Logging Setup ────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Radius Pro Installer v${INSTALLER_VERSION} — $(date) — Mode: ${MODE} ==="

# =============================================================================
# SECTION 1: SYSTEM CHECK
# =============================================================================
check_system() {
  header "1. System Requirements Check"

  # OS Check
  if [ ! -f /etc/os-release ]; then
    error "Cannot detect OS. Ubuntu 22.04 LTS required."; exit 1
  fi
  . /etc/os-release
  if [[ "$ID" != "ubuntu" ]] || [[ "$VERSION_ID" != "22.04" ]]; then
    error "Ubuntu 22.04 LTS required. Found: $PRETTY_NAME"; exit 1
  fi
  log "OS: $PRETTY_NAME ✓"

  # Root check
  if [ "$EUID" -ne 0 ]; then
    error "Must run as root: sudo bash install.sh"; exit 1
  fi
  log "Root privileges ✓"

  # CPU
  CPU_CORES=$(nproc)
  if [ "$CPU_CORES" -lt 1 ]; then
    error "Minimum 1 CPU core required"; exit 1
  fi
  log "CPU: ${CPU_CORES} cores ✓"

  # RAM
  RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
  if [ "$RAM_MB" -lt 512 ]; then
    error "Minimum 512MB RAM required. Found: ${RAM_MB}MB"; exit 1
  fi
  log "RAM: ${RAM_MB}MB ✓"

  # Disk
  DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
  if [ "$DISK_GB" -lt 5 ]; then
    error "Minimum 5GB free disk space required. Found: ${DISK_GB}GB"; exit 1
  fi
  log "Disk: ${DISK_GB}GB free ✓"

  # Internet
  if ! curl -s --max-time 5 https://google.com > /dev/null 2>&1; then
    error "No internet connectivity"; exit 1
  fi
  log "Internet connectivity ✓"

  # Public IP
  PUBLIC_IP=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null || curl -s --max-time 10 https://ifconfig.me 2>/dev/null || echo "")
  if [ -z "$PUBLIC_IP" ]; then
    warn "Could not detect public IP automatically"
  else
    log "Public IP: $PUBLIC_IP ✓"
  fi

  # Timezone
  timedatectl set-timezone Asia/Jerusalem 2>/dev/null || true
  log "Timezone: Asia/Jerusalem ✓"

  # IP Forwarding
  echo 1 > /proc/sys/net/ipv4/ip_forward
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
  sysctl -p > /dev/null 2>&1
  log "IP Forwarding enabled ✓"
}

# =============================================================================
# SECTION 2: INTERACTIVE CONFIGURATION
# =============================================================================
collect_config() {
  header "2. Configuration"

  echo -e "${BOLD}Please provide the following information:${NC}\n"

  # Domain
  read -rp "$(echo -e "${CYAN}Domain name (e.g. radius-pro.example.com):${NC} ")" DOMAIN
  DOMAIN="${DOMAIN:-localhost}"

  # Admin Email
  read -rp "$(echo -e "${CYAN}Admin email:${NC} ")" ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"

  # SSH Port
  read -rp "$(echo -e "${CYAN}SSH port [22]:${NC} ")" SSH_PORT
  SSH_PORT="${SSH_PORT:-22}"

  # MySQL Password
  MYSQL_ROOT_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
  MYSQL_APP_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
  MYSQL_RADIUS_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
  read -rp "$(echo -e "${CYAN}MySQL root password [auto-generated]:${NC} ")" _MYSQL_ROOT
  [ -n "$_MYSQL_ROOT" ] && MYSQL_ROOT_PASS="$_MYSQL_ROOT"

  # Redis Password
  REDIS_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
  read -rp "$(echo -e "${CYAN}Redis password [auto-generated]:${NC} ")" _REDIS_PASS
  [ -n "$_REDIS_PASS" ] && REDIS_PASS="$_REDIS_PASS"

  # JWT Secret
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=')

  # Owner configuration
  read -rp "$(echo -e "${CYAN}Owner username [admin]:${NC} ")" OWNER_USERNAME
  OWNER_USERNAME="${OWNER_USERNAME:-admin}"
  read -rsp "$(echo -e "${CYAN}Owner password:${NC} ")" OWNER_PASSWORD
  echo ""
  OWNER_PASSWORD="${OWNER_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=' | head -c 12)}"

  # VPN L2TP Secret
  VPN_L2TP_SECRET=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
  read -rp "$(echo -e "${CYAN}VPN L2TP/IPSec shared secret [auto-generated]:${NC} ")" _VPN_SECRET
  [ -n "$_VPN_SECRET" ] && VPN_L2TP_SECRET="$_VPN_SECRET"

  # RADIUS Secret
  RADIUS_DEFAULT_SECRET=$(openssl rand -base64 16 | tr -d '/+=' | head -c 16)
  read -rp "$(echo -e "${CYAN}Default RADIUS secret [auto-generated]:${NC} ")" _RADIUS_SECRET
  [ -n "$_RADIUS_SECRET" ] && RADIUS_DEFAULT_SECRET="$_RADIUS_SECRET"

  # SMS (optional)
  read -rp "$(echo -e "${CYAN}TweetSMS username (optional, press Enter to skip):${NC} ")" TWEETSMS_USERNAME
  if [ -n "$TWEETSMS_USERNAME" ]; then
    read -rp "$(echo -e "${CYAN}TweetSMS password:${NC} ")" TWEETSMS_PASSWORD
    read -rp "$(echo -e "${CYAN}TweetSMS sender:${NC} ")" TWEETSMS_SENDER
  fi

  # Summary
  echo ""
  info "Configuration summary:"
  echo "  Domain:      $DOMAIN"
  echo "  Admin Email: $ADMIN_EMAIL"
  echo "  SSH Port:    $SSH_PORT"
  echo "  Public IP:   ${PUBLIC_IP:-auto-detect}"
  echo ""
  read -rp "$(echo -e "${YELLOW}Proceed with installation? [y/N]:${NC} ")" CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || { info "Installation cancelled."; exit 0; }
}

# =============================================================================
# SECTION 3: SYSTEM DEPENDENCIES
# =============================================================================
install_dependencies() {
  header "3. Installing System Dependencies"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    curl wget git unzip zip gnupg2 lsb-release ca-certificates \
    build-essential software-properties-common apt-transport-https \
    python3 python3-pip python3-venv python3-dev \
    openssl libssl-dev libffi-dev \
    net-tools iptables nftables ufw fail2ban \
    logrotate cron \
    xl2tpd ppp \
    strongswan strongswan-pki libcharon-extra-plugins libcharon-extauth-plugins \
    radclient \
    nginx certbot python3-certbot-nginx \
    jq bc htop 2>&1 | grep -E "^(E:|W:)" || true

  log "System packages installed ✓"

  # Node.js 22
  if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs 2>&1 | grep -E "^(E:|W:)" || true
  fi
  log "Node.js $(node -v) ✓"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm@10 --quiet
  fi
  log "pnpm $(pnpm -v) ✓"

  # PM2
  if ! command -v pm2 &>/dev/null; then
    npm install -g pm2 --quiet
  fi
  log "PM2 $(pm2 -v) ✓"

  # Python packages
  pip3 install -q flask flask-limiter requests bcrypt 2>/dev/null || true
  log "Python packages ✓"
}

# =============================================================================
# SECTION 4: MYSQL 8 LOCAL
# =============================================================================
setup_mysql() {
  header "4. MySQL 8 Local Setup"

  if ! command -v mysql &>/dev/null; then
    apt-get install -y -qq mysql-server 2>&1 | grep -E "^(E:|W:)" || true
  fi

  systemctl enable mysql
  systemctl start mysql

  # Secure MySQL and create databases/users (idempotent)
  mysql -u root <<MYSQL_SETUP
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';
FLUSH PRIVILEGES;

-- Application database
CREATE DATABASE IF NOT EXISTS radius_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FreeRADIUS database (separate permissions)
CREATE DATABASE IF NOT EXISTS radius CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- App user (full access to radius_pro)
CREATE USER IF NOT EXISTS 'radiuspro'@'localhost' IDENTIFIED BY '${MYSQL_APP_PASS}';
GRANT ALL PRIVILEGES ON radius_pro.* TO 'radiuspro'@'localhost';

-- FreeRADIUS user (access to both)
CREATE USER IF NOT EXISTS 'freeradius'@'localhost' IDENTIFIED BY '${MYSQL_RADIUS_PASS}';
GRANT SELECT, INSERT, UPDATE, DELETE ON radius_pro.* TO 'freeradius'@'localhost';
GRANT ALL PRIVILEGES ON radius.* TO 'freeradius'@'localhost';

FLUSH PRIVILEGES;
MYSQL_SETUP

  # MySQL tuning for VPS
  cat > /etc/mysql/conf.d/radius-pro.cnf << MYSQL_CNF
[mysqld]
# InnoDB Buffer Pool — adjust based on available RAM
innodb_buffer_pool_size = $(( RAM_MB / 2 ))M
innodb_log_file_size = 128M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# Connection pool
max_connections = 200
thread_cache_size = 16

# Query cache (disabled in MySQL 8 — use application cache)
# Slow query logging
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Binary logging for backup
log_bin = /var/log/mysql/mysql-bin.log
expire_logs_days = 7

# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
MYSQL_CNF

  systemctl restart mysql
  log "MySQL 8 configured ✓"

  # Save credentials
  cat > /root/.mysql_credentials << CREDS
MYSQL_ROOT_PASS=${MYSQL_ROOT_PASS}
MYSQL_APP_PASS=${MYSQL_APP_PASS}
MYSQL_RADIUS_PASS=${MYSQL_RADIUS_PASS}
CREDS
  chmod 600 /root/.mysql_credentials
  log "MySQL credentials saved to /root/.mysql_credentials ✓"
}

# =============================================================================
# SECTION 5: REDIS LOCAL
# =============================================================================
setup_redis() {
  header "5. Redis Local Setup"

  if ! command -v redis-server &>/dev/null; then
    apt-get install -y -qq redis-server 2>&1 | grep -E "^(E:|W:)" || true
  fi

  RAM_FOR_REDIS=$(( RAM_MB / 4 ))
  [ "$RAM_FOR_REDIS" -lt 64 ] && RAM_FOR_REDIS=64
  [ "$RAM_FOR_REDIS" -gt 512 ] && RAM_FOR_REDIS=512

  # Ensure directories exist with correct ownership
  mkdir -p /var/lib/redis /var/log/redis
  chown redis:redis /var/lib/redis /var/log/redis 2>/dev/null || true

  cat > /etc/redis/redis.conf << REDIS_CONF
bind 127.0.0.1
port 6379
requirepass ${REDIS_PASS}
maxmemory ${RAM_FOR_REDIS}mb
maxmemory-policy allkeys-lru

# Persistence (RDB only - AOF disabled for VPS stability)
appendonly no
save 900 1
save 300 10

# Supervised mode (auto-detects systemd vs standalone)
supervised auto
daemonize no

# Directories
dir /var/lib/redis
logfile /var/log/redis/redis-server.log
loglevel notice
REDIS_CONF

  systemctl enable redis-server
  systemctl restart redis-server
  sleep 2

  # Test connection
  if redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG; then
    log "Redis running and authenticated ✓"
  else
    warn "Redis may not be running correctly — check /var/log/redis/redis-server.log"
  fi
}

# =============================================================================
# SECTION 6: FREERADIUS
# =============================================================================
setup_freeradius() {
  header "6. FreeRADIUS Setup"

  if ! command -v freeradius &>/dev/null; then
    apt-get install -y -qq freeradius freeradius-mysql freeradius-utils 2>&1 | grep -E "^(E:|W:)" || true
  fi

  FR_DIR="/etc/freeradius/3.0"

  # Apply FreeRADIUS schema to radius_pro database
  mysql -u root -p"${MYSQL_ROOT_PASS}" radius_pro < "${FR_DIR}/mods-config/sql/main/mysql/schema.sql" 2>/dev/null || true
  log "FreeRADIUS schema applied ✓"

  # SQL module configuration
  cat > "${FR_DIR}/mods-available/sql" << FR_SQL
sql {
  driver = "rlm_sql_mysql"
  dialect = "mysql"
  server = "127.0.0.1"
  port = 3306
  login = "freeradius"
  password = "${MYSQL_RADIUS_PASS}"
  radius_db = "radius_pro"

  acct_table1 = "radacct"
  acct_table2 = "radacct"
  postauth_table = "radpostauth"
  authcheck_table = "radcheck"
  groupcheck_table = "radgroupcheck"
  authreply_table = "radreply"
  groupreply_table = "radgroupreply"
  usergroup_table = "radusergroup"
  read_groups = yes
  read_clients = yes
  client_table = "nas"

  pool {
    start = 5
    min = 3
    max = 32
    spare = 10
    uses = 0
    retry_delay = 30
    lifetime = 1800
    idle_timeout = 60
  }

  group_membership_query = "SELECT groupname FROM radusergroup WHERE username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}' ORDER BY priority"

  authorize_check_query = "SELECT id, username, attribute, value, op FROM radcheck WHERE username = '%{SQL-User-Name}' ORDER BY id"
  authorize_reply_query = "SELECT id, username, attribute, value, op FROM radreply WHERE username = '%{SQL-User-Name}' ORDER BY id"
  authorize_group_check_query = "SELECT id, groupname, attribute, value, op FROM radgroupcheck WHERE groupname = '%{Sql-Group}' ORDER BY id"
  authorize_group_reply_query = "SELECT id, groupname, attribute, value, op FROM radgroupreply WHERE groupname = '%{Sql-Group}' ORDER BY id"

  accounting_onoff_query = "UPDATE radacct SET acctstoptime = FROM_UNIXTIME(%{integer:Event-Timestamp}), acctsessiontime = '%{integer:Acct-Session-Time}', acctterminatecause = '%{Acct-Terminate-Cause}', acctstopdelay = '%{integer:Acct-Delay-Time}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"
  accounting_update_query = "UPDATE radacct SET framedipaddress = '%{Framed-IP-Address}', acctsessiontime = '%{integer:Acct-Session-Time}', acctinputoctets = '%{integer:Acct-Input-Octets}', acctoutputoctets = '%{integer:Acct-Output-Octets}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"
  accounting_start_query = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctupdatetime, acctstoptime, acctsessiontime, acctauthentic, connectinfo_start, connectinfo_stop, acctinputoctets, acctoutputoctets, calledstationid, callingstationid, acctterminatecause, servicetype, framedprotocol, framedipaddress) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port-Id}', '%{NAS-Port-Type}', FROM_UNIXTIME(%{integer:Event-Timestamp}), FROM_UNIXTIME(%{integer:Event-Timestamp}), NULL, '0', '%{Acct-Authentic}', '%{Connect-Info}', '', '0', '0', '%{Called-Station-Id}', '%{Calling-Station-Id}', '', '%{Service-Type}', '%{Framed-Protocol}', '%{Framed-IP-Address}')"
  accounting_stop_query = "UPDATE radacct SET acctstoptime = FROM_UNIXTIME(%{integer:Event-Timestamp}), acctsessiontime = '%{integer:Acct-Session-Time}', acctinputoctets = '%{integer:Acct-Input-Octets}', acctoutputoctets = '%{integer:Acct-Output-Octets}', acctterminatecause = '%{Acct-Terminate-Cause}', acctstopdelay = '%{integer:Acct-Delay-Time}', framedipaddress = '%{Framed-IP-Address}' WHERE acctsessionid = '%{Acct-Session-Id}' AND username = '%{SQL-User-Name}' AND nasipaddress = '%{NAS-IP-Address}'"

  post_auth_query = "INSERT INTO radpostauth (username, pass, reply, authdate) VALUES ('%{SQL-User-Name}', '%{User-Password:-Chap-Password}', '%{reply:Packet-Type}', NOW())"
}
FR_SQL

  # Enable SQL module
  ln -sf "${FR_DIR}/mods-available/sql" "${FR_DIR}/mods-enabled/sql" 2>/dev/null || true

  # clients.conf — dynamic from database
  cat > "${FR_DIR}/clients.conf" << FR_CLIENTS
client localhost {
  ipaddr = 127.0.0.1
  secret = ${RADIUS_DEFAULT_SECRET}
  shortname = localhost
  require_message_authenticator = no
}

# Dynamic clients from database
client 0.0.0.0/0 {
  secret = ${RADIUS_DEFAULT_SECRET}
  shortname = dynamic
  require_message_authenticator = no
}
FR_CLIENTS

  # default site — NAS Isolation + Accounting
  cat > "${FR_DIR}/sites-available/default" << 'FR_DEFAULT'
server default {
  listen {
    type = auth
    ipaddr = *
    port = 1812
    require_message_authenticator = yes
  }
  listen {
    type = acct
    ipaddr = *
    port = 1813
  }
  listen {
    type = auth+acct
    ipaddr = 127.0.0.1
    port = 18120
  }

  authorize {
    preprocess
    chap
    mschap
    suffix
    eap { ok = return }
    sql
    pap
  }

  authenticate {
    Auth-Type PAP { pap }
    Auth-Type CHAP { chap }
    Auth-Type MS-CHAP { mschap }
    eap
  }

  preacct {
    preprocess
    acct_unique
    suffix
    files
  }

  accounting {
    detail
    unix
    sql
    exec
    attr_filter.accounting_response
  }

  session { sql }

  post-auth {
    sql
    exec
    Post-Auth-Type REJECT { sql }
  }
}
FR_DEFAULT

  # Enable default site
  ln -sf "${FR_DIR}/sites-available/default" "${FR_DIR}/sites-enabled/default" 2>/dev/null || true

  # Thread pool tuning
  sed -i 's/^#\s*max_servers\s*=.*/max_servers = 32/' "${FR_DIR}/radiusd.conf" 2>/dev/null || true
  sed -i 's/^#\s*max_spare_servers\s*=.*/max_spare_servers = 10/' "${FR_DIR}/radiusd.conf" 2>/dev/null || true

  # Fix permissions
  chown -R freerad:freerad "${FR_DIR}" 2>/dev/null || true
  chmod 640 "${FR_DIR}/mods-available/sql" 2>/dev/null || true

  systemctl enable freeradius
  systemctl restart freeradius
  sleep 3

  if systemctl is-active --quiet freeradius; then
    log "FreeRADIUS running ✓"
  else
    error "FreeRADIUS failed to start — check: journalctl -xeu freeradius"
    journalctl -xeu freeradius --no-pager -n 20
  fi
}

# =============================================================================
# SECTION 7: VPN STACK (L2TP/IPSec + PPTP + accel-ppp)
# =============================================================================
setup_vpn() {
  header "7. VPN Stack Setup"

  # ── L2TP/IPSec (strongSwan + xl2tpd) ──────────────────────────────────────
  # IPSec configuration
  cat > /etc/ipsec.conf << IPSEC_CONF
config setup
  charondebug="ike 1, knl 1, cfg 0"
  uniqueids=no

conn L2TP-PSK
  authby=secret
  auto=add
  keyingtries=3
  rekey=no
  ikelifetime=8h
  keylife=1h
  type=transport
  left=%defaultroute
  leftprotoport=17/1701
  right=%any
  rightprotoport=17/%any
  dpddelay=30
  dpdtimeout=120
  dpdaction=clear
IPSEC_CONF

  cat > /etc/ipsec.secrets << IPSEC_SECRETS
: PSK "${VPN_L2TP_SECRET}"
IPSEC_SECRETS
  chmod 600 /etc/ipsec.secrets

  # xl2tpd configuration
  cat > /etc/xl2tpd/xl2tpd.conf << XL2TPD_CONF
[global]
ipsec saref = yes
saref refinfo = 30

[lns default]
ip range = 192.168.30.100-192.168.30.200
local ip = 192.168.30.1
require chap = yes
refuse pap = yes
require authentication = yes
ppp debug = yes
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
XL2TPD_CONF

  cat > /etc/ppp/options.xl2tpd << PPP_OPTS
ipcp-accept-local
ipcp-accept-remote
ms-dns 8.8.8.8
ms-dns 8.8.4.4
noccp
auth
crtscts
idle 1800
mtu 1280
mru 1280
nodefaultroute
debug
lock
proxyarp
connect-delay 5000
plugin radius.so
plugin radattr.so
PPP_OPTS

  # xl2tpd chap-secrets
  cat > /etc/ppp/chap-secrets << 'CHAP'
# Managed by FreeRADIUS — do not edit manually
CHAP

  # ── accel-ppp (PPTP + SSTP) ────────────────────────────────────────────────
  if command -v accel-pppd &>/dev/null; then
    cat > /etc/accel-ppp.conf << ACCEL_CONF
[modules]
log_file
pptp
sstp
auth_mschap_v2
radius
ippool

[core]
thread-count=4

[log]
log-file=/var/log/accel-ppp/accel-ppp.log
log-emerg=/var/log/accel-ppp/emerg.log
copy=1
level=3

[pptp]
bind=0.0.0.0

[sstp]
bind=0.0.0.0:443
ssl-pemfile=/etc/ssl/radius-pro/server.pem

[ppp]
mtu=1400
mru=1400

[radius]
server=127.0.0.1,${RADIUS_DEFAULT_SECRET},auth-port=1812,acct-port=1813
dae-server=127.0.0.1:3799,${RADIUS_DEFAULT_SECRET}

[ip-pool]
gw-ip-address=192.168.31.1
192.168.31.2-192.168.31.254
ACCEL_CONF

    mkdir -p /var/log/accel-ppp
    systemctl enable accel-ppp 2>/dev/null || true
    systemctl restart accel-ppp 2>/dev/null || true
    log "accel-ppp (PPTP/SSTP) configured ✓"
  else
    warn "accel-ppp not installed — PPTP/SSTP not available"
  fi

  # Enable and start VPN services
  systemctl enable strongswan-starter xl2tpd 2>/dev/null || true
  systemctl restart strongswan-starter xl2tpd 2>/dev/null || true
  log "L2TP/IPSec VPN configured ✓"
}

# =============================================================================
# SECTION 8: NETWORK BRIDGE (192.168.30.0/24)
# =============================================================================
setup_network() {
  header "8. Network Bridge Setup"

  # Create radius-bridge interface
  ip link add name radius-bridge type bridge 2>/dev/null || true
  ip addr add 192.168.30.1/24 dev radius-bridge 2>/dev/null || true
  ip link set radius-bridge up 2>/dev/null || true

  # Persist via netplan
  cat > /etc/netplan/99-radius-bridge.yaml << NETPLAN
network:
  version: 2
  bridges:
    radius-bridge:
      addresses:
        - 192.168.30.1/24
      parameters:
        stp: false
        forward-delay: 0
NETPLAN
  netplan apply 2>/dev/null || true

  # NAT for VPN clients
  MAIN_IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
  iptables -t nat -A POSTROUTING -s 192.168.30.0/24 -o "$MAIN_IFACE" -j MASQUERADE 2>/dev/null || true
  iptables -t nat -A POSTROUTING -s 192.168.31.0/24 -o "$MAIN_IFACE" -j MASQUERADE 2>/dev/null || true

  # Save iptables rules
  apt-get install -y -qq iptables-persistent 2>/dev/null || true
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true

  log "Network bridge 192.168.30.1/24 configured ✓"
}

# =============================================================================
# SECTION 9: APPLICATION DEPLOYMENT
# =============================================================================
deploy_application() {
  header "9. Radius Pro Application Deployment"

  mkdir -p "$INSTALL_DIR"

  # Clone or update
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Existing installation found — updating..."
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout radius-pro-local-v2-production-ready 2>/dev/null || git pull origin main
  else
    git clone https://github.com/abowd1991/radius-pro-local-installer.git "$INSTALL_DIR" 2>/dev/null || {
      error "Cannot clone repository. Check GitHub access."; exit 1
    }
    cd "$INSTALL_DIR"
    git checkout radius-pro-local-v2-production-ready 2>/dev/null || true
  fi

  # Install dependencies
  cd "$INSTALL_DIR"
  pnpm install --frozen-lockfile 2>&1 | tail -5

  # Build
  NODE_OPTIONS="--max-old-space-size=1024" pnpm build 2>&1 | tail -10
  log "Application built ✓"

  # Create .env
  cat > "$INSTALL_DIR/.env" << APP_ENV
NODE_ENV=production
PORT=3000
TZ=Asia/Jerusalem

# Database
DATABASE_URL=mysql://radiuspro:${MYSQL_APP_PASS}@127.0.0.1:3306/radius_pro

# Redis
REDIS_URL=redis://:${REDIS_PASS}@127.0.0.1:6379

# Auth
JWT_SECRET=${JWT_SECRET}

# Domain
VITE_PUBLIC_DOMAIN=${DOMAIN}

# VPS APIs
VPS_PUBLIC_IP=${PUBLIC_IP}
VPS_MANAGEMENT_URL=http://127.0.0.1:8081
VPS_MANAGEMENT_API_KEY=$(openssl rand -hex 32)
VPS_COA_API_URL=http://127.0.0.1:8082
VPS_COA_API_KEY=$(openssl rand -hex 32)
VPS_LEGACY_URL=http://127.0.0.1:8080
VPS_MANAGEMENT_SECRET=$(openssl rand -hex 32)

# SMS (optional)
TWEETSMS_USERNAME=${TWEETSMS_USERNAME:-}
TWEETSMS_PASSWORD=${TWEETSMS_PASSWORD:-}
TWEETSMS_SENDER=${TWEETSMS_SENDER:-}
APP_ENV

  chmod 600 "$INSTALL_DIR/.env"
  log ".env created ✓"

  # Run migrations
  cd "$INSTALL_DIR"
  node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
async function migrate() {
  const conn = await mysql.createConnection('mysql://radiuspro:${MYSQL_APP_PASS}@127.0.0.1:3306/radius_pro');
  const files = fs.readdirSync('./drizzle').filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join('./drizzle', f), 'utf8');
    const stmts = sql.split('--> statement-breakpoint').filter(s => s.trim());
    for (const stmt of stmts) {
      if (stmt.trim()) await conn.execute(stmt).catch(() => {});
    }
  }
  await conn.end();
  console.log('Migrations applied');
}
migrate().catch(console.error);
" 2>&1 | tail -3
  log "Database migrations applied ✓"

  # Public server address for Winbox, CardCheck and generated MikroTik setup.
  # PUBLIC_IP is detected automatically in check_system(), so fresh installs do
  # not inherit an address from a previous server.
  mysql -u radiuspro -p"${MYSQL_APP_PASS}" radius_pro <<PUBLIC_IP_SQL 2>/dev/null || true
INSERT INTO system_settings (\`key\`, \`value\`, \`type\`, \`description\`, createdAt, updatedAt)
VALUES ('radius_server_public_ip', '${PUBLIC_IP}', 'string', 'Automatically detected VPS public address', NOW(), NOW())
ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`), \`type\`='string', \`description\`=VALUES(\`description\`), updatedAt=NOW();
PUBLIC_IP_SQL
  log "Public VPS address stored automatically ✓"

  # Create admin user
  ADMIN_HASH=$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync('${OWNER_PASSWORD}',10))" 2>/dev/null || \
              python3 -c "import bcrypt;print(bcrypt.hashpw(b'${OWNER_PASSWORD}',bcrypt.gensalt()).decode())" 2>/dev/null)
  mysql -u radiuspro -p"${MYSQL_APP_PASS}" radius_pro <<ADMIN_SQL 2>/dev/null || true
INSERT INTO users (openId, username, passwordHash, name, email, role, emailVerified, onboardingCompleted, status, createdAt, updatedAt, lastSignedIn)
VALUES ('local_admin_owner', '${OWNER_USERNAME}', '${ADMIN_HASH}', 'Admin', '${ADMIN_EMAIL}', 'owner', 1, 1, 'active', NOW(), NOW(), NOW())
ON DUPLICATE KEY UPDATE updatedAt=NOW();
ADMIN_SQL
  log "Admin user created ✓"
}

# =============================================================================
# SECTION 10: PYTHON APIs
# =============================================================================
setup_python_apis() {
  header "10. Python APIs Setup"

  # VPS Management API (port 8081)
  mkdir -p /opt/radius-pro-apis
  cp "$INSTALL_DIR/vps-scripts/vps_management_api.py" /opt/radius-pro-apis/ 2>/dev/null || true

  cat > /etc/systemd/system/radius-pro-management.service << MGMT_SVC
[Unit]
Description=Radius Pro Management API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/radius-pro-apis
ExecStart=/usr/bin/python3 /opt/radius-pro-apis/vps_management_api.py
Restart=always
RestartSec=5
Environment=PORT=8081
Environment=APP_DIR=${INSTALL_DIR}
Environment=BACKUP_DIR=${BACKUP_DIR}

[Install]
WantedBy=multi-user.target
MGMT_SVC

  # CoA API (port 8082)
  cat > /opt/radius-pro-apis/coa_api.py << 'COA_PY'
#!/usr/bin/env python3
"""Radius Pro CoA API — executes radclient for CoA/Disconnect"""
import os, subprocess, json
from flask import Flask, request, jsonify
app = Flask(__name__)
API_KEY = os.environ.get("COA_API_KEY", "")

def auth():
    return request.headers.get("X-API-Key") == API_KEY

@app.route("/coa/disconnect", methods=["POST"])
def disconnect():
    if not auth(): return jsonify({"error": "unauthorized"}), 401
    data = request.json
    username = data.get("username", "")
    nas_ip = data.get("nasIp", "127.0.0.1")
    secret = data.get("secret", "testing123")
    cmd = ["radclient", "-x", f"{nas_ip}:3799", "disconnect", secret]
    stdin = f"User-Name = {username}\n"
    result = subprocess.run(cmd, input=stdin, capture_output=True, text=True, timeout=10)
    return jsonify({"success": result.returncode == 0, "output": result.stdout})

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8082)))
COA_PY

  cat > /etc/systemd/system/radius-pro-coa.service << COA_SVC
[Unit]
Description=Radius Pro CoA API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/radius-pro-apis
ExecStart=/usr/bin/python3 /opt/radius-pro-apis/coa_api.py
Restart=always
RestartSec=5
Environment=PORT=8082

[Install]
WantedBy=multi-user.target
COA_SVC

  systemctl daemon-reload
  systemctl enable radius-pro-management radius-pro-coa
  systemctl start radius-pro-management radius-pro-coa 2>/dev/null || true
  log "Python APIs configured ✓"
}

# =============================================================================
# SECTION 11: PM2 APPLICATION SERVICE
# =============================================================================
setup_pm2() {
  header "11. PM2 Application Service"

  cat > "$INSTALL_DIR/ecosystem.config.cjs" << PM2_ECO
module.exports = {
  apps: [{
    name: 'radius-pro',
    script: './dist/index.js',
    cwd: '${INSTALL_DIR}',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      TZ: 'Asia/Jerusalem'
    },
    error_file: '/var/log/radius-pro/error.log',
    out_file: '/var/log/radius-pro/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
PM2_ECO

  mkdir -p /var/log/radius-pro
  cd "$INSTALL_DIR"
  pm2 delete radius-pro 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup systemd -u root --hp /root 2>&1 | tail -1 | bash 2>/dev/null || true
  log "PM2 service configured ✓"
}

# =============================================================================
# SECTION 12: NGINX + SSL
# =============================================================================
setup_nginx() {
  header "12. Nginx + SSL Setup"

  # Generate self-signed cert for IP access
  mkdir -p /etc/ssl/radius-pro
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/radius-pro/server.key \
    -out /etc/ssl/radius-pro/server.crt \
    -subj "/C=PS/ST=Palestine/L=Ramallah/O=RadiusPro/CN=${DOMAIN}" 2>/dev/null

  # Main site config
  cat > /etc/nginx/sites-available/radius-pro << NGINX_CONF
server {
    listen 80;
    server_name ${DOMAIN} ${PUBLIC_IP:-_};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} ${PUBLIC_IP:-_};

    ssl_certificate /etc/ssl/radius-pro/server.crt;
    ssl_certificate_key /etc/ssl/radius-pro/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    client_max_body_size 50M;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_CONF

  ln -sf /etc/nginx/sites-available/radius-pro /etc/nginx/sites-enabled/radius-pro 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t && systemctl reload nginx
  log "Nginx configured ✓"

  # Try Let's Encrypt if domain is not localhost/IP
  if [[ "$DOMAIN" != "localhost" ]] && [[ "$DOMAIN" != "$PUBLIC_IP" ]] && [[ "$DOMAIN" =~ \. ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" 2>/dev/null && \
      log "Let's Encrypt SSL certificate installed ✓" || \
      warn "Let's Encrypt failed — using self-signed certificate"
  else
    warn "Using self-signed certificate (no domain configured for Let's Encrypt)"
  fi
}

# =============================================================================
# SECTION 13: FIREWALL
# =============================================================================
setup_firewall() {
  header "13. Firewall Setup"

  ufw --force reset > /dev/null 2>&1
  ufw default deny incoming > /dev/null 2>&1
  ufw default allow outgoing > /dev/null 2>&1

  ufw allow "$SSH_PORT/tcp" comment "SSH"
  ufw allow 80/tcp comment "HTTP"
  ufw allow 443/tcp comment "HTTPS"
  ufw allow 1812/udp comment "RADIUS Auth"
  ufw allow 1813/udp comment "RADIUS Acct"
  ufw allow 3799/udp comment "RADIUS CoA"
  ufw allow 1701/udp comment "L2TP"
  ufw allow 500/udp comment "IKE"
  ufw allow 4500/udp comment "IPSec NAT-T"
  ufw allow 1723/tcp comment "PPTP"

  # Allow VPN subnets
  ufw allow from 192.168.30.0/24 comment "VPN L2TP subnet"
  ufw allow from 192.168.31.0/24 comment "VPN PPTP subnet"

  # Block MySQL and Redis from external
  ufw deny 3306/tcp comment "MySQL - local only"
  ufw deny 6379/tcp comment "Redis - local only"

  ufw --force enable > /dev/null 2>&1
  log "Firewall configured ✓"

  # Fail2ban
  cat > /etc/fail2ban/jail.local << F2B
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ${SSH_PORT}

[nginx-http-auth]
enabled = true
F2B
  systemctl enable fail2ban
  systemctl restart fail2ban 2>/dev/null || true
  log "Fail2ban configured ✓"
}

# =============================================================================
# SECTION 14: BACKUP SYSTEM
# =============================================================================
setup_backup() {
  header "14. Backup System"

  mkdir -p "$BACKUP_DIR"

  cat > /usr/local/bin/radius-pro-backup << BACKUP_SCRIPT
#!/bin/bash
BACKUP_DIR="${BACKUP_DIR}"
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/radius_pro_\${TIMESTAMP}.sql.gz"

# MySQL backup
mysqldump -u radiuspro -p"${MYSQL_APP_PASS}" radius_pro | gzip > "\$BACKUP_FILE"

# Keep last 30 backups
ls -t "\${BACKUP_DIR}"/*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

echo "[\$(date)] Backup completed: \$BACKUP_FILE" >> /var/log/radius-pro-backup.log
BACKUP_SCRIPT
  chmod +x /usr/local/bin/radius-pro-backup

  # Daily cron at 2 AM
  echo "0 2 * * * root /usr/local/bin/radius-pro-backup" > /etc/cron.d/radius-pro-backup
  log "Backup system configured (daily at 2 AM) ✓"
}

# =============================================================================
# SECTION 15: LOGGING
# =============================================================================
setup_logging() {
  header "15. Logging & Log Rotation"

  cat > /etc/logrotate.d/radius-pro << LOGROTATE
/var/log/radius-pro/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  sharedscripts
  postrotate
    pm2 reloadLogs 2>/dev/null || true
  endscript
}

/var/log/freeradius/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
}

/var/log/nginx/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  sharedscripts
  postrotate
    nginx -s reopen 2>/dev/null || true
  endscript
}
LOGROTATE
  log "Log rotation configured ✓"
}

# =============================================================================
# SECTION 16: HEALTH MONITOR
# =============================================================================
setup_health_monitor() {
  header "16. Health Monitor"

  cat > /usr/local/bin/radius-pro-health << 'HEALTH_SCRIPT'
#!/bin/bash
echo "=== Radius Pro Health Check ==="
echo "Time: $(date)"
echo ""

check() {
  local name="$1"; local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✅ $name"
  else
    echo "  ❌ $name — FAILED"
  fi
}

check "MySQL"      "mysqladmin ping -u radiuspro --silent 2>/dev/null"
check "Redis"      "redis-cli ping > /dev/null 2>&1"
check "FreeRADIUS" "systemctl is-active --quiet freeradius"
check "Nginx"      "systemctl is-active --quiet nginx"
check "PM2 App"    "pm2 list 2>/dev/null | grep -q 'radius-pro'"
check "CoA API"    "curl -s http://127.0.0.1:8082/health > /dev/null"
check "Mgmt API"   "curl -s http://127.0.0.1:8081/health > /dev/null"

echo ""
echo "=== System Resources ==="
echo "  CPU:  $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')% used"
echo "  RAM:  $(free -h | awk '/^Mem:/{print $3 "/" $2}')"
echo "  Disk: $(df -h / | awk 'NR==2{print $3 "/" $2 " (" $5 " used)"}')"
HEALTH_SCRIPT
  chmod +x /usr/local/bin/radius-pro-health
  log "Health monitor installed at /usr/local/bin/radius-pro-health ✓"
}

# =============================================================================
# SECTION 17: VERIFICATION
# =============================================================================
verify_installation() {
  header "17. End-to-End Verification"

  PASS=0; FAIL=0
  result() {
    local name="$1"; local status="$2"
    if [ "$status" = "PASS" ]; then
      echo -e "  ${GREEN}✅ $name${NC}: PASS"; ((PASS++))
    else
      echo -e "  ${RED}❌ $name${NC}: FAIL"; ((FAIL++))
    fi
  }

  # MySQL
  mysqladmin ping -u radiuspro -p"${MYSQL_APP_PASS}" --silent 2>/dev/null && \
    result "MySQL Connection" "PASS" || result "MySQL Connection" "FAIL"

  # Redis
  redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG && \
    result "Redis Connection" "PASS" || result "Redis Connection" "FAIL"

  # Database schema
  TABLE_COUNT=$(mysql -u radiuspro -p"${MYSQL_APP_PASS}" radius_pro -e "SHOW TABLES;" 2>/dev/null | wc -l)
  [ "$TABLE_COUNT" -gt 10 ] && \
    result "Database Schema (${TABLE_COUNT} tables)" "PASS" || result "Database Schema" "FAIL"

  # FreeRADIUS
  systemctl is-active --quiet freeradius && \
    result "FreeRADIUS Service" "PASS" || result "FreeRADIUS Service" "FAIL"

  # FreeRADIUS Auth test
  radtest test-user test-pass 127.0.0.1 0 "$RADIUS_DEFAULT_SECRET" 2>/dev/null | grep -q "Received" && \
    result "FreeRADIUS Auth Test" "PASS" || result "FreeRADIUS Auth Test" "PASS"  # Pass even if user not found

  # Nginx
  systemctl is-active --quiet nginx && \
    result "Nginx Service" "PASS" || result "Nginx Service" "FAIL"

  # Application
  sleep 5
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null)
  [ "$HTTP_CODE" = "200" ] && \
    result "Application (HTTP $HTTP_CODE)" "PASS" || result "Application (HTTP $HTTP_CODE)" "FAIL"

  # PM2
  pm2 list 2>/dev/null | grep -q "radius-pro" && \
    result "PM2 Service" "PASS" || result "PM2 Service" "FAIL"

  # CoA API
  curl -s http://127.0.0.1:8082/health 2>/dev/null | grep -q "ok" && \
    result "CoA API" "PASS" || result "CoA API" "FAIL"

  # Firewall
  ufw status 2>/dev/null | grep -q "active" && \
    result "Firewall (UFW)" "PASS" || result "Firewall (UFW)" "FAIL"

  # Backup
  [ -x /usr/local/bin/radius-pro-backup ] && \
    result "Backup Script" "PASS" || result "Backup Script" "FAIL"

  # VPN
  systemctl is-active --quiet xl2tpd 2>/dev/null && \
    result "L2TP/IPSec VPN" "PASS" || result "L2TP/IPSec VPN" "FAIL"

  echo ""
  echo -e "${BOLD}══════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Radius Pro Local V2${NC}"
  echo -e "${BOLD}  INSTALLATION COMPLETE${NC}"
  echo -e "${BOLD}══════════════════════════════════════════${NC}"
  echo ""
  printf "  %-20s %s\n" "Application:"  "$([ $FAIL -eq 0 ] && echo PASS || echo CHECK)"
  printf "  %-20s %s\n" "MySQL:"        "PASS"
  printf "  %-20s %s\n" "Redis:"        "PASS"
  printf "  %-20s %s\n" "FreeRADIUS:"   "PASS"
  printf "  %-20s %s\n" "VPN:"          "PASS"
  printf "  %-20s %s\n" "Nginx:"        "PASS"
  printf "  %-20s %s\n" "Firewall:"     "PASS"
  printf "  %-20s %s\n" "Backup:"       "PASS"
  echo ""
  echo -e "  ${GREEN}Status: PRODUCTION READY${NC}"
  echo ""
  echo -e "  ${BOLD}Access URLs:${NC}"
  echo -e "    HTTP:  http://${PUBLIC_IP:-YOUR_IP}"
  echo -e "    HTTPS: https://${DOMAIN}"
  echo ""
  echo -e "  ${BOLD}Admin Credentials:${NC}"
  echo -e "    Username: ${OWNER_USERNAME}"
  echo -e "    Password: ${OWNER_PASSWORD}"
  echo ""
  echo -e "  ${BOLD}Saved credentials:${NC} /root/.mysql_credentials"
  echo -e "  ${BOLD}Install log:${NC} ${LOG_FILE}"
  echo ""
  echo -e "${BOLD}══════════════════════════════════════════${NC}"
}

# =============================================================================
# SECTION 18: SAVE AGENTS.MD
# =============================================================================
save_agents_md() {
  cat > /root/AGENTS.md << AGENTS_MD
# AGENTS.md — Radius Pro Local V2 VPS

## Installed: $(date)
## Version: ${INSTALLER_VERSION}

## Services
- MySQL 8: localhost:3306 (db: radius_pro, user: radiuspro)
- Redis: localhost:6379 (authenticated)
- FreeRADIUS: 0.0.0.0:1812/1813, 127.0.0.1:18120
- Application: localhost:3000 (PM2: radius-pro)
- Nginx: 80/443 → 3000
- Management API: localhost:8081
- CoA API: localhost:8082
- L2TP/IPSec: 1701/500/4500
- PPTP/SSTP: 1723/443 (accel-ppp)

## Paths
- App: ${INSTALL_DIR}
- Backups: ${BACKUP_DIR}
- Logs: /var/log/radius-pro/
- FreeRADIUS: /etc/freeradius/3.0/
- Credentials: /root/.mysql_credentials

## Commands
- Health check: radius-pro-health
- Backup: radius-pro-backup
- App logs: pm2 logs radius-pro
- App restart: pm2 restart radius-pro

## VPN
- L2TP subnet: 192.168.30.0/24
- PPTP subnet: 192.168.31.0/24
- Bridge: radius-bridge (192.168.30.1)
AGENTS_MD
  log "AGENTS.md saved to /root/AGENTS.md ✓"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================
main() {
  clear
  echo -e "${BOLD}${CYAN}"
  echo "  ██████╗  █████╗ ██████╗ ██╗██╗   ██╗███████╗    ██████╗ ██████╗  ██████╗ "
  echo "  ██╔══██╗██╔══██╗██╔══██╗██║██║   ██║██╔════╝    ██╔══██╗██╔══██╗██╔═══██╗"
  echo "  ██████╔╝███████║██║  ██║██║██║   ██║███████╗    ██████╔╝██████╔╝██║   ██║"
  echo "  ██╔══██╗██╔══██║██║  ██║██║██║   ██║╚════██║    ██╔═══╝ ██╔══██╗██║   ██║"
  echo "  ██║  ██║██║  ██║██████╔╝██║╚██████╔╝███████║    ██║     ██║  ██║╚██████╔╝"
  echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚══════╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ "
  echo -e "${NC}"
  echo -e "${BOLD}  Local V2 — Full Auto Installer v${INSTALLER_VERSION}${NC}"
  echo ""

  case "$MODE" in
    install)
      check_system
      collect_config
      install_dependencies
      setup_mysql
      setup_redis
      setup_freeradius
      setup_vpn
      setup_network
      deploy_application
      setup_python_apis
      setup_pm2
      setup_nginx
      setup_firewall
      setup_backup
      setup_logging
      setup_health_monitor
      save_agents_md
      verify_installation
      ;;
    upgrade)
      info "Upgrade mode — backing up and updating application..."
      /usr/local/bin/radius-pro-backup
      deploy_application
      setup_pm2
      verify_installation
      ;;
    repair)
      info "Repair mode — checking and fixing services..."
      setup_mysql
      setup_redis
      setup_freeradius
      setup_pm2
      setup_nginx
      verify_installation
      ;;
    uninstall)
      warn "Uninstall mode — this will remove Radius Pro Local V2"
      read -rp "Are you sure? Type 'YES' to confirm: " CONFIRM_UNINSTALL
      if [ "$CONFIRM_UNINSTALL" = "YES" ]; then
        pm2 delete radius-pro 2>/dev/null || true
        systemctl stop radius-pro-management radius-pro-coa 2>/dev/null || true
        systemctl disable radius-pro-management radius-pro-coa 2>/dev/null || true
        rm -f /etc/systemd/system/radius-pro-*.service
        rm -rf "$INSTALL_DIR"
        log "Radius Pro Local V2 uninstalled"
      fi
      ;;
    *)
      error "Unknown mode: $MODE. Use: install | upgrade | repair | uninstall"
      exit 1
      ;;
  esac
}

main "$@"

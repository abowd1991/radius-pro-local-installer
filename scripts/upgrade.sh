#!/usr/bin/env bash
# Radius Pro Local V2 — Upgrade Script
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
error(){ echo -e "${RED}[✗]${NC} $*" >&2; }

INSTALL_DIR="/opt/radius-pro"
BACKUP_DIR="/opt/backups/radius-pro"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

[ "$EUID" -ne 0 ] && { error "Run as root: sudo bash upgrade.sh"; exit 1; }
[ ! -d "$INSTALL_DIR" ] && { error "Radius Pro not installed at $INSTALL_DIR"; exit 1; }

echo "=== Radius Pro Local V2 — Upgrade ==="
echo "Time: $(date)"
echo ""

# Backup before upgrade
warn "Creating backup before upgrade..."
mkdir -p "$BACKUP_DIR"
/usr/local/bin/radius-pro-backup 2>/dev/null && log "Backup created ✓" || warn "Backup failed — proceeding anyway"

# Pull latest code
cd "$INSTALL_DIR"
git fetch origin
CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)
log "Current version: $CURRENT_TAG"

git checkout radius-pro-local-v2-production-ready 2>/dev/null || git pull origin main
NEW_TAG=$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)
log "New version: $NEW_TAG"

# Install dependencies
pnpm install --frozen-lockfile 2>&1 | tail -3
log "Dependencies updated ✓"

# Build
NODE_OPTIONS="--max-old-space-size=1024" pnpm build 2>&1 | tail -5
log "Application built ✓"

# Restart application (zero-downtime reload)
pm2 reload radius-pro --update-env 2>/dev/null || pm2 restart radius-pro
log "Application restarted ✓"

echo ""
log "Upgrade complete: $CURRENT_TAG → $NEW_TAG"

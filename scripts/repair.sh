#!/usr/bin/env bash
# Radius Pro Local V2 — Repair Script
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash repair.sh"; exit 1; }

echo "=== Radius Pro Local V2 — Repair ==="

# MySQL
systemctl is-active --quiet mysql || { warn "MySQL stopped — restarting..."; systemctl restart mysql; }
log "MySQL ✓"

# Redis
systemctl is-active --quiet redis-server || { warn "Redis stopped — restarting..."; systemctl restart redis-server; }
log "Redis ✓"

# FreeRADIUS
systemctl is-active --quiet freeradius || { warn "FreeRADIUS stopped — restarting..."; systemctl restart freeradius; }
log "FreeRADIUS ✓"

# Nginx
systemctl is-active --quiet nginx || { warn "Nginx stopped — restarting..."; systemctl restart nginx; }
log "Nginx ✓"

# PM2 Application
pm2 list 2>/dev/null | grep -q "radius-pro" || { warn "App not in PM2 — starting..."; cd /opt/radius-pro && pm2 start ecosystem.config.cjs; }
pm2 list 2>/dev/null | grep "radius-pro" | grep -q "stopped" && pm2 restart radius-pro
log "Application ✓"

# Python APIs
systemctl is-active --quiet radius-pro-management || systemctl restart radius-pro-management 2>/dev/null || true
systemctl is-active --quiet radius-pro-coa || systemctl restart radius-pro-coa 2>/dev/null || true
log "Python APIs ✓"

echo ""
log "Repair complete — run 'radius-pro-health' to verify"

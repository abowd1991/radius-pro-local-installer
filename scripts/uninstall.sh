#!/usr/bin/env bash
# Radius Pro Local V2 — Uninstall Script
set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash uninstall.sh"; exit 1; }

echo -e "${RED}=== Radius Pro Local V2 — Uninstall ===${NC}"
echo ""
echo -e "${YELLOW}WARNING: This will remove Radius Pro and all its data.${NC}"
echo -e "${YELLOW}A backup will be created first.${NC}"
echo ""
read -rp "Type 'UNINSTALL' to confirm: " CONFIRM
[ "$CONFIRM" != "UNINSTALL" ] && { echo "Cancelled."; exit 0; }

# Final backup
echo "Creating final backup..."
/usr/local/bin/radius-pro-backup 2>/dev/null || true

# Stop and remove PM2
pm2 delete radius-pro 2>/dev/null || true
pm2 save 2>/dev/null || true

# Stop and disable services
for svc in radius-pro-management radius-pro-coa; do
  systemctl stop "$svc" 2>/dev/null || true
  systemctl disable "$svc" 2>/dev/null || true
  rm -f "/etc/systemd/system/${svc}.service"
done
systemctl daemon-reload

# Remove application
rm -rf /opt/radius-pro
rm -rf /opt/radius-pro-apis
rm -f /usr/local/bin/radius-pro-backup
rm -f /usr/local/bin/radius-pro-health
rm -f /etc/cron.d/radius-pro-backup
rm -f /etc/logrotate.d/radius-pro
rm -f /etc/nginx/sites-available/radius-pro
rm -f /etc/nginx/sites-enabled/radius-pro
nginx -s reload 2>/dev/null || true

echo ""
echo -e "${GREEN}Uninstall complete.${NC}"
echo "Backups preserved at: /opt/backups/radius-pro"
echo "MySQL and Redis data preserved — remove manually if needed."

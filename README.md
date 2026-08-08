# Radius Pro Local V2 — Full Auto Installer

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/abowd1991/radius-pro-local-installer/main/install.sh | sudo bash
```

Or clone and run:

```bash
git clone https://github.com/abowd1991/radius-pro-local-installer.git
cd radius-pro-local-installer
sudo bash install.sh
```

## Requirements

- Ubuntu 22.04 LTS
- Minimum 1 CPU, 512MB RAM, 5GB disk
- Root/sudo access
- Internet connectivity

## What Gets Installed

| Component | Version | Port |
|---|---|---|
| Node.js | 22.x | - |
| MySQL | 8.x | 3306 (local only) |
| Redis | 6.x | 6379 (local only) |
| FreeRADIUS | 3.x | 1812, 1813, 3799 |
| Nginx | latest | 80, 443 |
| PM2 | latest | - |
| L2TP/IPSec | - | 1701, 500, 4500 |
| PPTP/SSTP | accel-ppp | 1723, 443 |
| Management API | Python | 8081 (local) |
| CoA API | Python | 8082 (local) |

## Modes

```bash
sudo bash install.sh           # Fresh install
sudo bash install.sh upgrade   # Upgrade application
sudo bash install.sh repair    # Repair services
sudo bash install.sh uninstall # Remove installation
```

## After Installation

- Health check: `radius-pro-health`
- Manual backup: `radius-pro-backup`
- App logs: `pm2 logs radius-pro`
- App restart: `pm2 restart radius-pro`
- Credentials: `/root/.mysql_credentials`
- Install log: `/var/log/radius-pro-install.log`

## Architecture

```
Internet → Nginx (80/443) → Node.js App (3000)
                                ↓
                    MySQL (3306) + Redis (6379)
                                ↓
MikroTik/NAS → FreeRADIUS (1812/1813) → radius_pro DB
                                ↓
VPN Clients → L2TP/IPSec + PPTP/SSTP → 192.168.30-31.0/24
```

## Version

**Radius Pro Local V2 Production Ready**
Tag: `radius-pro-local-v2-production-ready`

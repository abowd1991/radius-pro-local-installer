# Radius Pro Local V2 — Backup & Restore Guide

## Automatic Backups

Backups run automatically every day at 2:00 AM.
Location: `/opt/backups/radius-pro/`
Retention: Last 30 backups
Format: `radius_pro_YYYYMMDD_HHMMSS.sql.gz`

## Manual Backup

```bash
radius-pro-backup
```

## Restore from Backup

```bash
# List available backups
ls -lh /opt/backups/radius-pro/

# Restore specific backup
gunzip -c /opt/backups/radius-pro/radius_pro_20260101_020000.sql.gz | \
  mysql -u radiuspro -p radius_pro

# Restart application after restore
pm2 restart radius-pro
```

## Full System Backup (before upgrade)

```bash
# Database
radius-pro-backup

# Application files
tar -czf /opt/backups/radius-pro/app_$(date +%Y%m%d).tar.gz /opt/radius-pro/

# FreeRADIUS config
tar -czf /opt/backups/radius-pro/freeradius_$(date +%Y%m%d).tar.gz /etc/freeradius/
```

## Backup Log

```bash
tail -50 /var/log/radius-pro-backup.log
```


#!/usr/bin/env python3
"""
VPN Management API - L2TP/IPSec Edition
Replaces SoftEther-based API with native L2TP/IPSec management
Manages users via /etc/ppp/chap-secrets and xl2tpd/strongSwan
"""
from flask import Flask, request, jsonify
import json
import subprocess
import os
import threading
import re
import fcntl
import glob
from datetime import datetime
try:
    import pymysql
    HAS_PYMYSQL = True
except ImportError:
    HAS_PYMYSQL = False

app = Flask(__name__)
def _decode_chunked(data):
    """Decode HTTP chunked transfer encoding."""
    decoded = b''
    pos = 0
    while pos < len(data):
        # Find end of chunk size line
        crlf = data.find(b'\r\n', pos)
        if crlf == -1:
            break
        chunk_size_str = data[pos:crlf].decode('ascii', errors='replace').split(';')[0].strip()
        if not chunk_size_str:
            break
        try:
            chunk_size = int(chunk_size_str, 16)
        except ValueError:
            break
        if chunk_size == 0:
            break
        pos = crlf + 2
        decoded += data[pos:pos + chunk_size]
        pos += chunk_size + 2  # skip CRLF after chunk data
    return decoded


API_KEY = os.environ.get('RADIUS_PRO_VPN_API_KEY', '')

# File paths
CHAP_SECRETS = '/etc/ppp/chap-secrets'
XL2TPD_CONF = '/etc/xl2tpd/xl2tpd.conf'
PPP_OPTIONS = '/etc/ppp/options.xl2tpd'
DYNAMIC_CLIENTS_DIR = '/etc/freeradius/3.0/dynamic-clients'

# IP Pool Configuration (L2TP)
IP_POOL_START = os.environ.get('RADIUS_PRO_L2TP_POOL_START', '192.168.30.10')
IP_POOL_END = os.environ.get('RADIUS_PRO_L2TP_POOL_END', '192.168.30.250')
LOCAL_IP = os.environ.get('RADIUS_PRO_L2TP_LOCAL_IP', '192.168.30.1')
# IP Pool Configuration (SSTP)
SSTP_POOL_START = os.environ.get('RADIUS_PRO_SSTP_POOL_START', '192.168.31.100')
SSTP_POOL_END = os.environ.get('RADIUS_PRO_SSTP_POOL_END', '192.168.31.254')
SSTP_LOCAL_IP = os.environ.get('RADIUS_PRO_SSTP_LOCAL_IP', '192.168.31.1')
# IP Pool Configuration (PPTP)
PPTP_POOL_START = os.environ.get('RADIUS_PRO_PPTP_POOL_START', '192.168.32.10')
PPTP_POOL_END = os.environ.get('RADIUS_PRO_PPTP_POOL_END', '192.168.32.245')
PPTP_LOCAL_IP = os.environ.get('RADIUS_PRO_PPTP_LOCAL_IP', '192.168.32.1')

# Database Configuration (TiDB Cloud)
DB_CONFIG = {
    'host': os.environ.get('RADIUS_PRO_DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('RADIUS_PRO_DB_PORT', '3306')),
    'user': os.environ.get('RADIUS_PRO_DB_USER', 'radiuspro'),
    'password': os.environ.get('RADIUS_PRO_DB_PASSWORD', ''),
    'database': os.environ.get('RADIUS_PRO_DB_NAME', 'radius_pro'),
    'ssl': None,
    'connect_timeout': 5,
}


def get_nas_info_from_db(allocated_ip):
    """
    استعلام secret و shortname للـ NAS من قاعدة البيانات بناءً على الـ IP المخصص
    يُستخدم لكتابة dynamic client لـ FreeRADIUS تلقائياً
    """
    if not HAS_PYMYSQL:
        return None, None
    try:
        conn = pymysql.connect(**DB_CONFIG)
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT secret, shortname FROM nas WHERE allocatedIp = %s OR nasname = %s LIMIT 1",
                (allocated_ip, allocated_ip)
            )
            row = cursor.fetchone()
        conn.close()
        if row:
            return row[0], row[1]  # secret, shortname
        return None, None
    except Exception as e:
        print(f'DB Error in get_nas_info_from_db: {e}')
        return None, None


def check_auth():
    """Check API key authentication"""
    return bool(API_KEY) and request.headers.get('X-API-Key') == API_KEY


def read_chap_secrets():
    """Read and parse chap-secrets file (skips @VPN duplicate entries)"""
    users = []
    if not os.path.exists(CHAP_SECRETS):
        return users
    with open(CHAP_SECRETS, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if len(parts) >= 3:
                username = parts[0]
                # Skip @VPN duplicate entries (auto-generated)
                if username.endswith('@VPN'):
                    continue
                users.append({
                    'username': username,
                    'server': parts[1],
                    'password': parts[2],
                    'ip': parts[3] if len(parts) >= 4 else '*'
                })
    return users


def write_chap_secrets(users):
    """Write users to chap-secrets file atomically"""
    content = "# Secrets for authentication using CHAP\n"
    content += "# client    server    secret    IP addresses\n"
    content += "# VPN users are managed automatically by the API\n"
    content += "# Each user has two entries: plain and @VPN (for MikroTik L2TP clients)\n"
    for user in users:
        ip = user.get('ip', '*')
        username = user['username']
        # Skip @VPN entries when writing (we auto-generate them)
        if username.endswith('@VPN'):
            continue
        content += f"{username}\t*\t{user['password']}\t{ip}\n"
        # MikroTik sends username@VPN, so add duplicate entry
        content += f"{username}@VPN\t*\t{user['password']}\t{ip}\n"
    
    # Atomic write with file locking
    tmp_file = CHAP_SECRETS + '.tmp'
    with open(tmp_file, 'w') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
        fcntl.flock(f, fcntl.LOCK_UN)
    
    os.chmod(tmp_file, 0o600)
    os.rename(tmp_file, CHAP_SECRETS)


def write_dynamic_client_file(nas_ip, secret, shortname='NAS'):
    """
    كتابة ملف client ديناميكي لـ FreeRADIUS
    يُحمَّل تلقائياً عند أول طلب RADIUS من هذا الـ IP بدون restart
    """
    if not os.path.isdir(DYNAMIC_CLIENTS_DIR):
        os.makedirs(DYNAMIC_CLIENTS_DIR, exist_ok=True)
    
    client_file = os.path.join(DYNAMIC_CLIENTS_DIR, nas_ip)
    content = f"""client {nas_ip} {{
    ipaddr = {nas_ip}
    secret = {secret}
    shortname = {shortname}
    nas_type = other
    require_message_authenticator = no
}}
"""
    with open(client_file, 'w') as f:
        f.write(content)
    
    try:
        import pwd
        freerad_uid = pwd.getpwnam('freerad').pw_uid
        freerad_gid = pwd.getpwnam('freerad').pw_gid
        os.chown(client_file, freerad_uid, freerad_gid)
    except Exception:
        pass
    os.chmod(client_file, 0o640)


def delete_dynamic_client_file(nas_ip):
    """حذف ملف client الديناميكي عند إزالة NAS"""
    client_file = os.path.join(DYNAMIC_CLIENTS_DIR, nas_ip)
    if os.path.exists(client_file):
        os.remove(client_file)


def get_accel_sstp_sessions():
    """Return authenticated accel-ppp SSTP sessions with their real usernames."""
    try:
        result = subprocess.run(
            ['accel-cmd', 'show sessions', 'ifname,username,ip,type,state,uptime'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return []

        sessions = []
        for line in result.stdout.splitlines():
            if '|' not in line or line.lstrip().startswith(('ifname', '---')):
                continue
            values = [value.strip() for value in line.split('|')]
            if len(values) < 6:
                continue
            ifname, username, peer_ip, session_type, state, uptime = values[:6]
            if session_type != 'sstp' or state != 'active' or not username:
                continue
            sessions.append({
                'sessionName': ifname,
                'username': username,
                'localIp': peer_ip,
                'serverIp': SSTP_LOCAL_IP,
                'interface': ifname,
                'connectedAt': '',
                'protocol': 'sstp',
                'uptime': uptime,
            })
        return sessions
    except Exception:
        return []


def get_live_l2tp_interfaces():
    """Return PPP interfaces owned by currently running xl2tpd child pppd processes."""
    live_interfaces = set()
    try:
        xl2tpd = subprocess.run(['ps', '-C', 'xl2tpd', '-o', 'pid='], capture_output=True, text=True)
        xl2tpd_pids = {line.strip() for line in xl2tpd.stdout.splitlines() if line.strip()}
        if not xl2tpd_pids:
            return live_interfaces
        processes = subprocess.run(['ps', '-eo', 'pid=,ppid=,args='], capture_output=True, text=True)
        active_pppd_pids = set()
        for line in processes.stdout.splitlines():
            parts = line.strip().split(None, 2)
            if len(parts) == 3 and parts[1] in xl2tpd_pids and 'pppd' in parts[2]:
                active_pppd_pids.add(parts[0])
        if not active_pppd_pids:
            return live_interfaces
        journal = subprocess.run(
            ['journalctl', '-u', 'xl2tpd', '--since', '15 minutes ago', '--no-pager'],
            capture_output=True, text=True, timeout=5
        )
        for pid in active_pppd_pids:
            matches = re.findall(r'pppd\[' + re.escape(pid) + r'\]: Connect: (ppp\d+)', journal.stdout)
            if matches:
                live_interfaces.add(matches[-1])
    except Exception:
        return set()
    return live_interfaces


def get_active_ppp_sessions():
    """Return live L2TP/PPTP interfaces plus authoritative accel-ppp SSTP sessions."""
    sessions = []
    live_l2tp_interfaces = get_live_l2tp_interfaces()
    try:
        result = subprocess.run(['ip', '-4', 'addr', 'show'], capture_output=True, text=True)
        ppp_interfaces = []
        current_iface = None
        for line in result.stdout.split('\n'):
            match = re.match(r'^\d+:\s+(ppp\d+)', line)
            if match:
                current_iface = match.group(1)
            elif current_iface and 'inet ' in line:
                ip_match = re.search(r'inet\s+(\S+)', line)
                if ip_match:
                    local_ip = ip_match.group(1).split('/')[0]
                    peer_search = re.search(r'peer\s+([\d.]+)', line)
                    ppp_interfaces.append({
                        'interface': current_iface,
                        'localIp': local_ip,
                        'peerIp': peer_search.group(1) if peer_search else '',
                    })
                current_iface = None
    except Exception:
        ppp_interfaces = []
    chap_users = read_chap_secrets()
    ip_to_user = {user['ip']: user['username'] for user in chap_users if user['ip'] != '*'}
    for iface_info in ppp_interfaces:
        peer_ip = iface_info.get('peerIp', '')
        # L2TP ppp interfaces can outlive their tunnel.  Only the interface
        # explicitly reported by its running xl2tpd child pppd is online.
        if peer_ip.startswith('192.168.30.') and iface_info['interface'] not in live_l2tp_interfaces:
            continue
        sessions.append({
            'sessionName': iface_info['interface'],
            'username': ip_to_user.get(peer_ip, 'unknown'),
            'localIp': peer_ip,
            'serverIp': iface_info['localIp'],
            'interface': iface_info['interface'],
            'connectedAt': '',
        })
    sessions.extend(get_accel_sstp_sessions())
    return sessions

def find_next_available_ip(connection_type='l2tp'):
    """Find next available IP from the pool based on connection type"""
    used_ips = set()
    
    # Get IPs from chap-secrets
    users = read_chap_secrets()
    for u in users:
        if u['ip'] != '*':
            used_ips.add(u['ip'])
    
    # Get IPs from active sessions
    sessions = get_active_ppp_sessions()
    for s in sessions:
        if s.get('localIp'):
            used_ips.add(s['localIp'])
    
    # Choose pool based on connection type
    if connection_type == 'sstp':
        start = SSTP_POOL_START
        end = SSTP_POOL_END
    elif connection_type == 'pptp':
        start = PPTP_POOL_START
        end = PPTP_POOL_END
    else:
        start = IP_POOL_START
        end = IP_POOL_END
    
    start_parts = start.split('.')
    end_parts = end.split('.')
    prefix = '.'.join(start_parts[:3])
    
    for i in range(int(start_parts[3]), int(end_parts[3]) + 1):
        ip = f"{prefix}.{i}"
        if ip not in used_ips:
            return ip
    
    return None


# ========================================
# Health Check
# ========================================
@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    # Check strongSwan
    ipsec_status = 'unknown'
    try:
        result = subprocess.run(['ipsec', 'status'], capture_output=True, text=True, timeout=5)
        ipsec_status = 'running' if result.returncode == 0 else 'stopped'
    except:
        ipsec_status = 'error'
    
    # Check xl2tpd
    xl2tpd_status = 'unknown'
    try:
        result = subprocess.run(['systemctl', 'is-active', 'xl2tpd'], capture_output=True, text=True, timeout=5)
        xl2tpd_status = result.stdout.strip()
    except:
        xl2tpd_status = 'error'
    
    # Check FreeRADIUS
    radius_status = 'unknown'
    try:
        result = subprocess.run(['systemctl', 'is-active', 'freeradius'], capture_output=True, text=True, timeout=5)
        radius_status = result.stdout.strip()
    except:
        radius_status = 'error'
    
    return jsonify({
        'status': 'ok',
        'success': True,
        'services': {
            'vpn': f'ipsec:{ipsec_status},xl2tpd:{xl2tpd_status}',
            'radius': radius_status
        },
        'timestamp': datetime.now().isoformat()
    })


# ========================================
# VPN User Management
# ========================================
@app.route('/api/vpn/users', methods=['POST'])
def create_user():
    """Create a VPN user in chap-secrets"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    static_ip = data.get('staticIp', '').strip()
    nas_secret = data.get('nasSecret', '').strip()  # RADIUS secret للـ NAS
    nas_shortname = data.get('shortname', 'NAS').strip()  # اسم الـ NAS
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Missing username or password'})
    
    # Sanitize username (no spaces or special chars)
    username = re.sub(r'[^\w\-.]', '', username)
    
    users = read_chap_secrets()
    
    # Check if user already exists
    for u in users:
        if u['username'] == username:
            # Update password and IP if user exists
            u['password'] = password
            if static_ip:
                u['ip'] = static_ip
            write_chap_secrets(users)
            return jsonify({'success': True, 'message': f'User {username} updated'})
    
    # Assign IP based on connection type
    connection_type = data.get('connectionType', 'l2tp').strip().lower()
    if not static_ip:
        static_ip = find_next_available_ip(connection_type)
        if not static_ip:
            return jsonify({'success': False, 'error': 'No available IPs in pool'})
    
    # Add new user
    users.append({
        'username': username,
        'server': '*',
        'password': password,
        'ip': static_ip
    })
    
    write_chap_secrets(users)
    
    # إعادة تشغيل FreeRADIUS ليقرأ الـ NAS الجديد من جدول nas في TiDB
    if static_ip:
        restart_freeradius_for_new_nas(f'new VPN user {username} with NAS IP {static_ip}')
    
    return jsonify({
        'success': True,
        'message': f'User {username} created with IP {static_ip}',
        'assignedIp': static_ip
    })


@app.route('/api/vpn/users/<username>', methods=['DELETE'])
def delete_user(username):
    """Delete a VPN user"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    username = re.sub(r'[^\w\-.]', '', username)
    
    users = read_chap_secrets()
    original_count = len(users)
    # الحصول على الـ IP قبل الحذف
    user_ip = next((u['ip'] for u in users if u['username'] == username), None)
    users = [u for u in users if u['username'] != username]
    
    if len(users) == original_count:
        return jsonify({'success': False, 'error': 'User not found'})
    
    write_chap_secrets(users)
    
    # حذف ملف dynamic client من FreeRADIUS
    # فقط إذا لم يكن هناك مستخدمون آخرون على نفس الـ IP
    if user_ip and user_ip != '*':
        remaining_on_same_ip = [u for u in users if u.get('ip') == user_ip]
        if not remaining_on_same_ip:
            delete_dynamic_client_file(user_ip)
    
    # Disconnect active session for this user
    disconnect_user_sessions(username)
    
    return jsonify({'success': True, 'message': f'User {username} deleted'})


@app.route('/api/vpn/users', methods=['GET'])
def list_users():
    """List all VPN users"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    users = read_chap_secrets()
    sessions = get_active_ppp_sessions()
    
    # Build connected users set
    connected_users = set()
    for s in sessions:
        if s.get('username'):
            connected_users.add(s['username'].lower())
    
    user_list = []
    for u in users:
        user_list.append({
            'username': u['username'],
            'assignedIp': u['ip'],
            'connected': u['username'].lower() in connected_users,
            'authMethod': 'CHAP'
        })
    
    return jsonify({'success': True, 'users': user_list})


# ========================================
# VPN Session Management
# ========================================
@app.route('/api/vpn/sessions', methods=['GET'])
def list_sessions():
    """Get active VPN sessions"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    sessions = get_active_ppp_sessions()
    
    return jsonify({
        'success': True,
        'sessions': sessions,
        'count': len(sessions)
    })


@app.route('/api/vpn/sessions/<session_name>', methods=['DELETE'])
def disconnect_session(session_name):
    """Disconnect a VPN session by interface name"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    session_name = re.sub(r'[^\w]', '', session_name)
    
    try:
        # Find PID for this ppp interface
        pid_file = f'/var/run/{session_name}.pid'
        if os.path.exists(pid_file):
            with open(pid_file, 'r') as f:
                pid = f.read().strip()
            subprocess.run(['kill', pid], capture_output=True)
            return jsonify({'success': True, 'message': f'Session {session_name} disconnected'})
        
        # Try killing by interface
        subprocess.run(['ip', 'link', 'delete', session_name], capture_output=True)
        return jsonify({'success': True, 'message': f'Session {session_name} disconnected'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/vpn/user/<username>/disconnect', methods=['POST'])
def disconnect_user_endpoint(username):
    """Disconnect all sessions for a user"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    count = disconnect_user_sessions(username)
    return jsonify({
        'success': True,
        'message': f'Disconnected {count} sessions for {username}'
    })


def disconnect_user_sessions(username):
    """Internal: disconnect all sessions for a username"""
    username = username.lower()
    sessions = get_active_ppp_sessions()
    count = 0
    
    for s in sessions:
        if s.get('username', '').lower() == username:
            iface = s.get('interface', '')
            if iface:
                pid_file = f'/var/run/{iface}.pid'
                if os.path.exists(pid_file):
                    try:
                        with open(pid_file, 'r') as f:
                            pid = f.read().strip()
                        subprocess.run(['kill', pid], capture_output=True)
                        count += 1
                    except:
                        pass
    
    return count


@app.route('/api/vpn/user/<username>/sessions', methods=['GET'])
def get_user_sessions(username):
    """Get sessions for a specific user"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    username = username.lower()
    sessions = get_active_ppp_sessions()
    user_sessions = [s for s in sessions if s.get('username', '').lower() == username]
    
    return jsonify({
        'success': True,
        'sessions': user_sessions,
        'connected': len(user_sessions) > 0
    })


@app.route('/api/vpn/session/<username>/mac', methods=['GET'])
def get_session_mac(username):
    """
    يُرجع MAC address ومعلومات الاتصال لمستخدم محدد
    يستخدمه radius-saas للتحقق من اتصال NAS بعد الـ provisioning
    """
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    username_clean = re.sub(r'[^\w\-.]', '', username).lower()
    sessions = get_active_ppp_sessions()
    
    # البحث عن الجلسة الخاصة بهذا المستخدم
    for s in sessions:
        session_user = s.get('username', '').lower().replace('@vpn', '')
        if session_user == username_clean or session_user == username_clean.replace('@vpn', ''):
            peer_ip = s.get('localIp', '')
            return jsonify({
                'success': True,
                'username': username,
                'connected': True,
                'peerIp': peer_ip,
                'interface': s.get('interface', ''),
                # L2TP لا يوفر MAC حقيقي لذا نستخدم IP كمعرف
                'mac': f'00:00:00:00:00:00',
                'ip': peer_ip
            })
    
    # المستخدم غير متصل حالياً - نتحقق من chap-secrets
    users = read_chap_secrets()
    for u in users:
        if u['username'].lower() == username_clean:
            return jsonify({
                'success': True,
                'username': username,
                'connected': False,
                'peerIp': u.get('ip', ''),
                'mac': '00:00:00:00:00:00',
                'ip': u.get('ip', '')
            })
    
    return jsonify({
        'success': False,
        'error': 'User not found',
        'username': username,
        'connected': False
    }), 404


# ========================================
# VPN Status
# ========================================
@app.route('/api/vpn/status', methods=['GET'])
def vpn_status():
    """Get VPN server status"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    # strongSwan status
    ipsec_result = subprocess.run(['ipsec', 'statusall'], capture_output=True, text=True, timeout=10)
    
    # xl2tpd status
    xl2tpd_result = subprocess.run(['systemctl', 'status', 'xl2tpd'], capture_output=True, text=True, timeout=5)
    
    # Count active sessions
    sessions = get_active_ppp_sessions()
    
    # Count users
    users = read_chap_secrets()
    
    return jsonify({
        'success': True,
        'status': {
            'ipsec': 'running' if ipsec_result.returncode == 0 else 'stopped',
            'xl2tpd': 'active' in xl2tpd_result.stdout,
            'activeSessions': len(sessions),
            'totalUsers': len(users),
            'serverIp': LOCAL_IP,
            'ipRange': f'{IP_POOL_START}-{IP_POOL_END}'
        }
    })


# ========================================
# VPN Logs
# ========================================
@app.route('/api/vpn/logs', methods=['GET'])
def vpn_logs():
    """Get VPN connection logs - parsed into structured events"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    try:
        import re
        from datetime import datetime

        limit = int(request.args.get('limit', 200))

        # Fetch raw logs from pppd and xl2tpd
        result = subprocess.run(
            ['journalctl', '-u', 'xl2tpd', '-u', 'ppp', '--no-pager', '-n', '1000', '--output=short-iso'],
            capture_output=True, text=True, timeout=15
        )

        events = []
        # Track pending events by PID to correlate username + IP
        pid_username = {}   # pid -> username
        pid_interface = {}  # pid -> interface (pppX)
        pid_remote_ip = {}  # pid -> remote IP
        pid_timestamp = {}  # pid -> timestamp

        for line in result.stdout.split('\n'):
            if not line.strip():
                continue

            # Parse timestamp - format: 2026-04-30T01:53:00+0200
            ts_match = re.match(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4})', line)
            timestamp = ts_match.group(1) if ts_match else ''

            # Extract PID
            pid_match = re.search(r'pppd\[(\d+)\]', line)
            xl2_pid_match = re.search(r'xl2tpd\[(\d+)\]', line)

            pid = pid_match.group(1) if pid_match else (xl2_pid_match.group(1) if xl2_pid_match else None)

            if pid:
                if timestamp:
                    pid_timestamp[pid] = timestamp

            # xl2tpd: Call established - new connection attempt
            if 'Call established with' in line and xl2_pid_match:
                ip_match = re.search(r'Call established with (\d+\.\d+\.\d+\.\d+)', line)
                if ip_match:
                    events.append({
                        'eventType': 'connecting',
                        'timestamp': timestamp,
                        'ipAddress': ip_match.group(1),
                        'username': None,
                        'interface': None,
                        'message': f'New L2TP connection from {ip_match.group(1)}'
                    })

            # pppd: Using interface pppX
            if pid_match and 'Using interface ppp' in line:
                iface_match = re.search(r'Using interface (ppp\d+)', line)
                if iface_match:
                    pid_interface[pid] = iface_match.group(1)

            # pppd: CHAP Success - authentication successful, extract username
            if pid_match and 'CHAP Response' in line and 'name = "' in line:
                user_match = re.search(r'name = "([^"]+)"', line)
                if user_match:
                    username = user_match.group(1)
                    # Remove @VPN suffix if present
                    username = username.replace('@VPN', '').strip()
                    pid_username[pid] = username

            # pppd: sent [CHAP Success - confirmed authentication
            if pid_match and 'CHAP Success' in line and 'Access granted' in line:
                username = pid_username.get(pid, 'unknown')
                iface = pid_interface.get(pid, '')
                events.append({
                    'eventType': 'connected',
                    'timestamp': timestamp,
                    'ipAddress': None,
                    'username': username,
                    'interface': iface,
                    'message': f'User {username} authenticated successfully'
                })

            # pppd: remote IP address assigned
            if pid_match and 'remote  IP address' in line:
                ip_match = re.search(r'remote  IP address (\d+\.\d+\.\d+\.\d+)', line)
                if ip_match:
                    pid_remote_ip[pid] = ip_match.group(1)
                    username = pid_username.get(pid, 'unknown')
                    iface = pid_interface.get(pid, '')
                    events.append({
                        'eventType': 'session_start',
                        'timestamp': timestamp,
                        'ipAddress': ip_match.group(1),
                        'username': username,
                        'interface': iface,
                        'message': f'Session started: {username} assigned IP {ip_match.group(1)}'
                    })

            # pppd: Hangup or Terminating - disconnection
            if pid_match and ('Hangup' in line or 'Terminating' in line or 'Connection terminated' in line):
                username = pid_username.get(pid, 'unknown')
                iface = pid_interface.get(pid, '')
                remote_ip = pid_remote_ip.get(pid, '')
                events.append({
                    'eventType': 'disconnected',
                    'timestamp': timestamp,
                    'ipAddress': remote_ip,
                    'username': username,
                    'interface': iface,
                    'message': f'User {username} disconnected'
                })
                # Cleanup
                for d in [pid_username, pid_interface, pid_remote_ip, pid_timestamp]:
                    d.pop(pid, None)

            # pppd: RADIUS auth failed
            if pid_match and ('Authentication failed' in line or 'CHAP authentication failed' in line):
                username = pid_username.get(pid, 'unknown')
                events.append({
                    'eventType': 'error',
                    'timestamp': timestamp,
                    'ipAddress': None,
                    'username': username,
                    'interface': pid_interface.get(pid, ''),
                    'message': f'Authentication failed for {username}'
                })

        # Sort by timestamp descending and limit
        events.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        events = events[:limit]

        return jsonify({'success': True, 'logs': events, 'total': len(events)})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'logs': []})

# ========================================
# NAS Provisioning (compatible with radius-saas)
# ========================================
@app.route('/api/nas/provision', methods=['POST'])
def provision_nas():
    """Auto-provision a new NAS (create VPN user with static IP)"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    nas_id = data.get('nasId')
    vpn_username = data.get('vpnUsername')
    vpn_password = data.get('vpnPassword')
    target_ip = data.get('targetIp')
    shortname = data.get('shortname', 'NAS')
    
    if not all([nas_id, vpn_username, vpn_password]):
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
    
    results = {'steps': []}
    
    try:
        # Assign IP if not provided
        if not target_ip:
            target_ip = find_next_available_ip()
            if not target_ip:
                return jsonify({'success': False, 'error': 'No available IPs in pool'}), 500
        
        # Create user with static IP
        users = read_chap_secrets()
        
        # Remove existing user if any
        users = [u for u in users if u['username'] != vpn_username]
        
        # Add user with assigned IP
        users.append({
            'username': vpn_username,
            'server': '*',
            'password': vpn_password,
            'ip': target_ip
        })
        
        write_chap_secrets(users)
        results['steps'].append({'step': 'create_user', 'success': True})
        
        results['success'] = True
        results['vpnUsername'] = vpn_username
        results['targetIp'] = target_ip
        results['assignedIp'] = target_ip
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/nas/deprovision', methods=['POST'])
def deprovision_nas():
    """Remove NAS provisioning"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    vpn_username = data.get('vpnUsername')
    
    if not vpn_username:
        return jsonify({'success': False, 'error': 'Missing vpnUsername'}), 400
    
    try:
        # Disconnect sessions
        disconnect_user_sessions(vpn_username)
        
        # Delete user
        users = read_chap_secrets()
        users = [u for u in users if u['username'] != vpn_username]
        write_chap_secrets(users)
        
        return jsonify({'success': True, 'message': f'User {vpn_username} deprovisioned'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========================================
# DHCP Lease Compatibility (for provisioning service)
# ========================================
@app.route('/api/dhcp/lease', methods=['GET'])
def get_dhcp_lease():
    """Get DHCP lease info - in L2TP mode, we use chap-secrets as source of truth"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    ip = request.args.get('ip', '')
    
    # In L2TP mode, the IP is assigned via chap-secrets, not DHCP
    users = read_chap_secrets()
    for u in users:
        if u['ip'] == ip:
            return jsonify({
                'success': True,
                'ip': ip,
                'mac': '00:00:00:00:00:00',  # L2TP doesn't use MAC
                'state': 'static',
                'hostname': u['username']
            })
    
    # Check active sessions
    sessions = get_active_ppp_sessions()
    for s in sessions:
        if s.get('localIp') == ip:
            return jsonify({
                'success': True,
                'ip': ip,
                'mac': '00:00:00:00:00:00',
                'state': 'active',
                'hostname': s.get('username', 'unknown')
            })
    
    return jsonify({'success': False, 'error': f'No lease found for {ip}'})


@app.route('/api/dhcp/leases', methods=['GET'])
def get_dhcp_leases():
    """Get all DHCP leases - returns chap-secrets entries"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    users = read_chap_secrets()
    leases = []
    for u in users:
        leases.append({
            'ip': u['ip'],
            'mac': '00:00:00:00:00:00',
            'state': 'static',
            'hostname': u['username']
        })
    
    return jsonify({'success': True, 'leases': leases})


@app.route('/api/vpn/dhcp/reservation', methods=['POST'])
def create_dhcp_reservation():
    """Create DHCP reservation - in L2TP mode, update chap-secrets IP"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    mac = data.get('macAddress', data.get('mac', ''))
    ip = data.get('ipAddress', data.get('ip', ''))
    hostname = data.get('hostname', '')
    
    if not ip:
        return jsonify({'success': False, 'error': 'Missing IP address'})
    
    # In L2TP mode, we update the user's IP in chap-secrets
    users = read_chap_secrets()
    found = False
    for u in users:
        if u['username'] == hostname or u['ip'] == ip:
            u['ip'] = ip
            found = True
            break
    
    if found:
        write_chap_secrets(users)
    
    # إعادة تشغيل FreeRADIUS ليقرأ الـ NAS الجديد من جدول nas في TiDB
    # (read_clients=yes يقرأ جميع NAS عند الـ startup)
    freeradius_restarted = False
    if ip:
        freeradius_restarted = restart_freeradius_for_new_nas(f'new NAS {ip} ({hostname})')
    
    return jsonify({'success': True, 'message': f'Reservation created: {ip}', 'freeradius_restarted': freeradius_restarted})


@app.route('/api/vpn/dhcp/reservation/<hostname>', methods=['DELETE'])
def delete_dhcp_reservation(hostname):
    """Delete DHCP reservation"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    # In L2TP mode, this is handled by user deletion
    return jsonify({'success': True, 'message': f'Reservation for {hostname} removed'})


# ========================================
# FreeRADIUS Management
# ========================================
# --- Debounce + Lock لـ FreeRADIUS restart ---
_freeradius_restart_lock = threading.Lock()
_freeradius_restart_timer = None
_freeradius_pending_reasons = []

def _do_restart_freeradius():
    """تنفيذ الـ restart الفعلي - يُستدعى من الـ timer"""
    global _freeradius_restart_timer, _freeradius_pending_reasons
    with _freeradius_restart_lock:
        reasons = ', '.join(_freeradius_pending_reasons)
        _freeradius_pending_reasons = []
        _freeradius_restart_timer = None
    try:
        result = subprocess.run(
            ['systemctl', 'restart', 'freeradius'],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            print(f'[FreeRADIUS] Restarted successfully (reasons: {reasons})')
        else:
            print(f'[FreeRADIUS] Restart failed: {result.stderr}')
    except Exception as e:
        print(f'[FreeRADIUS] Restart error: {e}')

def restart_freeradius_for_new_nas(reason='new NAS added'):
    """
    يُشغّل restart لـ FreeRADIUS مع debounce (5 ثواني).
    إذا جاءت عدة طلبات في نفس الوقت، يُجمّعها ويُشغّل restart واحد فقط.
    FreeRADIUS يقرأ جميع NAS من جدول nas في TiDB عبر read_clients=yes.
    وقت الـ restart: 3-5 ثواني فقط.
    """
    global _freeradius_restart_timer, _freeradius_pending_reasons
    with _freeradius_restart_lock:
        _freeradius_pending_reasons.append(reason)
        # إلغاء الـ timer السابق إذا كان موجوداً
        if _freeradius_restart_timer is not None:
            _freeradius_restart_timer.cancel()
            print(f'[FreeRADIUS] Debounce: تأجيل الـ restart ({reason})')
        # جدولة restart جديد بعد 5 ثواني
        _freeradius_restart_timer = threading.Timer(5.0, _do_restart_freeradius)
        _freeradius_restart_timer.daemon = True
        _freeradius_restart_timer.start()
        print(f'[FreeRADIUS] Debounce: restart مجدول بعد 5 ثواني ({reason})')
    return True


import hmac
import time

RADIUS_OPERATIONS_KEY_FILE = "/opt/radius-pro/.radius-operations.key"
RADIUS_OPERATIONS_STATE_FILE = "/opt/radius-pro/.radius-operations-state.json"
RADIUS_OPERATIONS_LOCK = threading.Lock()

def _radius_operations_authorized():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return False
    try:
        with open(RADIUS_OPERATIONS_KEY_FILE, "r") as key_file:
            expected = key_file.read().strip()
    except Exception:
        return False
    supplied = request.headers.get("X-Radius-Operations-Key", "")
    return bool(expected) and hmac.compare_digest(supplied, expected)

def _radius_operations_state():
    try:
        with open(RADIUS_OPERATIONS_STATE_FILE, "r") as state_file:
            return json.load(state_file)
    except Exception:
        return {"success": None, "checkedAt": None, "summary": None}

def _save_radius_operations_state(success, summary):
    state = {"success": success, "checkedAt": datetime.now().isoformat(), "summary": summary[:1000]}
    with open(RADIUS_OPERATIONS_STATE_FILE, "w") as state_file:
        json.dump(state, state_file)
    os.chmod(RADIUS_OPERATIONS_STATE_FILE, 0o600)
    return state

def _run_radius_command(command, timeout=60):
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)

def _validate_radius_config():
    result = _run_radius_command(["/usr/sbin/freeradius", "-XC", "-lstdout"], timeout=60)
    output = (result.stdout + "\n" + result.stderr).strip()
    summary = output[-1000:] if output else ("Configuration appears to be OK" if result.returncode == 0 else "Configuration check failed")
    _save_radius_operations_state(result.returncode == 0, summary)
    return result.returncode == 0, summary

def _radius_operations_status():
    fields = ["ActiveState", "SubState", "MainPID", "ActiveEnterTimestamp", "ActiveEnterTimestampMonotonic"]
    result = _run_radius_command(["systemctl", "show", "freeradius", "--no-page", *sum((["-p", field] for field in fields), [])], timeout=10)
    values = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    try:
        active_since_monotonic = int(values.get("ActiveEnterTimestampMonotonic", "0") or 0) / 1_000_000
        uptime_seconds = max(0, int(time.monotonic() - active_since_monotonic)) if active_since_monotonic else 0
    except Exception:
        uptime_seconds = 0
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    uptime_human = f"{hours}س {minutes}د {seconds}ث" if hours else f"{minutes}د {seconds}ث"
    try:
        conn = pymysql.connect(**DB_CONFIG)
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM online_sessions")
            active_sessions = int(cursor.fetchone()[0])
        conn.close()
    except Exception:
        active_sessions = 0
    logs = _run_radius_command(["journalctl", "-u", "freeradius", "-n", "20", "--no-pager", "-o", "short-iso"], timeout=10)
    return {
        "activeState": values.get("ActiveState", "unknown"),
        "subState": values.get("SubState", "unknown"),
        "pid": int(values["MainPID"]) if values.get("MainPID", "0").isdigit() and int(values["MainPID"]) > 0 else None,
        "activeSince": values.get("ActiveEnterTimestamp") or None,
        "uptimeSeconds": uptime_seconds,
        "uptimeHuman": uptime_human,
        "activeSessions": active_sessions,
        "lastConfigCheck": _radius_operations_state(),
        "recentLogs": logs.stdout.splitlines(),
    }

@app.route("/api/radius/operations/status", methods=["GET"])
def radius_operations_status():
    if not _radius_operations_authorized():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    return jsonify({"success": True, "data": _radius_operations_status()})

@app.route("/api/radius/operations/action", methods=["POST"])
def radius_operations_action():
    if not _radius_operations_authorized():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    action = (request.get_json(silent=True) or {}).get("action")
    if action not in ("reload", "restart", "start", "stop"):
        return jsonify({"success": False, "error": "Unsupported FreeRADIUS operation"}), 400
    if not RADIUS_OPERATIONS_LOCK.acquire(blocking=False):
        return jsonify({"success": False, "error": "Another FreeRADIUS operation is already running"}), 409
    try:
        if action in ("reload", "restart", "start"):
            valid, summary = _validate_radius_config()
            if not valid:
                return jsonify({"success": False, "error": "Configuration validation failed", "details": summary}), 422
        command = ["systemctl", action, "freeradius"]
        result = _run_radius_command(command, timeout=60)
        if result.returncode != 0:
            return jsonify({"success": False, "error": (result.stderr or result.stdout or "FreeRADIUS operation failed").strip()}), 500
        time.sleep(1)
        data = _radius_operations_status()
        return jsonify({"success": True, "data": {**data, "operation": action, "message": f"FreeRADIUS {action} completed"}})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        RADIUS_OPERATIONS_LOCK.release()

@app.route('/api/radius/reload', methods=['POST'])
def reload_radius():
    """Restart FreeRADIUS to pick up new NAS clients from SQL"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    success = restart_freeradius_for_new_nas('manual API call')
    return jsonify({
        'success': success,
        'message': 'FreeRADIUS restarted - all NAS reloaded from SQL' if success else 'Restart failed',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/radius/status', methods=['GET'])
def radius_status():
    """Get FreeRADIUS status"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        result = subprocess.run(
            ['systemctl', 'is-active', 'freeradius'],
            capture_output=True, text=True, timeout=5
        )
        status = result.stdout.strip()
        return jsonify({
            'success': True,
            'status': status,
            'isActive': status == 'active'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/radius/clients', methods=['POST'])
def add_radius_client():
    """Add a RADIUS client - stored in database via SQL"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    name = data.get('name', '')
    ipaddr = data.get('ipaddr', '')
    secret = data.get('secret', '')
    
    # RADIUS clients are managed via database (read_clients = yes)
    # This endpoint is for compatibility - actual client management is in radius-saas
    return jsonify({
        'success': True,
        'message': f'Client {name} ({ipaddr}) noted. Managed via database.'
    })


@app.route('/api/radius/disconnect', methods=['POST'])
def radius_disconnect():
    """Send RADIUS CoA Disconnect"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    data = request.json
    username = data.get('username', '')
    nas_ip = data.get('nas_ip', '127.0.0.1')
    secret = data.get('secret', 'radius_secret_2024')
    
    try:
        # Use radclient to send disconnect
        disconnect_request = f'User-Name = "{username}"\n'
        result = subprocess.run(
            ['echo', disconnect_request, '|', 'radclient', '-x', f'{nas_ip}:3799', 'disconnect', secret],
            shell=False, capture_output=True, text=True, timeout=10
        )
        
        # Alternative: use echo pipe
        cmd = f'echo "User-Name = {username}" | radclient -x {nas_ip}:3799 disconnect {secret}'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        
        return jsonify({
            'success': result.returncode == 0,
            'message': result.stdout,
            'error': result.stderr if result.returncode != 0 else None
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ========================================
# Database Sessions (compatible with existing API)
# ========================================
@app.route('/api/sessions/active', methods=['GET'])
def get_active_db_sessions():
    """Get active RADIUS sessions from database"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        import mysql.connector
        
        conn = mysql.connector.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
        )
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute('''
            SELECT radacctid, username, nasipaddress, framedipaddress,
                   acctstarttime, acctsessiontime, acctinputoctets, acctoutputoctets,
                   callingstationid, acctsessionid
            FROM radacct WHERE acctstoptime IS NULL
            ORDER BY acctstarttime DESC
        ''')
        
        sessions = cursor.fetchall()
        for s in sessions:
            if s.get('acctstarttime'):
                s['acctstarttime'] = str(s['acctstarttime'])
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'sessions': sessions, 'count': len(sessions)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sessions/cleanup', methods=['POST'])
def cleanup_stale_db_sessions():
    """Clean up stale sessions"""
    if not check_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        import mysql.connector
        
        conn = mysql.connector.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            database=DB_CONFIG['database'],
        )
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Stale-Session'
            WHERE acctstoptime IS NULL AND acctupdatetime < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        ''')
        
        affected = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'cleaned': affected})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500



# ========================================
# SSTP Sessions (accel-ppp)
# ========================================
@app.route("/api/sstp/sessions", methods=["GET"])
def get_sstp_sessions():
    if not check_auth():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    sessions = get_accel_sstp_sessions()
    return jsonify({"success": True, "sessions": sessions, "count": len(sessions)})

@app.route("/api/sstp/sessions/<username>/disconnect", methods=["POST"])
def disconnect_sstp_session(username):
    if not check_auth():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    try:
        result = subprocess.run(
            ["accel-cmd", "terminate username " + username],
            capture_output=True, text=True, timeout=5
        )
        return jsonify({
            "success": result.returncode == 0,
            "message": result.stdout or "Session terminated",
            "error": result.stderr if result.returncode != 0 else None
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/sstp/status", methods=["GET"])
def get_sstp_status():
    if not check_auth():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "accel-ppp"],
            capture_output=True, text=True, timeout=5
        )
        status = result.stdout.strip()
        stat_result = subprocess.run(
            ["accel-cmd", "show stat"],
            capture_output=True, text=True, timeout=5
        )
        return jsonify({
            "success": True,
            "status": status,
            "isActive": status == "active",
            "stats": stat_result.stdout
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})





@app.route('/api/relay', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
def relay():
    import re as re_lib
    import socket as socket_lib
    import urllib.parse as urlparse_lib
    from flask import Response

    api_key = request.headers.get('X-API-Key') or request.headers.get('X-Api-Key', '')
    if api_key != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401

    target = request.args.get('target', '')
    socks_host = request.args.get('socks_host', '')
    socks_port = int(request.args.get('socks_port', '1080'))
    http_proxy_host = request.args.get('http_proxy_host', '')
    http_proxy_port = int(request.args.get('http_proxy_port', '8080'))
    proxy_base = request.headers.get('X-Proxy-Base', '')
    if not target:
        return jsonify({"error": "Missing target"}), 400
    parsed = urlparse_lib.urlparse(target)
    target_host = parsed.hostname
    target_port = parsed.port or 80
    sub_path = parsed.path or '/'
    if parsed.query:
        sub_path += '?' + parsed.query
    # Validate target is internal IP
    if not re_lib.match(r'^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)', target_host or ''):
        return jsonify({"error": "Target must be an internal VPN IP"}), 400
    try:
        if http_proxy_host:
            # Use HTTP Proxy (MikroTik Web Proxy on port 8080)
            s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
            s.settimeout(15)
            s.connect((http_proxy_host, http_proxy_port))
            # For HTTP proxy: use absolute URL in request line
            sub_path = 'http://' + target_host + ':' + str(target_port) + sub_path
        elif socks_host:
            try:
                import socks as socks_lib
                s = socks_lib.socksocket()
                s.set_proxy(socks_lib.SOCKS4, socks_host, socks_port)
            except ImportError:
                s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
            s.settimeout(15)
            s.connect((target_host, target_port))
        else:
            s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
            s.settimeout(15)
            s.connect((target_host, target_port))

        # Build HTTP request
        req_headers_dict = {
            'Host': '{}:{}'.format(target_host, target_port),
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
            'Accept': request.headers.get('Accept', 'text/html,*/*'),
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'close',
        }
        if request.headers.get('Cookie'):
            req_headers_dict['Cookie'] = request.headers.get('Cookie')
        # Rewrite Referer to use router IP instead of proxy URL
        # This is needed because uhttpd validates that Referer matches the Host
        req_headers_dict['Referer'] = 'http://{}:{}/'.format(target_host, target_port)

        req_body = b''
        if request.method in ('POST', 'PUT', 'PATCH'):
            req_body = request.get_data()
            req_headers_dict['Content-Length'] = str(len(req_body))
            if request.content_type:
                req_headers_dict['Content-Type'] = request.content_type

        http_version = 'HTTP/1.1' if http_proxy_host else 'HTTP/1.0'
        http_req = '{} {} {}\r\n'.format(request.method, sub_path, http_version)
        if http_proxy_host:
            req_headers_dict['Proxy-Connection'] = 'close'
        for k, v in req_headers_dict.items():
            http_req += '{}: {}\r\n'.format(k, v)
        http_req += '\r\n'

        s.sendall(http_req.encode('utf-8') + req_body)

        # Read response
        response_data = b''
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            response_data += chunk
        s.close()

        # Parse HTTP response
        header_end = response_data.find(b'\r\n\r\n')
        if header_end == -1:
            return jsonify({"error": "Invalid HTTP response"}), 502

        header_section = response_data[:header_end].decode('utf-8', errors='replace')
        resp_body = response_data[header_end + 4:]
        # Decode chunked transfer encoding if present (HTTP/1.1 with proxy)
        if 'transfer-encoding: chunked' in header_section.lower():
            resp_body = _decode_chunked(resp_body)

        lines = header_section.split('\r\n')
        status_line = lines[0]
        status_code = int(status_line.split(' ')[1]) if len(status_line.split(' ')) > 1 else 200

        resp_headers = {}
        for line in lines[1:]:
            if ':' in line:
                k, _, v = line.partition(':')
                key = k.strip().lower()
                val = v.strip()
                if key == 'set-cookie':
                    # جمع Set-Cookie headers في list (قد يكون أكثر من واحد)
                    if 'set-cookie' in resp_headers:
                        if isinstance(resp_headers['set-cookie'], list):
                            resp_headers['set-cookie'].append(val)
                        else:
                            resp_headers['set-cookie'] = [resp_headers['set-cookie'], val]
                    else:
                        resp_headers['set-cookie'] = val
                else:
                    resp_headers[key] = val

        content_type = resp_headers.get('content-type', 'text/html')

        # Handle redirect
        if status_code in (301, 302, 303, 307, 308) and 'location' in resp_headers:
            loc = resp_headers['location']
            # IMPORTANT: Do NOT rewrite location with proxy_base here.
            # index.ts (the Node.js proxy) handles location rewriting to avoid double-prefixing.
            # Only strip internal IPs from location if present (replace with root path)
            loc = re_lib.sub(r'https?://(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[01])\.\d+\.\d+)(?::\d+)?(/[^\s]*)?', lambda m: m.group(1) or '/', loc)
            redirect_resp = Response('', status=302)
            redirect_resp.headers['Location'] = loc
            # تمرير Set-Cookie headers مع الـ redirect (مهم لـ OpenWRT login)
            # إرجاع Set-Cookie كما هي بدون تعديل path (index.ts سيتولى ذلك)
            for line in lines[1:]:
                if ':' in line:
                    hk, _, hv = line.partition(':')
                    if hk.strip().lower() == 'set-cookie':
                        redirect_resp.headers.add('Set-Cookie', hv.strip())
            return redirect_resp

        is_html = 'text/html' in content_type
        is_js = 'javascript' in content_type
        is_css = 'text/css' in content_type

        if (is_html or is_js or is_css) and proxy_base:
            try:
                text = resp_body.decode('utf-8', errors='replace')
                # Inject JS interceptor and base href for absolute path rewriting in JS
                if is_html:
                    js_interceptor = '''<script>
(function() {
  var _pb = "''' + proxy_base + '''";
  function _rw(u) {
    if (!u) return u;
    var s = String(u);
    if (s.startsWith(_pb) || s.startsWith('data:') || s.startsWith('javascript:') || s.startsWith('mailto:') || s.startsWith('http') || s.startsWith('//') || s.startsWith('#')) return s;
    if (s.startsWith('/')) return _pb + s;
    return s;
  }
  var _of = window.fetch;
  window.fetch = function(inp, init) {
    if (typeof inp === 'string') inp = _rw(inp);
    else if (inp && inp.url) inp = new Request(_rw(inp.url), inp);
    return _of.call(this, inp, init);
  };
  var _ox = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) {
    var a = Array.prototype.slice.call(arguments);
    a[1] = _rw(u);
    return _ox.apply(this, a);
  };
})();
</script>'''
                    if '<head>' in text:
                        text = text.replace('<head>', '<head>' + js_interceptor, 1)
                    elif '<HEAD>' in text:
                        text = text.replace('<HEAD>', '<HEAD>' + js_interceptor, 1)
                # Rewrite meta-refresh URLs to go through proxy
                def fix_meta_refresh(m):
                    q = m.group(1)
                    prefix = m.group(2)
                    url = m.group(3).strip()
                    if url.startswith('http://') or url.startswith('https://'):
                        return m.group(0)
                    if url.startswith('/'):
                        return q + prefix + proxy_base + url + m.group(4)
                    else:
                        return q + prefix + proxy_base + '/' + url + m.group(4)
                text = re_lib.sub(
                    r'(content=["\'])([^;]+;\s*[Uu][Rr][Ll]=)([^"\']+)(["\'])',
                    fix_meta_refresh,
                    text
                )

                # Rewrite absolute internal IP URLs
                text = re_lib.sub(
                    r'https?://(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[01])\.\d+\.\d+)(?::\d+)?(/[^"\'\\s]*)?',
                    lambda m: proxy_base + (m.group(1) or '/'),
                    text
                )

                # Rewrite JS location redirects
                def fix_js_loc(m):
                    path = re_lib.sub(r'^https?://[^/]+', '', m.group(2)) or '/'
                    return "{} = '{}{}'{}".format(m.group(1), proxy_base, path, m.group(3))
                text = re_lib.sub(
                    r"(parent\.location|window\.location(?:\.href)?)\s*=\s*[\"'](https?://[^\"']+)[\"'](\s*;?)",
                    fix_js_loc, text
                )

                # Rewrite relative paths in HTML attributes
                def fix_attr(m):
                    q = m.group(2)
                    return "{}={}{}{}{}".format(m.group(1), q, proxy_base, m.group(3), q)
                text = re_lib.sub(r'(src|href|action)=(["\'])(/[^"\']*)\2', fix_attr, text)
                # Rewrite relative paths (no leading /) e.g. src="common.js"
                def _fix_rel(m):
                    a, q, p = m.group(1), m.group(2), m.group(3)
                    if p.startswith(("data:", "javascript:", "mailto:", "http:", "https:", "#", "//")):
                        return m.group(0)
                    return a + "=" + q + proxy_base + "/" + p + q
                _rel_pat = re_lib.compile(
                    r"(src|href|action)=" + chr(40) + chr(91) + chr(34) + chr(39) + chr(93) + chr(41) +
                    r"([^" + chr(34) + chr(39) + "/][^" + chr(34) + chr(39) + "]*)" + chr(92) + "2"
                )
                text = _rel_pat.sub(_fix_rel, text)

                resp_body = text.encode('utf-8')
            except Exception:
                pass

        skip_headers = {'transfer-encoding', 'content-encoding', 'content-length', 'connection'}
        response = Response(resp_body, status=status_code, content_type=content_type)
        for k, v in resp_headers.items():
            if k not in skip_headers:
                response.headers[k] = v
        return response

    except Exception as e:
        return jsonify({"error": "Relay error: {}".format(str(e))}), 504





# ============================================================
# SYSTEM STATS ENDPOINT - reads /proc directly, no psutil needed
# ============================================================
@app.route('/api/system/stats', methods=['GET'])
def system_stats():
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    import subprocess, os

    stats = {}

    # CPU - two /proc/stat samples
    try:
        import time as _t
        def _cpu_fields():
            with open('/proc/stat') as _f:
                _parts = _f.readline().split()[1:8]
            return list(map(int, _parts))
        _c1 = _cpu_fields()
        _t.sleep(0.4)
        _c2 = _cpu_fields()
        _idle_d = _c2[3] - _c1[3]
        _total_d = sum(_c2) - sum(_c1)
        stats['cpu_percent'] = round(100.0 * (1 - _idle_d / _total_d), 1) if _total_d > 0 else 0
    except Exception as _e:
        stats['cpu_percent'] = -1

    # RAM
    try:
        mem = {}
        with open('/proc/meminfo') as f:
            for line in f:
                k, v = line.split(':')
                mem[k.strip()] = int(v.split()[0])
        total_mb = mem['MemTotal'] // 1024
        avail_mb = mem.get('MemAvailable', mem.get('MemFree', 0)) // 1024
        used_mb = total_mb - avail_mb
        stats['ram_total_mb'] = total_mb
        stats['ram_used_mb'] = used_mb
        stats['ram_free_mb'] = avail_mb
        stats['ram_percent'] = round(100.0 * used_mb / total_mb, 1) if total_mb > 0 else 0
    except Exception as e:
        stats['ram_error'] = str(e)

    # Disk
    try:
        disk = os.statvfs('/')
        total_gb = round(disk.f_blocks * disk.f_frsize / (1024**3), 1)
        free_gb  = round(disk.f_bfree  * disk.f_frsize / (1024**3), 1)
        used_gb  = round(total_gb - free_gb, 1)
        stats['disk_total_gb'] = total_gb
        stats['disk_used_gb']  = used_gb
        stats['disk_free_gb']  = free_gb
        stats['disk_percent']  = round(100.0 * used_gb / total_gb, 1) if total_gb > 0 else 0
    except Exception as e:
        stats['disk_error'] = str(e)

    # PPP sessions
    try:
        r = subprocess.run(['ip','link','show'], capture_output=True, text=True, timeout=5)
        stats['ppp_sessions'] = r.stdout.count(': ppp')
    except Exception:
        stats['ppp_sessions'] = -1

    # DHCP leases
    try:
        with open('/var/lib/misc/dnsmasq.leases') as f:
            stats['dhcp_leases'] = sum(1 for l in f if l.strip())
    except Exception:
        stats['dhcp_leases'] = -1

    # Service status
    for svc in ['freeradius', 'xl2tpd', 'dnsmasq', 'accel-pppd']:
        try:
            r = subprocess.run(['systemctl','is-active', svc],
                               capture_output=True, text=True, timeout=5)
            stats[f'service_{svc}'] = r.stdout.strip()
        except Exception:
            stats[f'service_{svc}'] = 'unknown'

    # Uptime
    try:
        with open('/proc/uptime') as f:
            secs = float(f.read().split()[0])
        stats['uptime_seconds'] = int(secs)
        stats['uptime_human'] = f"{int(secs//86400)}d {int((secs%86400)//3600)}h"
    except Exception:
        pass

    return jsonify(stats)





@app.route('/api/vpn/route-source', methods=['POST'])
def vpn_route_source():
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    import re as _re
    import subprocess as _subprocess
    data = request.get_json(force=True, silent=True) or {}
    target_ip = data.get('target_ip', '').strip()
    if not _re.fullmatch(r'\d{1,3}(?:\.\d{1,3}){3}', target_ip):
        return jsonify({"success": False, "error": "Invalid VPN target"}), 400
    octets = [int(part) for part in target_ip.split('.')]
    if any(part > 255 for part in octets) or target_ip.startswith(('127.', '169.254.')):
        return jsonify({"success": False, "error": "Invalid VPN target"}), 400
    route = _subprocess.run(['ip', '-4', 'route', 'get', target_ip], capture_output=True, text=True, timeout=5)
    if route.returncode != 0:
        return jsonify({"success": False, "error": "VPS route not found"}), 200
    match = _re.search(r'\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})', route.stdout)
    if not match:
        return jsonify({"success": False, "error": "VPS route source not found"}), 200
    return jsonify({"success": True, "source": match.group(1)})

@app.route('/api/port-forwarding/vps', methods=['POST'])
def port_forwarding_vps():
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401
    import glob as _glob
    import ipaddress as _ipaddress
    import os as _os
    import re as _re
    import socket as _socket
    import subprocess as _subprocess
    data = request.get_json(force=True, silent=True) or {}
    action = data.get('action', '').strip()

    def _valid_ip(value, private_only=False):
        try:
            address = _ipaddress.ip_address(value)
            return address.version == 4 and not address.is_loopback and not address.is_link_local and not address.is_multicast and (not private_only or address.is_private)
        except ValueError:
            return False

    def _valid_cidr(value):
        try:
            network = _ipaddress.ip_network(value, strict=False)
            return network.version == 4 and str(network) != '0.0.0.0/0' and network.prefixlen >= 8
        except ValueError:
            return False

    def _normalise_forward(raw):
        try:
            forward_id = int(raw.get('id'))
            external_port = int(raw.get('external_port'))
            ingress_port = int(raw.get('ingress_port'))
            target_port = int(raw.get('target_port'))
            vpn_tunnel_ip = str(raw.get('vpn_tunnel_ip', '')).strip()
            target_ip = str(raw.get('target_ip', '')).strip()
            access_mode = str(raw.get('access_mode', 'restricted')).strip()
            allowed = raw.get('allowed_cidrs')
        except (TypeError, ValueError):
            raise ValueError('Invalid forwarding data')
        if forward_id < 1 or not 47000 <= external_port <= 59999 or not 20000 <= ingress_port <= 39999 or not _valid_ip(vpn_tunnel_ip, private_only=True):
            raise ValueError('Forwarding value is outside the permitted range')
        if not _valid_ip(target_ip, private_only=True) or target_ip == vpn_tunnel_ip or target_ip.startswith(('192.168.30.', '192.168.31.')) or not 1 <= target_port <= 65535:
            raise ValueError('Forwarding target is outside the permitted LAN scope')
        if access_mode not in ('restricted', 'public'):
            raise ValueError('Forwarding access mode is invalid')
        if not isinstance(allowed, list) or len(allowed) > 20 or not all(isinstance(cidr, str) and _valid_cidr(cidr) for cidr in allowed):
            raise ValueError('Forwarding allowlist is invalid')
        if access_mode == 'restricted' and not allowed:
            raise ValueError('Restricted forwarding needs at least one allowed source')
        if access_mode == 'public' and allowed:
            raise ValueError('Public forwarding must not keep a hidden allowlist')
        return {'id': forward_id, 'external_port': external_port, 'ingress_port': ingress_port, 'vpn_tunnel_ip': vpn_tunnel_ip, 'target_ip': target_ip, 'target_port': target_port, 'access_mode': access_mode, 'allowed_cidrs': allowed}

    try:
        if action == 'stream_sync':
            forwards = [_normalise_forward(raw) for raw in data.get('forwards', [])]
            if len({forward['external_port'] for forward in forwards}) != len(forwards):
                return jsonify({'success': False, 'error': 'Duplicate external port'}), 400
            blocks = []
            for forward in forwards:
                acl = '' if forward['access_mode'] == 'public' else '\n'.join('        allow {};'.format(cidr) for cidr in forward['allowed_cidrs']) + '\n        deny all;'
                blocks.append('    # radius-pro-pf-{id}\n    server {{\n        listen {external_port};\n        proxy_connect_timeout 5s;\n        proxy_timeout 1h;\n{acl}\n        proxy_pass {target_ip}:{target_port};\n    }}'.format(acl=acl, **forward))
            config = 'stream {\n' + '\n\n'.join(blocks) + '\n}\n'
            config_path = '/etc/nginx/stream.conf.d/radius-pro-port-forwarding.conf'
            backup_path = config_path + '.backup'
            staged_path = config_path + '.next'
            _os.makedirs('/etc/nginx/stream.conf.d', exist_ok=True)
            _os.makedirs('/etc/nginx/modules-enabled', exist_ok=True)
            nginx_conf = '/etc/nginx/nginx.conf'
            contents = open(nginx_conf).read()
            if 'include /etc/nginx/modules-enabled/*.conf;' not in contents:
                with open(nginx_conf, 'w') as handle:
                    handle.write('include /etc/nginx/modules-enabled/*.conf;\n' + contents)
            module_path = '/etc/nginx/modules-enabled/50-radius-pro-stream.conf'
            system_stream_module = any(
                path != module_path and 'ngx_stream_module.so' in open(path).read()
                for path in _glob.glob('/etc/nginx/modules-enabled/*') if _os.path.isfile(path)
            )
            if system_stream_module:
                if _os.path.exists(module_path): _os.remove(module_path)
            elif not _os.path.exists(module_path):
                with open(module_path, 'w') as handle:
                    handle.write('load_module modules/ngx_stream_module.so;\n')
            contents = open(nginx_conf).read()
            if 'radius-pro-port-forwarding-include' not in contents:
                with open(nginx_conf, 'a') as handle:
                    handle.write('\n# radius-pro-port-forwarding-include\ninclude /etc/nginx/stream.conf.d/*.conf;\n')
            if _os.path.exists(config_path):
                _os.replace(config_path, backup_path)
            with open(staged_path, 'w') as handle:
                handle.write(config)
            _os.replace(staged_path, config_path)
            check = _subprocess.run(['nginx', '-t'], capture_output=True, text=True, timeout=10)
            if check.returncode != 0:
                if _os.path.exists(backup_path): _os.replace(backup_path, config_path)
                else: _os.remove(config_path)
                return jsonify({'success': False, 'error': check.stderr[-500:]}), 200
            reload_result = _subprocess.run(['nginx', '-s', 'reload'], capture_output=True, text=True, timeout=10)
            if reload_result.returncode != 0:
                return jsonify({'success': False, 'error': reload_result.stderr[-500:]}), 200
            if _os.path.exists(backup_path): _os.remove(backup_path)
            return jsonify({'success': True})

        if action in ('lan_route_add', 'lan_route_remove'):
            lan_cidr = str(data.get('lan_cidr', '')).strip()
            vpn_tunnel_ip = str(data.get('vpn_tunnel_ip', '')).strip()
            if not _valid_ip(vpn_tunnel_ip, private_only=True):
                return jsonify({'success': False, 'error': 'Invalid NAS tunnel address'}), 400
            try:
                lan_network = _ipaddress.ip_network(lan_cidr, strict=True)
            except ValueError:
                return jsonify({'success': False, 'error': 'LAN network must be a canonical IPv4 CIDR'}), 400
            transport_network = _ipaddress.ip_network('192.168.30.0/23')
            if lan_network.version != 4 or not lan_network.is_private or not 8 <= lan_network.prefixlen <= 30 or lan_network.overlaps(transport_network):
                return jsonify({'success': False, 'error': 'LAN network is outside the permitted private route scope'}), 400
            route_to_tunnel = _subprocess.run(['ip', '-4', 'route', 'get', vpn_tunnel_ip], capture_output=True, text=True, timeout=5)
            if route_to_tunnel.returncode != 0:
                return jsonify({'success': False, 'error': 'NAS tunnel route is unavailable'}), 200
            device_match = _re.search(r'\bdev\s+(sstp\d+)\b', route_to_tunnel.stdout)
            if not device_match:
                return jsonify({'success': False, 'error': 'NAS tunnel is not an active SSTP route'}), 200
            device = device_match.group(1)
            route_show = _subprocess.run(['ip', '-j', '-4', 'route', 'show', 'exact', str(lan_network)], capture_output=True, text=True, timeout=5)
            if route_show.returncode != 0:
                return jsonify({'success': False, 'error': 'Unable to inspect existing LAN route'}), 200
            import json as _json
            existing = _json.loads(route_show.stdout or '[]')
            matches_expected = any(route.get('gateway') == vpn_tunnel_ip and route.get('dev') == device for route in existing)
            if action == 'lan_route_add':
                if existing:
                    if matches_expected:
                        return jsonify({'success': True, 'status': 'already-present', 'device': device})
                    return jsonify({'success': False, 'error': 'Conflicting existing route for this LAN network'}), 409
                result = _subprocess.run(['ip', '-4', 'route', 'add', str(lan_network), 'via', vpn_tunnel_ip, 'dev', device], capture_output=True, text=True, timeout=5)
                if result.returncode != 0:
                    return jsonify({'success': False, 'error': result.stderr[-500:]}), 200
                return jsonify({'success': True, 'status': 'added', 'device': device})
            if not existing:
                return jsonify({'success': True, 'status': 'already-absent'})
            if not matches_expected:
                return jsonify({'success': False, 'error': 'Refusing to remove a route not owned by this NAS tunnel'}), 409
            result = _subprocess.run(['ip', '-4', 'route', 'del', str(lan_network), 'via', vpn_tunnel_ip, 'dev', device], capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                return jsonify({'success': False, 'error': result.stderr[-500:]}), 200
            return jsonify({'success': True, 'status': 'removed', 'device': device})
        if action in ('ufw_allow', 'ufw_revoke'):
            forward = _normalise_forward(data.get('forward', {}))
            sources = [None] if forward['access_mode'] == 'public' else forward['allowed_cidrs']
            for cidr in sources:
                suffix = ['allow', 'from', cidr, 'to', 'any', 'port', str(forward['external_port']), 'proto', 'tcp'] if cidr else ['allow', str(forward['external_port']) + '/tcp']
                base = ['ufw'] + (['--force', 'delete'] if action == 'ufw_revoke' else []) + suffix
                result = _subprocess.run(base, capture_output=True, text=True, timeout=15)
                if result.returncode != 0 and action == 'ufw_allow':
                    return jsonify({'success': False, 'error': result.stderr[-500:]}), 200
            return jsonify({'success': True})

        if action == 'tunnel_probe':
            target = str(data.get('vpn_tunnel_ip', '')).strip()
            try: ingress_port = int(data.get('ingress_port'))
            except (TypeError, ValueError): ingress_port = 0
            if not _valid_ip(target, private_only=True) or not 20000 <= ingress_port <= 44999:
                return jsonify({'success': False, 'error': 'Invalid tunnel probe'}), 400
            with _socket.create_connection((target, ingress_port), timeout=5): pass
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Unknown VPS forwarding action'}), 400
    except Exception as error:
        return jsonify({'success': False, 'error': str(error)}), 200

# ============================================================
# MikroTik API Proxy Endpoint
# Allows SaaS platform to reach VPN-connected MikroTik routers
# without SSH tunnel - VPS acts as the proxy
# ============================================================
@app.route('/api/mikrotik/proxy', methods=['POST'])
def mikrotik_proxy():
    if not check_auth():
        return jsonify({"error": "Unauthorized"}), 401

    import socket as _socket
    import re as _re

    data = request.get_json(force=True, silent=True) or {}
    host = data.get('host', '').strip()
    port = int(data.get('port', 8728))
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    action = data.get('action', 'test_connection').strip()
    src_ip = data.get('src_ip', host).strip()

    if not host or not username:
        return jsonify({"success": False, "error": "Missing host or username"}), 400

    def _encode_word(word):
        wb = word.encode('utf-8')
        l = len(wb)
        if l < 0x80:
            lb = bytes([l])
        elif l < 0x4000:
            lb = bytes([((l >> 8) & 0x3F) | 0x80, l & 0xFF])
        else:
            lb = bytes([((l >> 16) & 0x1F) | 0xC0, (l >> 8) & 0xFF, l & 0xFF])
        return lb + wb

    def _sentence(*words):
        return b''.join(_encode_word(w) for w in words) + b'\x00'

    def _read_word(sock):
        b0 = sock.recv(1)
        if not b0:
            return None
        l = b0[0]
        if l & 0xE0 == 0xE0:
            extra = sock.recv(3)
            l = ((l & 0x1F) << 24) | (extra[0] << 16) | (extra[1] << 8) | extra[2]
        elif l & 0xC0 == 0xC0:
            extra = sock.recv(2)
            l = ((l & 0x3F) << 16) | (extra[0] << 8) | extra[1]
        elif l & 0x80 == 0x80:
            extra = sock.recv(1)
            l = ((l & 0x3F) << 8) | extra[0]
        if l == 0:
            return ''
        return sock.recv(l).decode('utf-8', errors='replace')

    def _read_sentence(sock):
        words = []
        while True:
            w = _read_word(sock)
            if w is None or w == '':
                break
            words.append(w)
        return words

    def _read_response(sock, timeout=8):
        sock.settimeout(timeout)
        sentences = []
        try:
            while True:
                sentence = _read_sentence(sock)
                if not sentence:
                    break
                sentences.append(sentence)
                if any(w in ('!done', '!trap', '!fatal') for w in sentence):
                    break
        except _socket.timeout:
            pass
        return sentences

    def _flat(sentences):
        return ' '.join(' '.join(s) for s in sentences)

    try:
        sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))
    except Exception as e:
        return jsonify({"success": False, "error": "Cannot connect to {}:{} - {}".format(host, port, str(e))}), 200

    try:
        sock.sendall(_sentence('/login', '=name={}'.format(username), '=password={}'.format(password)))
        login_resp = _read_response(sock)
        flat = _flat(login_resp)

        if '!trap' in flat:
            sock.close()
            return jsonify({"success": False, "error": "Login failed - invalid credentials"}), 200

        if '!done' not in flat:
            sock.close()
            return jsonify({"success": False, "error": "Unexpected login response"}), 200

        def _is_ipv4(value, private_only=False):
            pieces = value.split('.')
            if len(pieces) != 4 or not all(piece.isdigit() and 0 <= int(piece) <= 255 for piece in pieces):
                return False
            first, second = int(pieces[0]), int(pieces[1])
            if value.startswith(('127.', '169.254.')) or 224 <= first <= 255:
                return False
            return not private_only or first == 10 or (first == 172 and 16 <= second <= 31) or (first == 192 and second == 168)

        def _remove_port_forward_rules(comment):
            sock.sendall(_sentence('/ip/firewall/nat/print', '?comment={}'.format(comment)))
            print_resp = _read_response(sock)
            rule_ids = _re.findall(r'=\.id=([^\s]+)', _flat(print_resp))
            for rule_id in rule_ids:
                sock.sendall(_sentence('/ip/firewall/nat/remove', '=.id={}'.format(rule_id)))
                remove_resp = _flat(_read_response(sock))
                if '!trap' in remove_resp or '!fatal' in remove_resp:
                    raise RuntimeError('RouterOS rejected NAT rule removal')
            return len(rule_ids)

        if action in ('port_forward_nat_apply', 'port_forward_nat_remove'):
            comment = data.get('comment', '').strip()
            if not _re.fullmatch(r'radius-pro-pf-[1-9]\d*', comment):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding rule reference"}), 400
            if action == 'port_forward_nat_remove':
                removed = _remove_port_forward_rules(comment)
                sock.close()
                return jsonify({"success": True, "removed": removed})

            vpn_tunnel_ip = data.get('vpn_tunnel_ip', '').strip()
            target_ip = data.get('target_ip', '').strip()
            vps_route_source = data.get('vps_route_source', '').strip()
            try:
                ingress_port = int(data.get('ingress_port'))
                target_port = int(data.get('target_port'))
            except (TypeError, ValueError):
                sock.close()
                return jsonify({"success": False, "error": "Invalid port forwarding ports"}), 400
            if host != vpn_tunnel_ip or not _is_ipv4(vpn_tunnel_ip) or not _is_ipv4(vps_route_source) or not _is_ipv4(target_ip, private_only=True):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding address scope"}), 400
            if not 20000 <= ingress_port <= 44999 or not 1 <= target_port <= 65535:
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding port range"}), 400
            _remove_port_forward_rules(comment)
            sock.sendall(_sentence('/ip/firewall/nat/add', '=chain=dstnat', '=protocol=tcp', '=src-address={}'.format(vps_route_source), '=dst-address={}'.format(vpn_tunnel_ip), '=dst-port={}'.format(ingress_port), '=action=dst-nat', '=to-addresses={}'.format(target_ip), '=to-ports={}'.format(target_port), '=comment={}'.format(comment)))
            apply_resp = _flat(_read_response(sock))
            if '!trap' in apply_resp or '!fatal' in apply_resp or '!done' not in apply_resp:
                sock.close()
                return jsonify({"success": False, "error": "RouterOS rejected NAT rule"}), 200
            sock.sendall(_sentence('/ip/firewall/nat/print', '?comment={}'.format(comment)))
            verify_resp = _flat(_read_response(sock))
            sock.close()
            if comment not in verify_resp:
                return jsonify({"success": False, "error": "NAT rule verification failed"}), 200
            return jsonify({"success": True, "message": "NAT rule applied"})

        def _is_ipv4(value, private_only=False):
            pieces = value.split('.')
            if len(pieces) != 4 or not all(piece.isdigit() and 0 <= int(piece) <= 255 for piece in pieces):
                return False
            first, second = int(pieces[0]), int(pieces[1])
            if value.startswith(('127.', '169.254.')) or 224 <= first <= 255:
                return False
            return not private_only or first == 10 or (first == 172 and 16 <= second <= 31) or (first == 192 and second == 168)

        def _remove_port_forward_rules(comment):
            sock.sendall(_sentence('/ip/firewall/nat/print', '?comment={}'.format(comment)))
            print_resp = _read_response(sock)
            rule_ids = _re.findall(r'=\.id=([^\s]+)', _flat(print_resp))
            for rule_id in rule_ids:
                sock.sendall(_sentence('/ip/firewall/nat/remove', '=.id={}'.format(rule_id)))
                remove_resp = _flat(_read_response(sock))
                if '!trap' in remove_resp or '!fatal' in remove_resp:
                    raise RuntimeError('RouterOS rejected NAT rule removal')
            return len(rule_ids)

        if action in ('port_forward_nat_apply', 'port_forward_nat_remove', 'port_forward_nat_status'):
            comment = data.get('comment', '').strip()
            if not _re.fullmatch(r'radius-pro-pf-[1-9]\d*', comment):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding rule reference"}), 400
            if action == 'port_forward_nat_status':
                sock.sendall(_sentence('/ip/firewall/nat/print', '?comment={}'.format(comment)))
                status_resp = _flat(_read_response(sock))
                sock.close()
                return jsonify({"success": True, "present": comment in status_resp, "details": status_resp[:2000]})
            if action == 'port_forward_nat_remove':
                removed = _remove_port_forward_rules(comment)
                sock.close()
                return jsonify({"success": True, "removed": removed})

            vpn_tunnel_ip = data.get('vpn_tunnel_ip', '').strip()
            target_ip = data.get('target_ip', '').strip()
            vps_route_source = data.get('vps_route_source', '').strip()
            try:
                ingress_port = int(data.get('ingress_port'))
                target_port = int(data.get('target_port'))
            except (TypeError, ValueError):
                sock.close()
                return jsonify({"success": False, "error": "Invalid port forwarding ports"}), 400
            if host != vpn_tunnel_ip or not _is_ipv4(vpn_tunnel_ip) or not _is_ipv4(vps_route_source) or not _is_ipv4(target_ip, private_only=True):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding address scope"}), 400
            if not 20000 <= ingress_port <= 44999 or not 1 <= target_port <= 65535:
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding port range"}), 400
            _remove_port_forward_rules(comment)
            sock.sendall(_sentence('/ip/firewall/nat/add', '=chain=dstnat', '=protocol=tcp', '=src-address={}'.format(vps_route_source), '=dst-address={}'.format(vpn_tunnel_ip), '=dst-port={}'.format(ingress_port), '=action=dst-nat', '=to-addresses={}'.format(target_ip), '=to-ports={}'.format(target_port), '=comment={}'.format(comment)))
            apply_resp = _flat(_read_response(sock))
            if '!trap' in apply_resp or '!fatal' in apply_resp or '!done' not in apply_resp:
                sock.close()
                return jsonify({"success": False, "error": "RouterOS rejected NAT rule"}), 200
            sock.sendall(_sentence('/ip/firewall/nat/print', '?comment={}'.format(comment)))
            verify_resp = _flat(_read_response(sock))
            sock.close()
            if comment not in verify_resp:
                return jsonify({"success": False, "error": "NAT rule verification failed"}), 200
            return jsonify({"success": True, "message": "NAT rule applied"})

        def _remove_port_forward_filter_rules(comment):
            sock.sendall(_sentence('/ip/firewall/filter/print', '?comment={}'.format(comment)))
            print_resp = _read_response(sock)
            rule_ids = _re.findall(r'=\.id=([^\s]+)', _flat(print_resp))
            for rule_id in rule_ids:
                sock.sendall(_sentence('/ip/firewall/filter/remove', '=.id={}'.format(rule_id)))
                remove_resp = _flat(_read_response(sock))
                if '!trap' in remove_resp or '!fatal' in remove_resp:
                    raise RuntimeError('RouterOS rejected firewall rule removal')
            return len(rule_ids)

        if action in ('port_forward_filter_apply', 'port_forward_filter_remove', 'port_forward_lan_filter_apply', 'port_forward_lan_filter_remove'):
            comment = data.get('comment', '').strip()
            if not _re.fullmatch(r'radius-pro-pf-[1-9]\d*', comment):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding rule reference"}), 400
            direct_lan = action.startswith('port_forward_lan_filter_')
            if action.endswith('_remove'):
                removed = _remove_port_forward_filter_rules(comment)
                if direct_lan:
                    removed += _remove_port_forward_rules(comment)
                sock.close()
                return jsonify({"success": True, "removed": removed})
            target_ip = data.get('target_ip', '').strip()
            vps_route_source = data.get('vps_route_source', '').strip()
            try:
                target_port = int(data.get('target_port'))
            except (TypeError, ValueError):
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding target port"}), 400
            if not _is_ipv4(vps_route_source) or not _is_ipv4(target_ip, private_only=True) or not 1 <= target_port <= 65535:
                sock.close()
                return jsonify({"success": False, "error": "Invalid forwarding filter scope"}), 400
            _remove_port_forward_filter_rules(comment)
            words = ['/ip/firewall/filter/add', '=chain=forward', '=protocol=tcp', '=src-address={}'.format(vps_route_source), '=dst-address={}'.format(target_ip), '=dst-port={}'.format(target_port)]
            if direct_lan:
                words.append('=place-before=0')
            else:
                words.append('=connection-nat-state=dstnat')
            words.extend(['=action=accept', '=comment={}'.format(comment)])
            sock.sendall(_sentence(*words))
            apply_resp = _flat(_read_response(sock))
            if '!trap' in apply_resp or '!fatal' in apply_resp or '!done' not in apply_resp:
                sock.close()
                return jsonify({"success": False, "error": "RouterOS rejected forwarding firewall rule"}), 200
            if direct_lan:
                _remove_port_forward_rules(comment)
                sock.sendall(_sentence('/ip/firewall/nat/add', '=chain=srcnat', '=protocol=tcp', '=src-address={}'.format(vps_route_source), '=dst-address={}'.format(target_ip), '=dst-port={}'.format(target_port), '=action=masquerade', '=place-before=0', '=comment={}'.format(comment)))
                nat_resp = _flat(_read_response(sock))
                if '!trap' in nat_resp or '!fatal' in nat_resp or '!done' not in nat_resp:
                    _remove_port_forward_filter_rules(comment)
                    sock.close()
                    return jsonify({"success": False, "error": "RouterOS rejected direct LAN return NAT rule"}), 200
            sock.close()
            return jsonify({"success": True, "message": "Direct LAN firewall and return NAT rules applied" if direct_lan else "Forwarding firewall rule applied"})

        if action == 'ping':
            target_ip = data.get('target_ip', '').strip()
            octets = target_ip.split('.')
            valid_target = len(octets) == 4 and all(part.isdigit() and 0 <= int(part) <= 255 for part in octets)
            forbidden_target = target_ip.startswith(('127.', '169.254.')) or (valid_target and 224 <= int(octets[0]) <= 255)
            if not valid_target or forbidden_target:
                sock.close()
                return jsonify({"success": False, "error": "Invalid monitoring target"}), 400
            sock.sendall(_sentence('/ping', '=address={}'.format(target_ip), '=count=2', '=interval=500ms'))
            ping_resp = _read_response(sock, timeout=8)
            ping_flat = _flat(ping_resp)
            sock.close()
            time_match = _re.search(r'=(?:avg-rtt|time)=([0-9.]+)ms', ping_flat)
            return jsonify({"success": True, "reachable": bool(time_match), "pingMs": float(time_match.group(1)) if time_match else None})

        if action == 'test_connection':
            sock.close()
            return jsonify({"success": True, "message": "API connection successful", "connected": True})

        elif action == 'enable_socks':
            sock.sendall(_sentence('/ip/socks/set', '=enabled=yes', '=port=1080'))
            _read_response(sock)
            src_addr = '{}/32'.format(src_ip)
            sock.sendall(_sentence('/ip/socks/access/print', '?src-address={}'.format(src_addr)))
            print_resp = _read_response(sock)
            has_rule = src_addr in _flat(print_resp)
            if not has_rule:
                sock.sendall(_sentence('/ip/socks/access/add', '=src-address={}'.format(src_addr), '=action=allow'))
                _read_response(sock)
            sock.close()
            return jsonify({"success": True, "message": "SOCKS proxy enabled", "rule_added": not has_rule})

        elif action == 'disable_socks':
            src_addr = '{}/32'.format(src_ip)
            sock.sendall(_sentence('/ip/socks/access/print', '?src-address={}'.format(src_addr)))
            print_resp = _read_response(sock)
            flat_print = _flat(print_resp)
            ids = _re.findall(r'=\.id=(\*[\w]+)', flat_print)
            removed = 0
            for rid in ids:
                sock.sendall(_sentence('/ip/socks/access/remove', '=.id={}'.format(rid)))
                _read_response(sock)
                removed += 1
            sock.sendall(_sentence('/ip/socks/set', '=enabled=no'))
            _read_response(sock)
            sock.close()
            return jsonify({"success": True, "message": "SOCKS proxy disabled", "removed": removed})


        elif action == 'enable_http_proxy':
            # Enable HTTP Proxy on MikroTik (for remote router access via VPS)
            sock.sendall(_sentence('/ip/proxy/set', '=enabled=yes', '=port=8080'))
            _read_response(sock)
            # Add access rule: allow only VPS (192.168.30.1)
            sock.sendall(_sentence('/ip/proxy/access/print', '?src-address=192.168.30.1'))
            print_resp = _read_response(sock)
            has_rule = '192.168.30.1' in _flat(print_resp)
            if not has_rule:
                sock.sendall(_sentence('/ip/proxy/access/add', '=src-address=192.168.30.1', '=action=allow', '=comment=VPS-Access'))
                _read_response(sock)
            sock.close()
            return jsonify({"success": True, "message": "HTTP Proxy enabled on port 8080", "rule_added": not has_rule})

        elif action == 'disable_http_proxy':
            # Disable HTTP Proxy on MikroTik
            sock.sendall(_sentence('/ip/proxy/set', '=enabled=no'))
            _read_response(sock)
            sock.close()
            return jsonify({"success": True, "message": "HTTP Proxy disabled"})


        elif action == 'disable_http_proxy':
            # Disable HTTP Proxy on MikroTik
            try:
                api.get_resource('/ip/proxy').set(id='*0', enabled='no')
            except Exception:
                try:
                    api.get_resource('/ip/proxy').call('set', {'enabled': 'no'})
                except Exception as e2:
                    return jsonify({'success': False, 'error': f'Failed to disable proxy: {str(e2)}'})
            return jsonify({'success': True, 'message': 'HTTP Proxy disabled'})

        else:
            sock.close()
            return jsonify({"success": False, "error": "Unknown action: {}".format(action)}), 400

    except Exception as e:
        try:
            sock.close()
        except Exception:
            pass
        return jsonify({"success": False, "error": str(e)}), 200




@app.route('/api/http-forward', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
def http_forward():
    import re as re_lib
    import socket as socket_lib
    import urllib.parse as urlparse_lib
    from flask import Response

    api_key = request.headers.get('X-API-Key') or request.headers.get('X-Api-Key', '')
    if api_key != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401

    target = request.args.get('target', '')
    nas_vpn_ip = request.args.get('nas_vpn_ip', '')
    proxy_base = request.headers.get('X-Proxy-Base', '')

    if not target:
        return jsonify({"error": "Missing target parameter"}), 400
    if not nas_vpn_ip:
        return jsonify({"error": "Missing nas_vpn_ip parameter"}), 400

    parsed = urlparse_lib.urlparse(target)
    target_host = parsed.hostname
    target_port = parsed.port or 80
    sub_path = parsed.path or '/'
    if parsed.query:
        sub_path += '?' + parsed.query

    # Validate target is internal IP
    if not re_lib.match(r'^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)', target_host or ''):
        return jsonify({"error": "Target must be an internal IP"}), 400

    # Validate nas_vpn_ip is a VPN IP
    if not re_lib.match(r'^192\.168\.(30|31)\.', nas_vpn_ip):
        return jsonify({"error": "nas_vpn_ip must be a VPN IP (192.168.30.x or 192.168.31.x)"}), 400

    try:
        # Strategy: Use MikroTik's SOCKS proxy via the VPN tunnel IP.
        # But first try direct connection (VPS can reach 192.168.30.x directly).
        # For internal LAN IPs behind MikroTik, we need to go through MikroTik.
        
        # Check if target is a VPN IP (directly reachable) or internal LAN IP
        is_vpn_ip = re_lib.match(r'^192\.168\.(30|31)\.', target_host)
        
        s = None
        connected = False
        
        if is_vpn_ip:
            # Direct connection - VPS can reach VPN IPs via PPP
            try:
                s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
                s.settimeout(10)
                s.connect((target_host, target_port))
                connected = True
            except Exception:
                if s:
                    try: s.close()
                    except: pass
                s = None
        
        if not connected:
            # For internal LAN IPs, use HTTP Proxy on MikroTik (port 8080)
            proxy_port = int(request.args.get('proxy_port', '8080'))
            try:
                # Connect to MikroTik's HTTP Proxy
                s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
                s.settimeout(15)
                s.connect((nas_vpn_ip, proxy_port))
                connected = True
                # For HTTP Proxy, we need to send the full URL in the request line
                # Override sub_path to be the full target URL
                sub_path = target
            except Exception as e1:
                if s:
                    try: s.close()
                    except: pass
                s = None
                # Fallback: try direct connection
                try:
                    s = socket_lib.socket(socket_lib.AF_INET, socket_lib.SOCK_STREAM)
                    s.settimeout(10)
                    s.connect((target_host, target_port))
                    connected = True
                except Exception as e3:
                    if s:
                        try: s.close()
                        except: pass
                    return jsonify({
                        "error": "Cannot reach router",
                        "detail": "HTTP Proxy on {}:{} failed: {}, Direct: {}".format(nas_vpn_ip, proxy_port, str(e1), str(e3)),
                        "hint": "Ensure HTTP Proxy is enabled on MikroTik (run enable_http_proxy action first)"
                    }), 504

        if not connected or not s:
            return jsonify({"error": "Failed to connect to target"}), 504

        # Build HTTP request
        req_headers_dict = {
            'Host': '{}:{}'.format(target_host, target_port),
            'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
            'Accept': request.headers.get('Accept', 'text/html,*/*'),
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'close',
        }
        fwd_host = request.headers.get('X-Forward-Host', '')
        if fwd_host:
            req_headers_dict['Host'] = fwd_host
        if request.headers.get('Cookie'):
            req_headers_dict['Cookie'] = request.headers.get('Cookie')
        # Rewrite Referer to use router IP instead of proxy URL
        # This is needed because uhttpd validates that Referer matches the Host
        req_headers_dict['Referer'] = 'http://{}:{}/'.format(target_host, target_port)

        req_body = b''
        if request.method in ('POST', 'PUT', 'PATCH'):
            req_body = request.get_data()
            req_headers_dict['Content-Length'] = str(len(req_body))
            if request.content_type:
                req_headers_dict['Content-Type'] = request.content_type

        http_version = 'HTTP/1.1' if http_proxy_host else 'HTTP/1.0'
        http_req = '{} {} {}\r\n'.format(request.method, sub_path, http_version)
        if http_proxy_host:
            req_headers_dict['Proxy-Connection'] = 'close'
        for k, v in req_headers_dict.items():
            http_req += '{}: {}\r\n'.format(k, v)
        http_req += '\r\n'

        s.sendall(http_req.encode('utf-8') + req_body)

        # Read response
        response_data = b''
        while True:
            try:
                chunk = s.recv(65536)
                if not chunk:
                    break
                response_data += chunk
            except socket_lib.timeout:
                break
        s.close()

        if not response_data:
            return jsonify({"error": "Empty response from router"}), 502

        # Parse HTTP response
        header_end = response_data.find(b'\r\n\r\n')
        if header_end == -1:
            return jsonify({"error": "Invalid HTTP response from router"}), 502

        header_section = response_data[:header_end].decode('utf-8', errors='replace')
        resp_body = response_data[header_end + 4:]
        # Decode chunked transfer encoding if present (HTTP/1.1 with proxy)
        if 'transfer-encoding: chunked' in header_section.lower():
            resp_body = _decode_chunked(resp_body)

        lines = header_section.split('\r\n')
        status_line = lines[0]
        status_code = int(status_line.split(' ')[1]) if len(status_line.split(' ')) > 1 else 200

        resp_headers = {}
        set_cookie_list = []
        for line in lines[1:]:
            if ':' in line:
                k, _, v = line.partition(':')
                key = k.strip().lower()
                val = v.strip()
                if key == 'set-cookie':
                    set_cookie_list.append(val)
                else:
                    resp_headers[key] = val

        content_type = resp_headers.get('content-type', 'text/html')

        # Handle redirect
        if status_code in (301, 302, 303, 307, 308) and 'location' in resp_headers:
            loc = resp_headers['location']
            loc = re_lib.sub(r'https?://(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[01])\.\d+\.\d+)(?::\d+)?(/[^\s]*)?', lambda m: m.group(1) or '/', loc)
            redirect_resp = Response('', status=302)
            redirect_resp.headers['Location'] = loc
            for cookie in set_cookie_list:
                redirect_resp.headers.add('Set-Cookie', cookie)
            return redirect_resp

        is_html = 'text/html' in content_type
        is_js = 'javascript' in content_type
        is_css = 'text/css' in content_type

        if (is_html or is_js or is_css) and proxy_base:
            try:
                text = resp_body.decode('utf-8', errors='replace')
                # Rewrite meta-refresh URLs to go through proxy
                def fix_meta_refresh(m):
                    q = m.group(1)
                    prefix = m.group(2)
                    url = m.group(3).strip()
                    if url.startswith('http://') or url.startswith('https://'):
                        return m.group(0)
                    if url.startswith('/'):
                        return q + prefix + proxy_base + url + m.group(4)
                    else:
                        return q + prefix + proxy_base + '/' + url + m.group(4)
                text = re_lib.sub(
                    r'(content=["\'])([^;]+;\s*[Uu][Rr][Ll]=)([^"\']+)(["\'])',
                    fix_meta_refresh,
                    text
                )
                text = re_lib.sub(
                    r'https?://(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2[0-9]|3[01])\.\d+\.\d+)(?::\d+)?(/[^"\'\s]*)?',
                    lambda m: proxy_base + (m.group(1) or '/'),
                    text
                )
                def fix_js_loc(m):
                    path = re_lib.sub(r'^https?://[^/]+', '', m.group(2)) or '/'
                    return "{} = '{}{}'{}".format(m.group(1), proxy_base, path, m.group(3))
                text = re_lib.sub(
                    r"(parent\.location|window\.location(?:\.href)?)\s*=\s*[\"'](https?://[^\"']+)[\"'](\s*;?)",
                    fix_js_loc, text
                )
                def fix_attr(m):
                    q = m.group(2)
                    return "{}={}{}{}{}".format(m.group(1), q, proxy_base, m.group(3), q)
                text = re_lib.sub(r'(src|href|action)=(["\'])(/[^"\']*)\2', fix_attr, text)
                def _fix_rel(m):
                    a, q, p = m.group(1), m.group(2), m.group(3)
                    if p.startswith(("data:", "javascript:", "mailto:", "http:", "https:", "#", "//")):
                        return m.group(0)
                    return a + "=" + q + proxy_base + "/" + p + q
                _rel_pat = re_lib.compile(
                    r"(src|href|action)=" + chr(40) + chr(91) + chr(34) + chr(39) + chr(93) + chr(41) +
                    r"([^" + chr(34) + chr(39) + "/][^" + chr(34) + chr(39) + "]*)" + chr(92) + "2"
                )
                text = _rel_pat.sub(_fix_rel, text)
                resp_body = text.encode('utf-8')
            except Exception:
                pass

        skip_headers = {'transfer-encoding', 'content-encoding', 'content-length', 'connection'}
        response = Response(resp_body, status=status_code, content_type=content_type)
        for k, v in resp_headers.items():
            if k not in skip_headers:
                response.headers[k] = v
        for cookie in set_cookie_list:
            response.headers.add('Set-Cookie', cookie)
        return response

    except Exception as e:
        return jsonify({"error": "HTTP forward error: {}".format(str(e))}), 504



# ============================================================
# POST /check-card  — HTTP proxy for MikroTik Hotspot Widget
# ============================================================
@app.route('/check-card', methods=['POST', 'OPTIONS'])
def check_card_proxy():
    if request.method == 'OPTIONS':
        resp = app.make_response('')
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp, 200
    try:
        import requests as req_lib
        body = request.get_json(force=True, silent=True) or {}
        upstream = req_lib.post(
            'http://127.0.0.1:3000/api/check-card',
            json=body,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        resp_data = upstream.json()
        response = jsonify(resp_data)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.status_code = 200
        return response
    except Exception as e:
        response = jsonify({'success': False, 'error': 'خطأ في الاتصال: ' + str(e)})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.status_code = 200
        return response

if __name__ == "__main__":
    app.run(
        host=os.environ.get("RADIUS_PRO_VPN_API_HOST", "127.0.0.1"),
        port=int(os.environ.get("RADIUS_PRO_VPN_API_PORT", "8080")),
        debug=False,
    )

#!/usr/bin/env python3
"""Radius Pro Local V2 — loopback-only CoA HTTP adapter."""

import os
import re
import subprocess
from flask import Flask, jsonify, request

app = Flask(__name__)
API_KEY = os.environ.get("VPS_COA_API_KEY", "")
SAFE_ATTRIBUTES = re.compile(r"^[A-Za-z0-9_./:=,\- ]+$")


def authorized() -> bool:
    return bool(API_KEY) and request.headers.get("X-API-Key", "") == API_KEY


def request_fields():
    data = request.get_json(silent=True) or {}
    nas_ip = data.get("nasIp") or data.get("nas_ip")
    secret = data.get("secret") or data.get("nas_secret")
    attributes = data.get("attributes") or ""
    port = int(data.get("nasPort") or data.get("nas_port") or 3799)
    if not nas_ip or not secret or not attributes:
        return None, jsonify({"success": False, "error": "nasIp, secret and attributes are required"}), 400
    if not 1 <= port <= 65535 or not SAFE_ATTRIBUTES.fullmatch(attributes):
        return None, jsonify({"success": False, "error": "invalid CoA request"}), 400
    return (nas_ip, port, secret, attributes), None, None


def send(packet_type: str):
    if not authorized():
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    fields, error, status = request_fields()
    if error:
        return error, status
    nas_ip, port, secret, attributes = fields
    radius_input = "\n".join(part.strip() for part in attributes.split(",") if part.strip()) + "\n"
    try:
        result = subprocess.run(
            ["radclient", "-x", "-r", "1", "-t", "4", f"{nas_ip}:{port}", packet_type, secret],
            input=radius_input,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        output = (result.stdout + result.stderr).strip()
        expected_ack = "Disconnect-ACK" if packet_type == "disconnect" else "CoA-ACK"
        acknowledged = result.returncode == 0 and expected_ack in output
        return jsonify({
            "success": acknowledged,
            "acknowledged": acknowledged,
            "output": output,
            "error": None if acknowledged else f"No {expected_ack} received from NAS",
        }), 200
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "output": "CoA request timed out"}), 504
    except Exception:
        return jsonify({"success": False, "output": "CoA adapter execution failed"}), 500


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "Radius Pro CoA API"})


@app.post("/disconnect")
def disconnect():
    return send("disconnect")


@app.post("/change-speed")
def change_speed():
    return send("coa")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8082, debug=False)

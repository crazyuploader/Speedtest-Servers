#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Local development server for the ISP Speedtest data web dashboard.
"""

__author__ = "Jugal Kishore <me@devjugal.com>"

import json
import os
from flask import Flask, abort, send_from_directory, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

# Define paths
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")  # JSON data folder

app = Flask(__name__, static_folder="static")

# Enable reverse proxy support
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)


@app.route("/")
def dashboard():
    """Serve the main dashboard HTML"""
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/data/isps.json")
def serve_isp_list():
    """Serve the static ISP list JSON file."""
    return send_from_directory(DATA_DIR, "isps.json")


@app.route("/data/<term>/servers.json")
def serve_json(term):
    """Serve servers.json for a given ISP"""
    file_path = os.path.join(DATA_DIR, term, "servers.json")

    if not os.path.exists(file_path):
        abort(404)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON format"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Only for development use — Gunicorn should be used in production
    app.run(host="0.0.0.0", port=5000, debug=True)

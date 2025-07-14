#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serves the ISP Speedtest data as a web dashboard using Flask.
"""

__author__ = "Jugal Kishore <me@devjugal.com>"

import json
import os
from flask import Flask, abort, render_template, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

# Define paths
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")  # JSON data folder

app = Flask(__name__, template_folder="templates")

# Enable reverse proxy support
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)


@app.route("/")
def dashboard():
    """Serve the main dashboard HTML"""
    return render_template("index.html")


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


@app.route("/list")
def list_isps():
    """List all available ISPs that have a servers.json"""
    try:
        isp_dirs = sorted(
            d
            for d in os.listdir(DATA_DIR)
            if os.path.isdir(os.path.join(DATA_DIR, d))
            and os.path.isfile(os.path.join(DATA_DIR, d, "servers.json"))
        )
        return jsonify(isp_dirs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Only for development use — Gunicorn should be used in production
    app.run(host="0.0.0.0", port=5000, debug=True)

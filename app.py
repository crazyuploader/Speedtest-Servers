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

app = Flask(__name__, static_folder="data", template_folder="templates")

# Enable proxy headers
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)


@app.route("/")
def dashboard():
    return render_template("index.html")


@app.route("/data/<term>/servers.json")
def serve_json(term):
    file_path = os.path.join(app.static_folder, term, "servers.json")

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
    base_dir = app.static_folder
    try:
        isp_dirs = sorted(
            d
            for d in os.listdir(base_dir)
            if os.path.isdir(os.path.join(base_dir, d))
            and os.path.isfile(os.path.join(base_dir, d, "servers.json"))
        )
        return jsonify(isp_dirs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

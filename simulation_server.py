"""
SmartTraffic - Dedicated 2D Interactive Road Network Simulation Server
Runs on Port 5001 and connects in real-time with the Dashboard & Backend API on Port 5000.
"""

import os
import sys
import urllib.request
import urllib.error
from flask import Flask, send_from_directory, request, Response
from flask_cors import CORS

def create_simulation_app():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(base_dir, 'frontend')

    app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
    CORS(app)

    API_BACKEND = "http://127.0.0.1:5000"

    # Serve 2D Simulation page as root
    @app.route('/')
    def index():
        return send_from_directory(frontend_dir, 'simulation.html')

    # Reverse proxy for /api requests to Dashboard Backend on port 5000
    @app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
    def proxy_api(path):
        if request.method == 'OPTIONS':
            resp = Response('', status=200)
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            return resp

        target_url = f"{API_BACKEND}/api/{path}"
        if request.query_string:
            target_url += f"?{request.query_string.decode('utf-8')}"

        req_data = request.get_data() if request.method in ['POST', 'PUT'] else None
        headers = {k: v for k, v in request.headers if k.lower() not in ['host', 'content-length']}
        headers['Content-Type'] = 'application/json'

        try:
            req = urllib.request.Request(target_url, data=req_data, headers=headers, method=request.method)
            with urllib.request.urlopen(req, timeout=5) as response:
                content = response.read()
                return Response(content, status=response.status, content_type=response.headers.get('content-type', 'application/json'))
        except urllib.error.HTTPError as e:
            return Response(e.read(), status=e.code, content_type='application/json')
        except Exception as e:
            return {"status": "ERROR", "message": f"Proxy error connecting to port 5000: {str(e)}"}, 502

    # Serve static assets
    @app.route('/<path:path>')
    def serve_static(path):
        if os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)
        return send_from_directory(frontend_dir, 'simulation.html')

    return app

if __name__ == '__main__':
    port = int(os.environ.get('SIM_PORT', 5001))
    app = create_simulation_app()
    print("============================================================")
    print("🚦 SmartTraffic 2D Simulation Server Starting")
    print(f"👉 Simulation URL: http://localhost:{port}")
    print(f"👉 Connected to Dashboard Backend at: http://localhost:5000")
    print("============================================================")
    app.run(host='0.0.0.0', port=port, debug=False)

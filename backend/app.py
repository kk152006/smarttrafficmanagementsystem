import os
from decimal import Decimal
from datetime import datetime, date
from flask import Flask, jsonify, send_from_directory, request
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
from backend.config import Config

from backend.routes.junctions import junctions_bp
from backend.routes.roads import roads_bp
from backend.routes.vehicles import vehicles_bp
from backend.routes.simulations import simulations_bp
from backend.routes.signals import signals_bp
from backend.routes.incidents import incidents_bp
from backend.routes.analytics import analytics_bp
from backend.routes.system import system_bp

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

def create_app():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dir = os.path.join(base_dir, 'frontend')

    app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
    app.json = CustomJSONProvider(app)
    app.config.from_object(Config)

    # Enable CORS for cross-origin requests
    CORS(app)

    # Register API Blueprints
    app.register_blueprint(junctions_bp, url_prefix='/api/junctions')
    app.register_blueprint(roads_bp, url_prefix='/api/roads')
    app.register_blueprint(vehicles_bp, url_prefix='/api/vehicles')
    app.register_blueprint(simulations_bp, url_prefix='/api/simulations')
    app.register_blueprint(signals_bp, url_prefix='/api/signals')
    app.register_blueprint(incidents_bp, url_prefix='/api/incidents')
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(system_bp, url_prefix='/api/system')

    # Frontend serving routes
    @app.route('/')
    def serve_index():
        return send_from_directory(frontend_dir, 'index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        if os.path.exists(os.path.join(frontend_dir, path)):
            return send_from_directory(frontend_dir, path)
        return send_from_directory(frontend_dir, 'index.html')

    # Global Error Handlers
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"status": "ERROR", "message": str(e.description if hasattr(e, 'description') else e)}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"status": "ERROR", "message": "The requested resource was not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"status": "ERROR", "message": "An internal server error occurred"}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    print(f"============================================================")
    print(f"SmartTraffic Server starting on port {Config.PORT}")
    print(f"Web Dashboard: http://localhost:{Config.PORT}")
    print(f"============================================================")
    app.run(host='0.0.0.0', port=Config.PORT, debug=Config.DEBUG)

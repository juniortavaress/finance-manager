from flask import current_app, jsonify


class ApiError(Exception):
    def __init__(self, message, status_code=400, payload=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload or {}

    def to_dict(self):
        body = dict(self.payload)
        body["error"] = self.message
        return body


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return jsonify(err.to_dict()), err.status_code

    @app.errorhandler(404)
    def handle_404(err):
        return jsonify({"error": "Recurso não encontrado"}), 404

    @app.errorhandler(405)
    def handle_405(err):
        return jsonify({"error": "Método não permitido"}), 405

    @app.errorhandler(500)
    def handle_500(err):
        current_app.logger.exception(err)
        return jsonify({"error": "Erro interno do servidor"}), 500

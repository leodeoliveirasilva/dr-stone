from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Any

from flask import Flask, Response, jsonify, request

from dr_stone.config import Settings
from dr_stone.logging import configure_logging
from dr_stone.models import TrackedProduct
from dr_stone.runtime import build_collection_service, build_postgres_storage
from dr_stone.search_terms import normalize_search_terms


def create_app() -> Flask:
    app = Flask(__name__)

    settings = Settings.from_env()
    logger = configure_logging(settings.log_level)
    storage = build_postgres_storage(logger)

    @app.after_request
    def add_cors_headers(response: Response) -> Response:
        origin = request.headers.get("Origin", "*")
        requested_headers = request.headers.get("Access-Control-Request-Headers")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = requested_headers or "content-type,authorization"
        response.headers["Vary"] = "Origin, Access-Control-Request-Headers"
        return response

    @app.route("/", methods=["GET"])
    def root() -> Response:
        return jsonify({"name": "dr-stone-api", "status": "ok"})

    @app.route("/health", methods=["GET"])
    def health() -> Response:
        return jsonify({"status": "ok"})

    @app.route("/search-runs", methods=["GET"])
    def search_runs() -> Response:
        date = request.args.get("date")
        if date:
            _validate_date(date)
        limit = _parse_positive_int(request.args.get("limit"), "limit", default=40, maximum=200)
        return jsonify({"date": date, "runs": storage.list_search_runs(date=date, limit=limit)})

    @app.route("/tracked-products", methods=["GET", "POST", "OPTIONS"])
    def tracked_products() -> Response:
        if request.method == "OPTIONS":
            return Response(status=204)
        if request.method == "GET":
            include_inactive = request.args.get("all") == "1"
            products = storage.list_tracked_products(active_only=not include_inactive)
            return jsonify([_tracked_product_to_api_dict(product) for product in products])

        payload = _require_json_object()
        _reject_legacy_scrape_rate_fields(payload)
        tracked_product = storage.create_tracked_product(
            product_title=_require_string(payload, "title"),
            search_terms=_require_search_terms(payload),
            active=bool(payload.get("active", True)),
        )
        return jsonify(_tracked_product_to_api_dict(tracked_product)), 201

    @app.route("/collect-due", methods=["POST", "OPTIONS"])
    def collect_due() -> Response:
        if request.method == "OPTIONS":
            return Response(status=204)
        service = build_collection_service(settings, logger, storage)
        try:
            results = service.collect_due()
            return jsonify([result.to_dict() for result in results])
        finally:
            service.close()

    @app.route("/tracked-products/<tracked_product_id>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    def tracked_product(tracked_product_id: str) -> Response:
        if request.method == "OPTIONS":
            return Response(status=204)

        if request.method == "POST" and request.args.get("action") == "collect":
            service = build_collection_service(settings, logger, storage)
            try:
                tracked = storage.get_tracked_product(tracked_product_id)
                if tracked is None or not tracked.active:
                    raise LookupError(f"Tracked product not found: {tracked_product_id}")
                result = service.collect_tracked_product(tracked)
                return jsonify(result.to_dict())
            finally:
                service.close()

        if request.method == "GET":
            tracked = storage.get_tracked_product(tracked_product_id)
            if tracked is None:
                raise LookupError(f"Tracked product not found: {tracked_product_id}")
            return jsonify(_tracked_product_to_api_dict(tracked))

        if request.method in {"PUT", "PATCH"}:
            current = storage.get_tracked_product(tracked_product_id)
            if current is None:
                raise LookupError(f"Tracked product not found: {tracked_product_id}")
            payload = _require_json_object()
            _reject_legacy_scrape_rate_fields(payload)
            updated = storage.update_tracked_product(
                tracked_product_id,
                product_title=_coerce_string(payload.get("title")) or current.product_title,
                search_terms=_coerce_search_terms(payload) or current.search_terms,
                active=bool(payload.get("active")) if "active" in payload else current.active,
            )
            if updated is None:
                raise LookupError(f"Tracked product not found: {tracked_product_id}")
            return jsonify(_tracked_product_to_api_dict(updated))

        deleted = storage.delete_tracked_product(tracked_product_id)
        if not deleted:
            raise LookupError(f"Tracked product not found: {tracked_product_id}")
        return Response(status=204)

    @app.route("/tracked-products/<tracked_product_id>/history", methods=["GET", "OPTIONS"])
    def tracked_product_history(tracked_product_id: str) -> Response:
        if request.method == "OPTIONS":
            return Response(status=204)
        limit = _parse_positive_int(request.args.get("limit"), "limit", default=100, maximum=500)
        history_rows = storage.list_price_history(tracked_product_id, limit=limit)
        return jsonify([row.to_dict() for row in history_rows])

    @app.route("/price-history/minimums", methods=["GET", "OPTIONS"])
    def price_history_minimums() -> Response:
        if request.method == "OPTIONS":
            return Response(status=204)
        product_id = _require_query_string(request.args.get("product_id"), "product_id")
        period = _parse_period_or_granularity(
            request.args.get("period"),
            request.args.get("granularity"),
        )
        start_at = _parse_datetime_query_param(request.args.get("start_at"), "start_at")
        end_at = _parse_datetime_query_param(request.args.get("end_at"), "end_at", end_of_day=True)
        if start_at > end_at:
            raise ValueError("start_at must be less than or equal to end_at.")

        tracked_product = storage.get_tracked_product(product_id)
        if tracked_product is None:
            raise LookupError(f"Tracked product not found: {product_id}")

        minimum_rows = storage.list_period_minimum_prices(
            product_id,
            period=period,
            start_at=start_at,
            end_at=end_at,
        )
        return jsonify(
            {
                "product_id": product_id,
                "product_title": tracked_product.product_title,
                "granularity": period,
                "period": period,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "items": [
                    _period_minimum_price_to_api_dict(row, tracked_product.product_title) for row in minimum_rows
                ],
            }
        )

    @app.errorhandler(LookupError)
    def handle_not_found(error: LookupError) -> tuple[Response, int]:
        return jsonify({"error": str(error)}), 404

    @app.errorhandler(ValueError)
    def handle_bad_request(error: ValueError) -> tuple[Response, int]:
        return jsonify({"error": str(error)}), 400

    @app.errorhandler(Exception)
    def handle_unexpected_error(error: Exception) -> tuple[Response, int]:
        logger.exception("api_request_failed")
        return jsonify({"error": str(error) or "Internal server error", "error_type": type(error).__name__}), 500

    return app


def _require_json_object() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def _require_string(payload: dict[str, Any], key: str) -> str:
    value = _coerce_string(payload.get(key))
    if value is None:
        raise ValueError(f"{key} is required")
    return value


def _require_query_string(value: object, field_name: str) -> str:
    text = _coerce_string(value)
    if text is None:
        raise ValueError(f"{field_name} is required")
    return text


def _coerce_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _require_search_terms(payload: dict[str, Any]) -> list[str]:
    search_terms = _coerce_search_terms(payload)
    if search_terms is None:
        raise ValueError("search_terms is required")
    return search_terms


def _coerce_search_terms(payload: dict[str, Any]) -> list[str] | None:
    if "search_terms" in payload:
        raw_terms = payload.get("search_terms")
        if not isinstance(raw_terms, list):
            raise ValueError("search_terms must be an array of strings.")
        return normalize_search_terms(raw_terms)

    legacy_search_term = _coerce_string(payload.get("search_term"))
    if legacy_search_term is not None:
        return normalize_search_terms([legacy_search_term])
    return None


def _reject_legacy_scrape_rate_fields(payload: dict[str, Any]) -> None:
    if "scrapes_per_day" in payload:
        raise ValueError("scrapes_per_day is not supported per product. Collection cadence is global.")


def _tracked_product_to_api_dict(tracked_product: TrackedProduct) -> dict[str, Any]:
    return {
        "id": tracked_product.id,
        "title": tracked_product.product_title,
        "search_terms": tracked_product.search_terms,
        "active": tracked_product.active,
        "created_at": tracked_product.created_at.isoformat(),
        "updated_at": tracked_product.updated_at.isoformat(),
    }


def _period_minimum_price_to_api_dict(row: Any, tracked_product_title: str) -> dict[str, Any]:
    payload = row.to_dict()
    payload["source_product_title"] = payload["product_title"]
    payload["product_title"] = tracked_product_title
    return payload


def _parse_positive_int(
    value: object,
    field_name: str,
    *,
    default: int | None = None,
    maximum: int | None = None,
) -> int:
    if value in {None, ""}:
        if default is None:
            raise ValueError(f"{field_name} is required")
        return default
    try:
        parsed = int(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a positive integer.") from exc
    if parsed <= 0:
        raise ValueError(f"{field_name} must be a positive integer.")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} must be less than or equal to {maximum}.")
    return parsed


def _parse_period_or_granularity(period_value: object, granularity_value: object) -> str:
    period = _coerce_string(period_value)
    granularity = _coerce_string(granularity_value)

    if period is None and granularity is None:
        raise ValueError("period or granularity is required")
    if period is not None and granularity is not None and period.lower() != granularity.lower():
        raise ValueError("period and granularity must match when both are provided.")

    selected_value = granularity or period
    if selected_value is None:
        raise ValueError("period or granularity is required")

    period = selected_value.lower()
    if period not in {"day", "week", "month"}:
        raise ValueError("period/granularity must be one of: day, week, month.")
    return period


def _parse_datetime_query_param(
    value: object,
    field_name: str,
    *,
    end_of_day: bool = False,
) -> datetime:
    text = _require_query_string(value, field_name)
    normalized = text.replace("Z", "+00:00")

    try:
        if "T" not in normalized and " " not in normalized:
            parsed_date = date.fromisoformat(normalized)
            boundary = time.max if end_of_day else time.min
            return datetime.combine(parsed_date, boundary, tzinfo=UTC)

        parsed_datetime = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid {field_name}. Use YYYY-MM-DD or ISO 8601 datetime.") from exc

    if parsed_datetime.tzinfo is None:
        return parsed_datetime.replace(tzinfo=UTC)
    return parsed_datetime.astimezone(UTC)


def _validate_date(value: str) -> None:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Invalid date. Use YYYY-MM-DD.") from exc

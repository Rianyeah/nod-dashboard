def test_security_headers_and_trusted_host_are_enforced(client):
    response = client.get("/api/v1/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["cache-control"] == "private, no-store"
    assert client.get("/api/v1/health", headers={"Host": "attacker.example"}).status_code == 400


def test_large_json_body_is_rejected_before_auth_parsing(client):
    response = client.post(
        "/api/v1/auth/login",
        content=b'{"payload":"' + b"x" * 1_048_576 + b'"}',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413


def test_production_docs_routes_do_not_fall_through_to_the_spa(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/api/v1/openapi.json").status_code == 404


def test_capture_paths_are_not_cacheable_or_referrable():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from middleware import SecurityHeadersMiddleware

    app = FastAPI()
    app.add_middleware(
        SecurityHeadersMiddleware,
        content_security_policy="default-src 'self'",
    )

    @app.get("/capture/site-detail/BGL002")
    async def capture_page():
        return {"ok": True}

    @app.post("/api/v1/integrations/n8n/site-detail-capture-token")
    async def capture_token():
        return {"ok": True}

    with TestClient(app) as hardened:
        page = hardened.get("/capture/site-detail/BGL002")
        token = hardened.post("/api/v1/integrations/n8n/site-detail-capture-token")

    for response in (page, token):
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"

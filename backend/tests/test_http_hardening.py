def test_security_headers_and_trusted_host_are_enforced(client):
    response = client.get("/api/v1/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert client.get("/api/v1/health", headers={"Host": "attacker.example"}).status_code == 400


def test_large_json_body_is_rejected_before_auth_parsing(client):
    response = client.post(
        "/api/v1/auth/login",
        content=b'{"payload":"' + b"x" * 1_048_576 + b'"}',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413

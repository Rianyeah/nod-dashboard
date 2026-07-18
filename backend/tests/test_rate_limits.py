from tests.conftest import TEST_ORIGIN


def test_sixth_failed_login_is_rate_limited(client, credentials):
    headers = {"Origin": TEST_ORIGIN}
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={**credentials, "password": "incorrect"},
            headers=headers,
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/v1/auth/login",
        json={**credentials, "password": "incorrect"},
        headers=headers,
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_successful_login_resets_prior_failure_count(client, credentials):
    headers = {"Origin": TEST_ORIGIN}
    for _ in range(4):
        assert client.post(
            "/api/v1/auth/login",
            json={**credentials, "password": "incorrect"},
            headers=headers,
        ).status_code == 401

    assert client.post("/api/v1/auth/login", json=credentials, headers=headers).status_code == 200

    for _ in range(5):
        assert client.post(
            "/api/v1/auth/login",
            json={**credentials, "password": "incorrect"},
            headers=headers,
        ).status_code == 401

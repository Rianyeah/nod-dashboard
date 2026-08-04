"""ASGI middleware for uniform request and browser-response hardening."""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = 1_048_576) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = next(
            (value for name, value in scope["headers"] if name == b"content-length"),
            b"",
        )
        try:
            is_oversized = int(content_length or 0) > self.max_bytes
        except ValueError:
            is_oversized = True
        if is_oversized:
            await self._reject(send)
            return

        consumed = 0

        async def limited_receive() -> Message:
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > self.max_bytes:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._reject(send)

    @staticmethod
    async def _reject(send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"detail":"Request too large"}'})


class RequestBodyTooLarge(Exception):
    pass


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, content_security_policy: str) -> None:
        self.app = app
        self.content_security_policy = content_security_policy.encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def secure_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                path = scope.get("path", "")
                is_capture_path = path.startswith("/capture/") or (
                    path.startswith("/api/")
                    and "/integrations/n8n/site-detail-capture" in path
                )
                if is_capture_path:
                    headers = _replace_header(headers, b"cache-control", b"no-store")
                elif path.startswith("/api/"):
                    headers = _replace_header(
                        headers,
                        b"cache-control",
                        b"private, no-store",
                    )
                headers = _replace_header(
                    headers,
                    b"referrer-policy",
                    b"no-referrer"
                    if is_capture_path
                    else b"strict-origin-when-cross-origin",
                )
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                        (b"content-security-policy", self.content_security_policy),
                    ]
                )
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, secure_send)


def _replace_header(
    headers: list[tuple[bytes, bytes]],
    name: bytes,
    value: bytes,
) -> list[tuple[bytes, bytes]]:
    return [
        header for header in headers if header[0].lower() != name
    ] + [(name, value)]

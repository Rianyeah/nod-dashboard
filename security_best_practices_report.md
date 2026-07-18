# Dashboard security hardening status

This report records the remediation status of the dashboard review findings. Automated checks prove the code and build controls; production verification remains a release task until the immutable image is deployed.

| Finding | Status | Evidence |
| --- | --- | --- |
| SEC-001: Default/plaintext dashboard credentials | Remediated | `SecuritySettings` rejects missing configuration and requires Argon2id. `backend/.env.example` contains no usable credentials. |
| SEC-002: Browser-readable authentication token | Remediated | `AuthProvider` uses `/auth/session`; `authSecurityContracts.test.js` proves there is no bearer token storage or request interceptor. |
| SEC-003: Unauthenticated dashboard APIs | Remediated | Router-level session dependencies are covered by `test_router_auth.py`. |
| SEC-004: Cookie CSRF exposure | Remediated | Unsafe session routes require the exact public `Origin`, covered by `test_auth_security.py`. |
| SEC-005: Missing production HTTP boundaries | Remediated | Trusted hosts, CSP, anti-framing, MIME sniffing, referrer policy, and body limits are covered by `test_http_hardening.py`. |
| SEC-006: Login and RF-analysis abuse | Remediated | Login attempts, RF request budget, concurrency, and work-factor limits are tested by `test_rate_limits.py` and `test_rf_tilt_security.py`. |
| SEC-007: Dynamic map HTML injection | Remediated | Map popups use DOM nodes and `setDOMContent`; `mapDomSecurity.test.js` tests hostile labels as text. |
| SEC-008: Unlocked or vulnerable dependencies | Remediated | Python uses hash-locked requirements and `pip_audit`; frontend CI runs a production `npm audit`. |
| SEC-009: Mutable/unreviewed release artifact | Implemented; production verification pending | CI publishes `ghcr.io/rianyeah/nod-dashboard:<git-sha>` and the Zeabur template requires a SHA placeholder. Confirm the deployed service uses that exact tag before marking production verified. |
| SEC-010: Security regression coverage | Implemented; preview verification pending | `security-e2e.spec.js` checks login, cookie flags, reload, logout, anonymous APIs, documentation, CORS, headers, and CSP. Run it against a HTTPS preview with explicit E2E variables. |

## Remaining operational requirements

- Set every required Zeabur variable from the [deployment runbook](docs/security-deployment.md); never place generated values in Git.
- Deploy the immutable SHA image to a preview service, run `security-e2e.spec.js`, then repeat the checks in production.
- Rotate `DASHBOARD_SESSION_SECRET` immediately if a session-signing secret is exposed; this invalidates existing sessions.
- Keep the dashboard to one process until distributed Redis-backed rate limiting is added.

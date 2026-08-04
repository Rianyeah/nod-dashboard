# Telegram N8N Full Site-Detail Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Telegram bot request one Site ID and receive one accurate, uncropped, full-height PNG of the existing Site Detail modal as a Telegram document, normally within 5-12 seconds.

**Architecture:** Add a dedicated N8N capture credential and a 60-second site-scoped signed token, expose one bundle endpoint that reuses the existing detail/trend/performance loaders, and render that bundle on a capture-only React route outside both PrivateRoute and AuthProvider. Browserless BrowserQL waits for an exact ready marker, screenshots only the expanded modal, and returns base64 that the N8N subworkflow validates and converts to binary before Telegram Send Document.

**Tech Stack:** FastAPI, Pydantic, itsdangerous, SQLAlchemy AsyncSession, React 19, React Router, Recharts, Tailwind CSS, Node test runner, pytest, Playwright, Browserless BrowserQL, N8N HTTP Request/Code/Switch/Telegram nodes.

## Global Constraints

- Work on the current branch and do not merge or push unless explicitly requested.
- Preserve all unrelated tracked and untracked files. Stage only files named by the current task.
- Follow strict RED-GREEN-REFACTOR for every production change.
- Do not store or reuse the dashboard password, browser session cookie, admin N8N key, or N8N map key.
- Keep N8N_CAPTURE_API_KEY and N8N_CAPTURE_SIGNING_SECRET separate from every existing secret.
- Keep the token lifetime fixed at 60 seconds and scope every token to exactly one normalized Site ID.
- Never put the capture token in the URL query string; use the URL fragment and remove it immediately in the browser.
- Keep the capture route outside AuthProvider so it never calls /api/v1/auth/session.
- Do not redesign SiteDetailModal or change its normal authenticated behavior.
- Mark the capture ready only after the complete bundle, exact visible Site ID, chart layout, fonts, and two animation frames are complete.
- Capture one PNG only. Fail explicitly if its bytes, MIME type, dimensions, Site ID, or readiness contract are invalid.
- Send the PNG with Telegram Send Document, not Send Photo.
- Do not return image bytes or base64 to the AI Agent; return only compact status JSON.
- Do not log credentials, tokens, capture URLs, Browserless responses, Telegram tokens, or image bytes.
- Use condition-based Browserless waits, not a fixed sleep.
- After implementation verification, run graphify update . and verify graphify-out/graph.json plus graphify-out/GRAPH_REPORT.md.

## File Structure and Responsibilities

- backend/capture_tokens.py: issue and validate capture-only signed claims.
- backend/models/capture.py: request and response contracts for token minting and the capture bundle.
- backend/services/site_detail_capture.py: normalize Site IDs and compose the existing detail, trend, and performance loaders.
- backend/routers/n8n_site_capture.py: dedicated machine-authenticated token issuer and bearer-authenticated bundle endpoint.
- frontend/src/features/siteCapture/captureRuntime.js: fragment parsing, exact-site checks, and paint/readiness helpers.
- frontend/src/services/siteDetailCapture.js: standalone bearer request with no dashboard-cookie or global 401 behavior.
- frontend/src/pages/SiteDetailCapturePage.jsx: minimal loading, ready, and error state machine.
- frontend/src/components/SiteDetailModal.jsx: existing modal plus a captureMode layout switch.
- n8n/workflows/capture-site-detail.json: importable capture tool subworkflow.
- docs/n8n_site_detail_capture.md: credentials, node wiring, main-agent integration, deployment, and acceptance runbook.
- site-detail-capture-playwright.spec.js: browser proof for isolation, readiness, and full-height layout.

---

### Task 1: Dedicated Capture Settings and Signed Token Primitive

**Files:**

- Modify: backend/tests/conftest.py:10-28
- Modify: backend/tests/test_security_config.py:7-45
- Create: backend/tests/test_capture_tokens.py
- Modify: backend/config.py:23-119
- Create: backend/capture_tokens.py
- Modify: backend/.env.example:1-18

**Interfaces:**

- Extends SecuritySettings with n8n_capture_api_key and n8n_capture_signing_secret.
- Produces CaptureClaims(aud, site_id, theme, iat, exp).
- Produces CaptureTokenManager.issue(site_id, theme) -> tuple[token, claims].
- Produces CaptureTokenManager.verify(token) -> CaptureClaims.
- Uses the fixed audience nod-site-detail-capture and fixed TTL 60 seconds.

- [ ] **Step 1: Add the required test environment values**

Add two independent values to backend/tests/conftest.py and valid_env() in backend/tests/test_security_config.py:

~~~python
"N8N_CAPTURE_API_KEY": "test-only-n8n-capture-key",
"N8N_CAPTURE_SIGNING_SECRET": base64.urlsafe_b64encode(b"c" * 32).decode(),
~~~

Extend the required-value test and assert that production parsing exposes both values. Add assertions that the signing secret must decode to at least 32 bytes and that the capture API key cannot equal N8N_API_KEY or N8N_MAP_API_KEY.

- [ ] **Step 2: Write failing unit tests for capture claims**

Create backend/tests/test_capture_tokens.py with a deterministic clock and tests for:

- exact claim shape and 60-second expiry;
- valid verification before expiry;
- rejection after expiry;
- rejection of a forged signature;
- rejection of a different audience;
- rejection of missing or extra claims;
- rejection of unsupported theme values;
- no token text in exception messages.

Use this contract:

~~~python
def test_token_is_site_scoped_for_exactly_sixty_seconds(security_settings):
    manager = CaptureTokenManager(security_settings, clock=lambda: 1_700_000_000)

    token, claims = manager.issue("BGL002", "dark")

    assert claims == CaptureClaims(
        aud="nod-site-detail-capture",
        site_id="BGL002",
        theme="dark",
        iat=1_700_000_000,
        exp=1_700_000_060,
    )
    assert manager.verify(token) == claims
~~~

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

~~~powershell
python -m pytest backend/tests/test_security_config.py backend/tests/test_capture_tokens.py -q
~~~

Expected: collection fails because capture settings and CaptureTokenManager do not exist.

- [ ] **Step 4: Parse and validate the two dedicated secrets**

Refactor the existing session-secret decoder into a named helper so error messages identify the correct variable. Add the fields and parsing:

~~~python
@dataclass(frozen=True)
class SecuritySettings:
    # existing fields
    n8n_capture_api_key: str
    n8n_capture_signing_secret: str

capture_api_key = _required(source, "N8N_CAPTURE_API_KEY")
capture_signing_secret = _required(source, "N8N_CAPTURE_SIGNING_SECRET")
if len(_decode_urlsafe_secret(capture_signing_secret, "N8N_CAPTURE_SIGNING_SECRET")) < 32:
    raise SecurityConfigurationError(
        "N8N_CAPTURE_SIGNING_SECRET must decode to at least 32 bytes"
    )
if capture_api_key in {
    _required(source, "N8N_API_KEY"),
    _required(source, "N8N_MAP_API_KEY"),
}:
    raise SecurityConfigurationError(
        "N8N_CAPTURE_API_KEY must be distinct from other N8N keys"
    )
~~~

Add empty entries to backend/.env.example. Do not add real secrets to any tracked file.

- [ ] **Step 5: Implement the token manager**

Use URLSafeTimedSerializer with SHA-256 and the dedicated salt nod-site-detail-capture-v1. Validate the explicit iat and exp claims as well as the serializer age:

~~~python
CAPTURE_TOKEN_AUDIENCE = "nod-site-detail-capture"
CAPTURE_TOKEN_TTL_SECONDS = 60
CAPTURE_THEMES = frozenset({"dark"})

@dataclass(frozen=True)
class CaptureClaims:
    aud: str
    site_id: str
    theme: str
    iat: int
    exp: int

class CaptureTokenManager:
    def issue(self, site_id: str, theme: str) -> tuple[str, CaptureClaims]:
        now = int(self._clock())
        claims = CaptureClaims(
            aud=CAPTURE_TOKEN_AUDIENCE,
            site_id=site_id,
            theme=theme,
            iat=now,
            exp=now + CAPTURE_TOKEN_TTL_SECONDS,
        )
        return self._serializer.dumps(asdict(claims)), claims

    def verify(self, token: str) -> CaptureClaims:
        payload = self._serializer.loads(
            token,
            max_age=CAPTURE_TOKEN_TTL_SECONDS,
        )
        claims = CaptureClaims(**payload)
        if (
            claims.aud != CAPTURE_TOKEN_AUDIENCE
            or claims.theme not in CAPTURE_THEMES
            or claims.exp - claims.iat != CAPTURE_TOKEN_TTL_SECONDS
            or not claims.iat <= int(self._clock()) <= claims.exp
        ):
            raise CaptureTokenValidationError("Invalid capture token")
        return claims
~~~

Convert BadSignature, SignatureExpired, TypeError, and ValueError into the same CaptureTokenValidationError without echoing the token or payload.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

~~~powershell
python -m pytest backend/tests/test_security_config.py backend/tests/test_capture_tokens.py -q
~~~

Expected: all focused tests pass.

- [ ] **Step 7: Commit Task 1**

~~~powershell
git add backend/.env.example backend/config.py backend/capture_tokens.py backend/tests/conftest.py backend/tests/test_security_config.py backend/tests/test_capture_tokens.py
git commit -m "feat: add site capture token security"
~~~

---

### Task 2: Token Issuer and Complete Capture Bundle API

**Files:**

- Create: backend/tests/test_n8n_site_capture.py
- Modify: backend/tests/test_http_hardening.py
- Create: backend/models/capture.py
- Create: backend/services/site_detail_capture.py
- Create: backend/routers/n8n_site_capture.py
- Modify: backend/queries/sql_queries.py:207-270
- Modify: backend/security.py:101-127
- Modify: backend/middleware.py:49-72
- Modify: backend/main.py:163-286

**Interfaces:**

- POST /api/v1/integrations/n8n/site-detail-capture-token
- Header X-N8N-Capture-API-Key
- Request CaptureTokenRequest(site_id, theme="dark")
- Response CaptureTokenResponse(site_id, capture_url, expires_at)
- GET /api/v1/integrations/n8n/site-detail-capture/{site_id}
- Header Authorization: Bearer capture-token
- Response SiteDetailCaptureBundle(site_id, detail, trend_data, performance_data)
- Produces normalize_capture_site_id(value) -> str.
- Produces site_exists_for_capture(site_id, session) -> bool.
- Produces load_site_detail_capture_bundle(site_id, session) -> SiteDetailCaptureBundle.

- [ ] **Step 1: Write failing API and bundle tests**

Create backend/tests/test_n8n_site_capture.py. Cover:

- missing or wrong dedicated key returns 401;
- dashboard cookie, X-N8N-API-Key, and X-N8N-Map-API-Key cannot mint;
- input is trimmed and uppercased;
- IDs outside ^[A-Z0-9][A-Z0-9_-]{1,31}$ return 422;
- a well-formed Site ID absent from data_site_master returns 404 before a token is issued;
- issuer response uses PUBLIC_APP_ORIGIN and a fragment token, never a query token;
- issuer response is no-store and has no-referrer;
- independent issuer limiter returns 429 with Retry-After after 30 requests per 60 seconds;
- bundle without bearer returns 401;
- expired/forged bearer returns 401;
- a valid BGL002 token fetching BGL003 returns 403;
- missing master site remains 404;
- detail resolves first, then trend and performance start concurrently;
- empty optional results remain [] and an empty SitePerformance;
- an optional loader exception becomes retryable 503 with no partial payload;
- bundle response and error response are no-store.

Test the fragment contract without exposing the token:

~~~python
response = client.post(
    "/api/v1/integrations/n8n/site-detail-capture-token",
    headers={"X-N8N-Capture-API-Key": "test-only-n8n-capture-key"},
    json={"site_id": " bgl002 ", "theme": "dark"},
)
assert response.status_code == 200
payload = response.json()
assert payload["site_id"] == "BGL002"
assert payload["capture_url"].startswith(
    "https://nod-dashboard.zeabur.app/capture/site-detail/BGL002#token="
)
assert "?token=" not in payload["capture_url"]
~~~

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

~~~powershell
python -m pytest backend/tests/test_n8n_site_capture.py backend/tests/test_http_hardening.py -q
~~~

Expected: the new router, models, and response hardening do not exist.

- [ ] **Step 3: Add capture API models and exact Site ID normalization**

Create backend/models/capture.py:

~~~python
class CaptureTokenRequest(BaseModel):
    site_id: str = Field(min_length=2, max_length=64)
    theme: Literal["dark"] = "dark"

class CaptureTokenResponse(BaseModel):
    site_id: str
    capture_url: AnyHttpUrl
    expires_at: datetime

class SiteDetailCaptureBundle(BaseModel):
    site_id: str
    detail: dict[str, Any]
    trend_data: list[AvailabilityTrendItem]
    performance_data: SitePerformance
~~~

Normalize before validation:

~~~python
CAPTURE_SITE_ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")

def normalize_capture_site_id(value: str) -> str:
    normalized = value.strip().upper()
    if not CAPTURE_SITE_ID_PATTERN.fullmatch(normalized):
        raise ValueError("Invalid Site ID")
    return normalized
~~~

- [ ] **Step 4: Compose the existing loaders without duplicating SQL**

Add a parameterized SITE_CAPTURE_EXISTS_QUERY using an exact data_site_master Siteid match. Create backend/services/site_detail_capture.py with a cheap site_exists_for_capture() helper for the issuer. Call the existing route functions as internal async loaders with explicit arguments so FastAPI Query defaults never leak into direct calls:

~~~python
SITE_CAPTURE_EXISTS_QUERY = """
SELECT EXISTS (
    SELECT 1
    FROM data_site_master
    WHERE "Siteid" = :site_id
) AS site_exists
"""

async def site_exists_for_capture(site_id: str, session: AsyncSession) -> bool:
    result = await session.execute(text(SITE_CAPTURE_EXISTS_QUERY), {"site_id": site_id})
    return bool(result.scalar())
~~~

~~~python
async def load_site_detail_capture_bundle(
    site_id: str,
    session: AsyncSession,
) -> SiteDetailCaptureBundle:
    detail = await get_site_detail(
        site_id=site_id,
        bulan=None,
        tahun=None,
        session=session,
    )
    try:
        trend_data, performance_data = await asyncio.gather(
            get_trend(
                site_id=site_id,
                tahun=int(detail["tahun"]),
                bulan=int(detail["bulan"]),
                session=session,
            ),
            get_site_performance(site_id=site_id, session=session),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise CaptureBundleUnavailable from exc

    return SiteDetailCaptureBundle(
        site_id=site_id,
        detail=detail,
        trend_data=trend_data,
        performance_data=performance_data,
    )
~~~

Do not use Promise-style partial fallbacks in this endpoint. One optional-query failure must prevent ready capture and return 503.

- [ ] **Step 5: Add dedicated machine and bearer authentication**

Add verify_n8n_capture_key() to backend/security.py with an explicit Header alias. Add require_capture_claims() that parses exactly Bearer followed by one token and converts CaptureTokenValidationError to 401.

Initialize these independent objects in create_app():

~~~python
app.state.capture_token_manager = CaptureTokenManager(security_settings)
app.state.capture_token_limiter = InMemoryRateLimiter()
~~~

The issuer limiter key is the authenticated key fingerprint plus request client address. Hash the key before it enters the limiter key; never store the raw credential.

- [ ] **Step 6: Implement the two capture routes**

Create backend/routers/n8n_site_capture.py. The issuer must:

1. authenticate the dedicated key;
2. consume the independent 30-per-60-second limit;
3. normalize the requested Site ID;
4. verify the normalized ID exists in data_site_master and return 404 if not;
5. issue the token;
6. build the capture URL from settings.public_app_origin;
7. return expires_at in UTC.

The bundle route must compare both the normalized path Site ID and the claim Site ID using secrets.compare_digest before opening a database session. Map CaptureBundleUnavailable to:

~~~python
raise HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="Site detail capture data is temporarily unavailable",
    headers={"Retry-After": "1"},
)
~~~

Register this router in main.py without dashboard_dependency.

- [ ] **Step 7: Harden capture HTML and API responses**

Change SecurityHeadersMiddleware so /capture/ responses replace Referrer-Policy with no-referrer and add Cache-Control: no-store. Retain private, no-store for all /api/ paths:

~~~python
path = scope.get("path", "")
is_capture_page = path.startswith("/capture/")
if path.startswith("/api/") or is_capture_page:
    replace_header(headers, b"cache-control", b"no-store")
replace_header(
    headers,
    b"referrer-policy",
    b"no-referrer" if is_capture_page else b"strict-origin-when-cross-origin",
)
~~~

Test both the SPA fallback response and API errors.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run:

~~~powershell
python -m pytest backend/tests/test_n8n_site_capture.py backend/tests/test_http_hardening.py backend/tests/test_router_auth.py -q
~~~

Expected: all capture behavior passes and existing router authentication remains unchanged.

- [ ] **Step 9: Commit Task 2**

~~~powershell
git add backend/main.py backend/middleware.py backend/security.py backend/models/capture.py backend/services/site_detail_capture.py backend/routers/n8n_site_capture.py backend/queries/sql_queries.py backend/tests/test_n8n_site_capture.py backend/tests/test_http_hardening.py
git commit -m "feat: expose secure site capture bundle"
~~~

---

### Task 3: Capture-Only Frontend Route Without Session Bootstrap

**Files:**

- Create: frontend/src/__tests__/siteDetailCaptureRuntime.test.js
- Create: frontend/src/__tests__/siteDetailCaptureRouteContracts.test.js
- Create: frontend/src/features/siteCapture/captureRuntime.js
- Create: frontend/src/services/siteDetailCapture.js
- Create: frontend/src/pages/SiteDetailCapturePage.jsx
- Modify: frontend/src/App.jsx:1-185

**Interfaces:**

- Produces normalizeCaptureSiteId(value) -> string.
- Produces consumeFragmentToken(location, history) -> string.
- Produces fetchSiteDetailCapture(siteId, token, signal) -> bundle.
- Adds public shell route /capture/site-detail/:siteId.
- Keeps every dashboard route under AuthProvider and PrivateRoute.
- Forces data-theme=dark for deterministic capture output.
- Exposes data-capture-state=loading|ready|error and data-capture-site-id.

- [ ] **Step 1: Write failing runtime tests**

Test that consumeFragmentToken:

- accepts only one token value from #token=;
- rejects missing, blank, or duplicate token parameters;
- calls history.replaceState with pathname plus search and no hash;
- never returns the fragment in an error message.

Test exact normalization and bundle mismatch:

~~~javascript
assert.equal(normalizeCaptureSiteId(' bgl002 '), 'BGL002');
assert.throws(() => normalizeCaptureSiteId('BGL002/other'), /Invalid Site ID/);
assert.throws(
  () => validateCaptureBundleSite('BGL002', { site_id: 'BGL003' }),
  /Site ID mismatch/,
);
~~~

- [ ] **Step 2: Write failing source-contract tests for route isolation**

Create frontend/src/__tests__/siteDetailCaptureRouteContracts.test.js and assert:

- App imports SiteDetailCapturePage;
- the capture route is defined outside the subtree containing AuthProvider;
- SiteDetailCapturePage does not import services/api.js or useAuth;
- SiteDetailCapturePage forces the document theme to dark before rendering;
- the capture client sends Authorization Bearer, credentials omit, and cache no-store;
- the page has loading and error markers but no ready literal assignment before visual readiness.

- [ ] **Step 3: Run frontend tests and confirm RED**

Run:

~~~powershell
Set-Location frontend
node --test src/__tests__/siteDetailCaptureRuntime.test.js src/__tests__/siteDetailCaptureRouteContracts.test.js
~~~

Expected: imports fail because the capture runtime, service, and page do not exist.

- [ ] **Step 4: Implement token consumption and a standalone capture client**

Create captureRuntime.js without importing the dashboard Axios singleton:

~~~javascript
export function consumeFragmentToken(location = window.location, history = window.history) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tokens = params.getAll('token');
  history.replaceState(null, '', location.pathname + location.search);
  if (tokens.length !== 1 || !tokens[0]) {
    throw new CaptureRouteError('Capture token is missing or invalid');
  }
  return tokens[0];
}
~~~

Create siteDetailCapture.js using native fetch:

~~~javascript
export async function fetchSiteDetailCapture(siteId, token, signal) {
  const response = await fetch(
    '/api/v1/integrations/n8n/site-detail-capture/' + encodeURIComponent(siteId),
    {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      cache: 'no-store',
      signal,
    },
  );
  if (!response.ok) throw CaptureRequestError.fromResponse(response);
  return response.json();
}
~~~

Keep user-visible errors generic. Never include the token, capture URL, response body, or stack trace.

- [ ] **Step 5: Split capture routing from dashboard authentication**

Refactor App.jsx into one top-level Router with:

~~~jsx
<Routes>
  <Route
    path="/capture/site-detail/:siteId"
    element={<SiteDetailCapturePage />}
  />
  <Route
    path="*"
    element={(
      <AuthProvider>
        <DashboardRoutes />
      </AuthProvider>
    )}
  />
</Routes>
~~~

DashboardRoutes retains the existing LoginRoute, PrivateRoute, AppShell, redirects, and every current page route. This is required to avoid the current AuthProvider effect calling authSession() during capture.

- [ ] **Step 6: Add the capture page state machine**

The first implementation may render loading and error states while Task 4 supplies the modal and ready transition:

~~~jsx
<main
  className="site-detail-capture-root"
  data-capture-state={captureState}
  data-capture-site-id={requestedSiteId}
>
  {captureState === 'loading' && <CaptureLoading />}
  {captureState === 'error' && <CaptureError />}
</main>
~~~

Use AbortController cleanup. Normalize the route Site ID before consuming the fragment, consume and clear the token synchronously, force document.documentElement data-theme to dark, fetch once, and reject any payload whose site_id differs from both the route and detail Site ID. Capture and restore the preceding theme value during cleanup so client-side test navigation is deterministic.

- [ ] **Step 7: Run focused and regression tests**

Run:

~~~powershell
Set-Location frontend
node --test src/__tests__/siteDetailCaptureRuntime.test.js src/__tests__/siteDetailCaptureRouteContracts.test.js src/__tests__/authSecurityContracts.test.js
~~~

Expected: all pass, especially the existing cookie-session contract.

- [ ] **Step 8: Commit Task 3**

~~~powershell
git add frontend/src/App.jsx frontend/src/features/siteCapture/captureRuntime.js frontend/src/services/siteDetailCapture.js frontend/src/pages/SiteDetailCapturePage.jsx frontend/src/__tests__/siteDetailCaptureRuntime.test.js frontend/src/__tests__/siteDetailCaptureRouteContracts.test.js
git commit -m "feat: add isolated site capture route"
~~~

---

### Task 4: Full-Height Modal Capture Mode and Deterministic Readiness

**Files:**

- Modify: frontend/src/__tests__/siteDetailCaptureRuntime.test.js
- Modify: frontend/src/__tests__/siteDetailCaptureRouteContracts.test.js
- Modify: frontend/src/__tests__/siteDetailModalContracts.test.js
- Modify: frontend/src/features/siteCapture/captureRuntime.js
- Modify: frontend/src/pages/SiteDetailCapturePage.jsx
- Modify: frontend/src/components/SiteDetailModal.jsx:221-303,408-535
- Modify: frontend/src/index.css:647-670

**Interfaces:**

- Extends SiteDetailModal with captureMode=false.
- Adds data-capture-chart to the TrendCard container.
- Adds data-capture-title to the visible Site ID heading.
- Produces waitForCaptureVisuals(root, dependencies) -> Promise<void>.
- Sets ready only when the requested ID, bundle ID, detail ID, and visible title are identical.

- [ ] **Step 1: Write failing modal capture-mode contracts**

Extend siteDetailModalContracts.test.js to require:

- captureMode defaults false;
- capture-only classes are selected by captureMode;
- normal fixed/centered, max-height, overflow-hidden, internal overflow-y-auto, click-to-close, Escape, focus, and body-lock behavior remain in the non-capture path;
- capture mode does not lock body scroll, auto-focus, or listen for Escape;
- title and chart readiness attributes exist;
- the close button remains visually present but inert only in capture mode, so the screenshot stays visually aligned.

Extend route contracts to require SiteDetailModal receives captureMode and the page state machine contains no path that sets ready after an API error.

- [ ] **Step 2: Write failing readiness behavior tests**

Inject fake fonts, chart rectangles, title text, and requestAnimationFrame into waitForCaptureVisuals(). Cover:

- fonts.ready resolves before readiness;
- every data-capture-chart has width and height greater than zero;
- two animation frames occur after fonts;
- wrong or blank visible Site ID rejects;
- no chart container rejects;
- an AbortSignal stops readiness.

Core contract:

~~~javascript
await waitForCaptureVisuals(root, {
  expectedSiteId: 'BGL002',
  fontsReady: Promise.resolve(),
  nextFrame: async () => frames.push('frame'),
});
assert.deepEqual(frames, ['frame', 'frame']);
~~~

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

~~~powershell
Set-Location frontend
node --test src/__tests__/siteDetailCaptureRuntime.test.js src/__tests__/siteDetailCaptureRouteContracts.test.js src/__tests__/siteDetailModalContracts.test.js
~~~

Expected: captureMode and readiness helpers are missing.

- [ ] **Step 4: Add captureMode without changing normal behavior**

Change the signature:

~~~jsx
export default function SiteDetailModal({
  data,
  trendData = [],
  performanceData = null,
  onClose,
  captureMode = false,
}) {
~~~

Guard interactive effects with captureMode. Add semantic classes rather than replacing existing normal classes:

~~~jsx
<div
  className={
    captureMode
      ? 'site-detail-dialog site-detail-dialog--capture'
      : 'site-detail-dialog fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in'
  }
>
  <div
    className={
      'site-detail-modal relative flex w-full max-w-[1080px] flex-col rounded-[var(--noc-radius-lg)] ' +
      (captureMode
        ? 'site-detail-modal--capture'
        : 'max-h-[calc(100vh-48px)] overflow-hidden animate-fade-in-scale')
    }
  >
~~~

Keep the current normal classes and handlers byte-for-byte where feasible. In capture mode, the close button uses type=button, tabIndex=-1, aria-hidden=true, and no click handler.

- [ ] **Step 5: Add scoped full-height CSS**

Add:

~~~css
.site-detail-capture-root {
  min-height: 100vh;
  padding: 24px;
  background: var(--bg-base);
}

.site-detail-capture-root .site-detail-dialog--capture {
  position: static;
  display: flex;
  justify-content: center;
}

.site-detail-capture-root .site-detail-modal--capture {
  max-height: none;
  height: auto;
  overflow: visible;
}

.site-detail-capture-root .site-detail-scroll {
  flex: none;
  overflow: visible;
  mask-image: none;
  -webkit-mask-image: none;
}

.site-detail-capture-root *,
.site-detail-capture-root *::before,
.site-detail-capture-root *::after {
  animation: none !important;
  transition: none !important;
}
~~~

Do not change the existing unscoped site-detail-scroll fade mask.

- [ ] **Step 6: Implement visual readiness and exact identity checks**

Mark the TrendCard wrapper with data-capture-chart and the h2 with data-capture-title. In captureRuntime.js:

~~~javascript
export async function waitForCaptureVisuals(
  root,
  {
    expectedSiteId,
    fontsReady = document.fonts.ready,
    nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve)),
    signal,
  },
) {
  await fontsReady;
  signal?.throwIfAborted();
  const title = root.querySelector('[data-capture-title]')?.textContent?.trim();
  if (title !== expectedSiteId) throw new CaptureRouteError('Site ID mismatch');
  const charts = [...root.querySelectorAll('[data-capture-chart]')];
  if (!charts.length || charts.some((node) => {
    const box = node.getBoundingClientRect();
    return box.width <= 0 || box.height <= 0;
  })) {
    throw new CaptureRouteError('Capture chart layout is incomplete');
  }
  await nextFrame();
  await nextFrame();
  signal?.throwIfAborted();
}
~~~

In SiteDetailCapturePage, store a rendered state after bundle success, render SiteDetailModal, then call waitForCaptureVisuals from an effect keyed by the exact normalized Site ID. Only that successful continuation may set data-capture-state to ready.

- [ ] **Step 7: Run frontend tests, lint, and build**

Run:

~~~powershell
Set-Location frontend
node --test src/__tests__/siteDetailCaptureRuntime.test.js src/__tests__/siteDetailCaptureRouteContracts.test.js src/__tests__/siteDetailModalContracts.test.js
npm run lint
npm run build
~~~

Expected: tests, lint, and production build pass.

- [ ] **Step 8: Commit Task 4**

~~~powershell
git add frontend/src/components/SiteDetailModal.jsx frontend/src/index.css frontend/src/features/siteCapture/captureRuntime.js frontend/src/pages/SiteDetailCapturePage.jsx frontend/src/__tests__/siteDetailCaptureRuntime.test.js frontend/src/__tests__/siteDetailCaptureRouteContracts.test.js frontend/src/__tests__/siteDetailModalContracts.test.js
git commit -m "feat: render full-height site capture modal"
~~~

---

### Task 5: Importable N8N Capture Tool and Browserless Contract

**Files:**

- Create: backend/tests/test_n8n_site_capture_workflow_contract.py
- Create: n8n/workflows/capture-site-detail.json
- Create: docs/n8n_site_detail_capture.md

**Interfaces:**

- Subworkflow input: site_id string and chat_id string.
- Browserless BrowserQL endpoint: /chromium/bql.
- Browserless output: data.capture.base64 plus modal width and height.
- N8N binary output property: data.
- Telegram filename: site-detail-{SITE_ID}.png.
- Subworkflow success output: sent, site_id, telegram_message_id, elapsed_ms.
- Subworkflow failure output: sent=false, site_id, error_code, elapsed_ms.

- [ ] **Step 1: Write a failing workflow artifact contract test**

The test loads n8n/workflows/capture-site-detail.json and asserts:

- JSON parses and has active set to false;
- Execute Sub-workflow Trigger declares site_id and chat_id;
- Site ID normalization uses the same regex as the backend;
- the mint request uses POST, the exact issuer path, and a generic Header Auth credential;
- capture_url is carried only as workflow data and is never included in logs or captions;
- Browserless uses HTTPS POST to /chromium/bql;
- the BrowserQL mutation calls viewport(1200,1000,deviceScaleFactor:1.5), goto, waitForSelector on the exact ready marker, and screenshot selector .site-detail-modal with PNG and captureBeyondViewport;
- the base64 converter verifies the PNG signature, MIME, width, height, and 50 MB ceiling;
- Telegram uses Send Document, binary property data, deterministic filename, and one upload-only retry;
- the last success node removes binary data;
- no screenshot/base64 field reaches the subworkflow output;
- fatal and retryable error branches are present;
- transient capture has at most one retry;
- auth/scope failure has no retry;
- no credential value is embedded in the JSON.

- [ ] **Step 2: Run the workflow contract test and confirm RED**

Run:

~~~powershell
python -m pytest backend/tests/test_n8n_site_capture_workflow_contract.py -q
~~~

Expected: the workflow artifact does not exist.

- [ ] **Step 3: Build the deterministic input and mint-token nodes**

Create an inactive importable workflow named capture_site_detail. Use:

~~~javascript
const rawSiteId = String($json.site_id || '').trim().toUpperCase();
const chatId = String($json.chat_id || '').trim();
if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(rawSiteId) || !chatId) {
  throw new Error('INVALID_CAPTURE_INPUT');
}
return [{
  json: {
    site_id: rawSiteId,
    chat_id: chatId,
    started_at_ms: Date.now(),
  },
}];
~~~

The token node uses an N8N Generic Credential Type Header Auth named NOD Capture API Key. The tracked workflow contains only the credential reference name, never its value. Configure the header name as X-N8N-Capture-API-Key.

Return full HTTP status from mint requests. Route 401/403 to fatal configuration failure, 404/422 to user-safe invalid/not-found text, and 429/5xx/timeout to one jittered retry.

- [ ] **Step 4: Add the Browserless BrowserQL request**

Use Browserless Header Auth credentials and this mutation:

~~~graphql
mutation CaptureSiteDetail($url: String!, $ready: String!) {
  viewport(width: 1200, height: 1000, deviceScaleFactor: 1.5) {
    width
    height
    deviceScaleFactor
  }
  goto(url: $url, waitUntil: domContentLoaded) {
    status
    time
  }
  ready: waitForSelector(selector: $ready, visible: true, timeout: 12000) {
    selector
    time
  }
  modal: waitForSelector(
    selector: ".site-detail-modal"
    visible: true
    timeout: 1000
  ) {
    width
    height
  }
  capture: screenshot(
    selector: ".site-detail-modal"
    type: png
    captureBeyondViewport: true
    optimizeForSpeed: true
    waitForImages: true
    timeout: 12000
  ) {
    base64
    format
    time
  }
}
~~~

Build the ready variable as:

~~~javascript
'[data-capture-state="ready"][data-capture-site-id="' + siteId + '"]'
~~~

Set a 20-second N8N HTTP timeout. A BrowserQL errors array, 429, timeout, or 5xx is retryable once; 401/403 is fatal and never retried.

- [ ] **Step 5: Validate and convert PNG without involving the AI**

The Code node receives Browserless JSON and produces N8N binary property data:

~~~javascript
const encoded = $json.data?.capture?.base64;
if (typeof encoded !== 'string' || !encoded.length) {
  throw new Error('CAPTURE_PNG_MISSING');
}
const bytes = Buffer.from(encoded, 'base64');
const pngSignature = '89504e470d0a1a0a';
if (bytes.subarray(0, 8).toString('hex') !== pngSignature) {
  throw new Error('CAPTURE_PNG_INVALID');
}
if (bytes.length === 0 || bytes.length > 50 * 1024 * 1024) {
  throw new Error('CAPTURE_PNG_SIZE_INVALID');
}
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
const modal = $json.data.modal;
const scale = 1.5;
if (
  width + 2 < Math.floor(modal.width * scale)
  || height + 2 < Math.floor(modal.height * scale)
) {
  throw new Error('CAPTURE_PNG_CROPPED');
}
return [{
  json: {
    site_id: $('Validate Site ID').first().json.site_id,
    chat_id: $('Validate Site ID').first().json.chat_id,
    started_at_ms: $('Validate Site ID').first().json.started_at_ms,
    png_width: width,
    png_height: height,
  },
  binary: {
    data: {
      data: encoded,
      mimeType: 'image/png',
      fileName: 'site-detail-' + $('Validate Site ID').first().json.site_id + '.png',
    },
  },
}];
~~~

Do not copy encoded into json. Do not enable execution logging of full node payloads in production.

- [ ] **Step 6: Send as Telegram document and return compact status**

Configure Telegram:

- Resource: Message
- Operation: Send Document
- Chat ID: input chat_id
- Binary File: enabled
- Input Binary Field: data
- Caption: Detail Site {SITE_ID} - full capture
- Retry On Fail: enabled
- Max Tries: 2
- Wait Between Tries: 1000 ms

Record safe timing checkpoints before token mint, Browserless, and Telegram upload. The final Code node writes one structured, secret-free server log entry and then returns:

~~~javascript
const metric = {
  event: 'site_detail_capture',
  request_id: $execution.id,
  site_id: $('Validate Site ID').first().json.site_id,
  token_issue_ms: $('Prepare Browserless').first().json.token_issue_ms,
  capture_ready_ms: $('Browserless Capture').first().json.data.ready.time,
  screenshot_ms: $('Browserless Capture').first().json.data.capture.time,
  telegram_upload_ms: Date.now() - $('Prepare Telegram Upload').first().json.telegram_started_at_ms,
  total_ms: Date.now() - $('Validate Site ID').first().json.started_at_ms,
  result: 'sent',
};
console.log(JSON.stringify(metric));
return [{
  json: {
    sent: true,
    site_id: metric.site_id,
    telegram_message_id: $json.result?.message_id ?? $json.message_id,
    elapsed_ms: metric.total_ms,
  },
}];
~~~

Every fatal branch sends a concise Telegram text message, then returns sent=false with an allowlisted error_code. The Telegram upload retry reuses the existing binary and never loops back to Browserless.

- [ ] **Step 7: Document setup and main AI Agent integration**

In docs/n8n_site_detail_capture.md document:

1. Zeabur environment variables and safe generation commands.
2. NOD Capture API Key Header Auth credential.
3. Browserless Authorization Header Auth credential.
4. Telegram bot credential.
5. Workflow import and credential reassignment.
6. Call n8n Workflow Tool input schema with required site_id and chat_id.
7. Deterministic /site SITE_ID parser bypass.
8. N8N execution-data pruning and secret-redaction settings.
9. Browserless region selection nearest Zeabur.
10. Error-code-to-Telegram-message mapping.
11. No-token and no-image logging checklist.
12. Safe structured metric fields and a 20-run p50/p95 collection procedure.

Include the exact tool description:

~~~text
capture_site_detail: Send the complete Site Detail modal for one normalized
Site ID to the originating Telegram chat. Inputs are site_id and chat_id.
The tool itself sends the document; never request or return image bytes.
~~~

- [ ] **Step 8: Run the workflow contract and secret scan**

Run:

~~~powershell
python -m pytest backend/tests/test_n8n_site_capture_workflow_contract.py -q
rg -n "test-only|token=[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9_-]{16,}" n8n docs/n8n_site_detail_capture.md
~~~

Expected: the contract passes. The scan finds only documented field names or URL-shape examples, never a credential or real signed token.

- [ ] **Step 9: Commit Task 5**

~~~powershell
git add backend/tests/test_n8n_site_capture_workflow_contract.py n8n/workflows/capture-site-detail.json docs/n8n_site_detail_capture.md
git commit -m "feat: add n8n browserless capture workflow"
~~~

---

### Task 6: Browser Proof, End-to-End Acceptance, and Repository Verification

**Files:**

- Create: site-detail-capture-playwright.spec.js
- Modify: docs/n8n_site_detail_capture.md

**Interfaces:**

- Proves capture route makes no dashboard-session request.
- Proves one ready marker maps to one exact visible Site ID.
- Proves the modal has no internal scroll boundary or faded bottom.
- Produces local QA screenshots under output/playwright without staging them.
- Records p50, p95, cold-start, retry, PNG size, and PNG dimensions in the runbook.

- [ ] **Step 1: Write the failing browser tests**

Create site-detail-capture-playwright.spec.js. Intercept only the capture bundle API and return a fixture with detail, six trend points, performance, and enough remaining fields to force a tall modal.

Track all requests and assert:

~~~javascript
expect(requestedUrls.some((url) => url.includes('/api/v1/auth/session'))).toBe(false);
await expect(page.locator(
  '[data-capture-state="ready"][data-capture-site-id="BGL002"]'
)).toBeVisible();
await expect(page.locator('[data-capture-title]')).toHaveText('BGL002');
~~~

Assert computed capture styles:

~~~javascript
const layout = await page.locator('.site-detail-modal').evaluate((modal) => {
  const scroll = modal.querySelector('.site-detail-scroll');
  const modalStyle = getComputedStyle(modal);
  const scrollStyle = getComputedStyle(scroll);
  return {
    modalMaxHeight: modalStyle.maxHeight,
    modalOverflow: modalStyle.overflow,
    scrollOverflowY: scrollStyle.overflowY,
    maskImage: scrollStyle.maskImage,
    webkitMaskImage: scrollStyle.webkitMaskImage,
    modalHeight: modal.getBoundingClientRect().height,
    scrollHeight: scroll.scrollHeight,
    scrollClientHeight: scroll.clientHeight,
  };
});
expect(layout.modalMaxHeight).toBe('none');
expect(layout.modalOverflow).toBe('visible');
expect(layout.scrollOverflowY).toBe('visible');
expect(layout.maskImage).not.toContain('gradient');
expect(layout.webkitMaskImage).not.toContain('gradient');
expect(layout.scrollHeight).toBe(layout.scrollClientHeight);
expect(layout.modalHeight).toBeGreaterThan(1000);
~~~

Add error tests for a missing token, 401 bundle response, mismatched payload Site ID, and zero-size chart. None may produce a ready marker.

- [ ] **Step 2: Run the browser tests and confirm RED**

In terminal 1:

~~~powershell
Set-Location frontend
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
~~~

In terminal 2:

~~~powershell
$env:E2E_BASE_URL="http://127.0.0.1:5174"
npx playwright test site-detail-capture-playwright.spec.js --reporter=line --workers=1
~~~

Expected: tests fail until the final route and readiness behavior are complete.

- [ ] **Step 3: Fix only integration defects revealed by the browser test**

Use the systematic debugging sub-skill for any unexpected failure. Keep fixes inside the capture scope, add a focused regression assertion first, and rerun the smallest failing test until green.

- [ ] **Step 4: Capture and inspect the local full-height modal**

Capture the element to output/playwright/site-detail-capture-BGL002.png. Verify:

- title is BGL002;
- the final modal border is visible;
- Periode Data and Kualitas Data are visible near the bottom;
- no scrollbar, top/bottom fade, cropped row, loading skeleton, or animation artifact exists;
- chart labels and modal text remain readable at 100 percent zoom.

Do not stage output/playwright.

- [ ] **Step 5: Run the complete repository verification**

Run:

~~~powershell
Set-Location backend
python -m pytest tests -q
python -m pip_audit -r requirements.lock

Set-Location ..\frontend
npm ci
node --test src/__tests__/*.test.js
npm run lint
npm run audit:production
npm run build

Set-Location ..
$env:E2E_BASE_URL="http://127.0.0.1:5174"
npx playwright test site-detail-capture-playwright.spec.js --reporter=line --workers=1
~~~

Expected: every command exits 0.

- [ ] **Step 6: Run authenticated regression QA**

With the backend and frontend using the exact PUBLIC_APP_ORIGIN, log in normally and open Site Detail from Data Potensi. Verify the normal modal still:

- centers in the viewport;
- scrolls internally;
- keeps its fade mask;
- closes through X, overlay click, and Escape;
- locks and restores body scrolling;
- displays the same charts, groups, and values.

This prevents the public capture route from regressing the interactive modal.

- [ ] **Step 7: Run a deployed Browserless and Telegram acceptance matrix**

After Zeabur receives the new environment variables and build:

1. Typical site.
2. Site with the largest known Data Lainnya section.
3. Site with valid empty trend/performance data.
4. Unknown site.
5. Expired token.
6. One induced transient Browserless failure.
7. One induced Telegram upload retry.

For 20 successful runs, record token_issue_ms, capture_ready_ms, screenshot_ms, telegram_upload_ms, total_ms, PNG bytes, width, height, and cold/warm classification. Calculate p50 and p95. Acceptance requires normal median at or below 8 seconds, normal p95 at or below 15 seconds, and no mismatched/cropped image.

If Browserless or Telegram credentials are unavailable, do not claim external acceptance. Record the exact missing credential or endpoint in the runbook and keep local/API/browser verification results separate.

- [ ] **Step 8: Refresh Graphify and verify the new boundaries**

Run:

~~~powershell
graphify update .
graphify check-update .
rg -n "n8n_site_capture|siteDetailCapture|SiteDetailCapturePage|capture_tokens" graphify-out/graph.json graphify-out/GRAPH_REPORT.md
~~~

Expected: graph state is current and the new backend/frontend capture boundaries appear in graph outputs. Do not stage unrelated .graphify working data.

- [ ] **Step 9: Update evidence and commit Task 6**

Add the measured local results and, when available, deployed Browserless/Telegram results to docs/n8n_site_detail_capture.md. Do not add secrets, capture URLs, or image bytes.

~~~powershell
git add site-detail-capture-playwright.spec.js docs/n8n_site_detail_capture.md graphify-out/graph.json graphify-out/GRAPH_REPORT.md
git diff --cached --check
git commit -m "test: verify full site capture workflow"
~~~

Before committing Graphify outputs, verify they contain only the intended graph refresh and no unrelated tool-generated churn. If they are ignored or unchanged, omit them from git add.

---

## Final Acceptance Checklist

- [ ] Dedicated key is the only credential that can mint a capture token.
- [ ] Token audience, signature, 60-second expiry, and Site ID scope are enforced.
- [ ] Token is removed from the fragment before any data request.
- [ ] Capture route performs no dashboard login or session bootstrap.
- [ ] Bundle is complete or fails; partial data never becomes ready.
- [ ] Visible title, route ID, token claim, response ID, and ready marker match exactly.
- [ ] Fonts, chart dimensions, and two post-layout animation frames precede ready.
- [ ] Modal screenshot includes the final border and every bottom section.
- [ ] PNG signature, MIME, size, and pixel dimensions are validated.
- [ ] Telegram receives the PNG through Send Document with the expected filename.
- [ ] AI Agent receives only compact status JSON.
- [ ] Authentication errors are not retried.
- [ ] Transient capture errors retry at most once.
- [ ] Telegram upload retries without regenerating the PNG.
- [ ] Full backend/frontend CI parity is green.
- [ ] Normal authenticated SiteDetailModal behavior is unchanged.
- [ ] Graphify outputs describe the capture boundaries.
- [ ] External latency is measured rather than inferred when credentials are available.

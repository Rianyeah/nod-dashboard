/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveVantaFogFactory } from '../features/auth/vantaFogRuntime.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');

describe('Vanta fog runtime compatibility', () => {
  it('resolves the Vanta fog factory from supported ESM and UMD wrapper shapes', () => {
    const factory = () => ({ destroy() {} });

    assert.equal(resolveVantaFogFactory(factory), factory);
    assert.equal(resolveVantaFogFactory({ FOG: factory }), factory);
    assert.equal(resolveVantaFogFactory({ default: factory }), factory);
    assert.equal(resolveVantaFogFactory({ default: { FOG: factory } }), factory);
    assert.equal(resolveVantaFogFactory({ default: { default: factory } }), factory);
    assert.equal(resolveVantaFogFactory({ default: {} }), null);
  });
});

describe('cookie session authentication contracts', () => {
  it('never stores or sends a bearer token', () => {
    const api = src('services', 'api.js');
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');

    for (const source of [api, app]) {
      assert.doesNotMatch(source, /nod_auth_token|Authorization\s*=|Bearer /);
    }
    assert.doesNotMatch(api, /interceptors\.request/);
    assert.match(api, /withCredentials:\s*true/);
    assert.match(api, /authSession/);
    assert.match(api, /authLogout/);
    assert.match(auth, /removeItem\('nod_auth_token'\)/);
    assert.match(auth, /removeItem\('nod_last_activity'\)/);
  });

  it('waits for the server session before routing', () => {
    const app = src('App.jsx');
    const auth = src('auth', 'AuthContext.jsx');

    assert.match(app, /status === 'loading'/);
    assert.match(app, /status === 'authenticated'/);
    assert.match(auth, /authSession\(\)/);
    assert.match(auth, /setUnauthorizedHandler/);
  });

  it('uses the shared graphite canvas and one strong authentication panel', () => {
    const login = src('pages', 'LoginPage.jsx');
    const fogPath = resolve(process.cwd(), 'src', 'features', 'auth', 'LoginFogBackground.jsx');

    assert.ok(existsSync(fogPath), 'LoginFogBackground should exist');
    const fog = readFileSync(fogPath, 'utf8');

    assert.match(`${login}\n${fog}`, /dashboard-canvas/);
    assert.match(login, /border-\[var\(--border-strong\)\]/);
    assert.match(login, /bg-\[var\(--bg-glass\)\]/);
    assert.doesNotMatch(login, /border-white|bg-white|hover:bg-white|backdrop-blur|shadow-2xl/);
  });

  it('delivers the NOD login copy, password visibility control, and resilient fog background', () => {
    const login = src('pages', 'LoginPage.jsx');
    const fogPath = resolve(process.cwd(), 'src', 'features', 'auth', 'LoginFogBackground.jsx');

    assert.ok(existsSync(fogPath), 'LoginFogBackground should exist');
    const fog = readFileSync(fogPath, 'utf8');

    assert.match(login, />\s*NOD\s*</);
    assert.match(login, /<h1[\s\S]*?>\s*NOD\s*<\/h1>\s*<p[^>]*>\s*Network Operation Dashboard\s*<\/p>/);
    assert.match(login, /All in one Dashboard ENOM and Tools/);
    assert.doesNotMatch(login, /NOD Dashboard/);
    assert.match(login, /useState\(false\)/);
    assert.match(login, /showPassword\s*\?\s*'text'\s*:\s*'password'/);
    assert.match(login, /value=\{password\}/);
    assert.match(login, /onChange=\{\(event\) => setPassword\(event\.target\.value\)\}/);
    assert.match(login, /pr-11/);
    assert.match(login, /<button\s+type="button"\s+onClick=\{\(\) => setShowPassword/);
    assert.match(login, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
    assert.match(login, /aria-pressed=\{showPassword\}/);
    assert.match(login, /showPassword \? <EyeOff[^>]*\/> : <Eye[^>]*\/>/);
    assert.match(login, /focus-visible:ring/);
    assert.match(login, /<form onSubmit=\{handleLogin\}/);
    assert.match(login, /await login\(username, password\)/);
    assert.match(login, /setIsLoading\(true\)/);
    assert.match(login, /setError\('Invalid username or password\.'\)/);
    assert.match(login, /toggleTheme/);
    assert.match(login, /relative flex min-h-\[100dvh\] items-center justify-center p-4/);
    assert.match(login, /dashboard-control absolute right-4 top-4/);
    assert.match(fog, /import\('three'\)/);
    assert.match(fog, /import\('vanta\/dist\/vanta\.fog\.min\.js'\)/);
    assert.match(fog, /VANTA_FOG_OPTIONS/);
    assert.match(fog, /midtoneColor:\s*0xe60013/);
    assert.match(fog, /backgroundAlpha:\s*1/);
    assert.match(fog, /blurFactor:\s*\.64/);
    assert.match(fog, /speed:\s*2\.6/);
    assert.match(fog, /zoom:\s*1\.3/);
    assert.match(fog, /mouseControls:\s*true/);
    assert.match(fog, /touchControls:\s*true/);
    assert.match(fog, /gyroControls:\s*false/);
    assert.match(fog, /minHeight:\s*200/);
    assert.match(fog, /minWidth:\s*200/);
    assert.match(fog, /highlightColor:\s*0x000000/);
    assert.match(fog, /lowlightColor:\s*0x000000/);
    assert.match(fog, /baseColor:\s*0x000000/);
    assert.match(fog, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
    assert.match(fog, /if \(prefersReducedMotion\) return undefined/);
    assert.match(fog, /catch \{\s*\/\/ The static graphite-red treatment/);
    assert.match(fog, /vantaEffect\?\.destroy\?\.\(\)/);
    assert.match(fog, /resolveVantaFogFactory\(vantaModule\)/);
    assert.doesNotMatch(fog, /window\.THREE/);
    assert.match(fog, /min-h-\[100dvh\]/);
    assert.match(fog, /data-testid="login-fog-background"/);
    assert.match(fog, /style=\{\{[\s\S]*backgroundColor:\s*'#090B0F'/);
    assert.match(fog, /backgroundImage:\s*'radial-gradient\(circle at 50% 35%, rgba\(230, 0, 19, 0\.22\), transparent 52%\)'/);
    assert.match(fog, /radial-gradient\(ellipse at center, rgba\(9, 11, 15, 0\.02\) 0%, rgba\(9, 11, 15, 0\.08\) 58%, rgba\(0, 0, 0, 0\.42\) 100%\)/);
  });

  it('pins Three.js to the Vanta-compatible r134 release', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    assert.equal(packageJson.dependencies.three, '0.134.0');
  });
});

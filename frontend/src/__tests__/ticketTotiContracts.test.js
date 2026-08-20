/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = (...parts) => resolve(process.cwd(), 'src', ...parts);
const source = (...parts) => readFileSync(sourcePath(...parts), 'utf8');

describe('Ticket TOTI route contracts', () => {
  it('registers the authenticated lazy route and shared Ticketing tabs', () => {
    const navPath = sourcePath('components', 'TicketingSectionNav.jsx');
    const pagePath = sourcePath('pages', 'TicketTotiPage.jsx');

    assert.equal(existsSync(navPath), true, 'shared Ticketing navigation must exist');
    assert.equal(existsSync(pagePath), true, 'Ticket TOTI route page must exist');

    const app = source('App.jsx');
    const nav = readFileSync(navPath, 'utf8');
    const ticketingPage = source('pages', 'TicketingPage.jsx');
    const totiPage = readFileSync(pagePath, 'utf8');

    assert.match(app, /React\.lazy\(\(\) => import\('\.\/pages\/TicketTotiPage'\)\)/);
    assert.match(app, /path="\/ticketing\/toti"/);
    assert.match(app, /<TicketTotiPage\s*\/>/);
    assert.match(nav, /to: '\/ticketing'/);
    assert.match(nav, /to: '\/ticketing\/toti'/);
    assert.match(nav, /to=\{item\.to\}/);
    assert.match(nav, /Fault Center/);
    assert.match(nav, /Ticket TOTI/);
    assert.match(nav, /aria-current/);
    assert.match(ticketingPage, /<TicketingSectionNav\s*\/>/);
    assert.match(totiPage, /<TicketingSectionNav\s*\/>/);
  });

  it('keeps nested TOTI navigation in the Ticketing product context', () => {
    const breadcrumb = source('components', 'Breadcrumb.jsx');
    const sidebar = source('components', 'DashboardSidebar.jsx');

    assert.match(breadcrumb, /toti:\s*'Ticket TOTI'/);
    assert.match(sidebar, /to: '\/ticketing', label: 'Ticketing'/);
    assert.doesNotMatch(sidebar, /to: '\/ticketing\/toti'/);
  });

  it('exposes focused Ticket TOTI API functions', () => {
    const api = source('services', 'api.js');

    assert.match(api, /export async function fetchTicketTotiFilters/);
    assert.match(api, /api\.get\('\/ticketing\/toti\/filters'/);
    assert.match(api, /export async function fetchTicketTotiDashboard/);
    assert.match(api, /api\.get\('\/ticketing\/toti\/dashboard'/);
    assert.match(api, /export async function fetchTicketTotiTickets/);
    assert.match(api, /api\.get\('\/ticketing\/toti\/tickets'/);
  });

  it('renders Manual Takeover percentage first with ticket comparison beneath it', () => {
    const page = source('pages', 'TicketingPage.jsx');
    const cardStart = page.indexOf('title="Manual Takeover"');
    const card = page.slice(cardStart, cardStart + 500);

    assert.ok(cardStart >= 0, 'Manual Takeover scorecard must remain visible');
    assert.match(card, /value=\{formatPercent\(summary\?\.manual_takeover_rate\)\}/);
    assert.match(card, /manual_takeover_tickets/);
    assert.match(card, /summary\?\.total_tickets/);
    assert.match(card, /dari/);
    assert.match(card, /ticket/);
  });
});

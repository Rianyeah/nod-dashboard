/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('Ticketing dashboard contracts', () => {
  it('wires the route, navigation, breadcrumb label, and API functions', () => {
    const app = src('App.jsx');
    const header = src('components', 'Header.jsx');
    const breadcrumb = src('components', 'Breadcrumb.jsx');
    const api = src('services', 'api.js');
    const pagePath = srcPath('pages', 'TicketingPage.jsx');

    assert.equal(existsSync(pagePath), true);
    assert.match(app, /TicketingPage/);
    assert.match(app, /path="\/ticketing"/);
    assert.match(header, /to="\/ticketing"/);
    assert.match(header, /Ticketing/);
    assert.match(breadcrumb, /'ticketing': 'Ticketing'/);

    for (const fn of [
      'fetchTicketingFilters',
      'fetchTicketingDashboard',
      'fetchTicketingTickets',
      'fetchTicketingTicketDetail',
    ]) {
      assert.match(api, new RegExp(`export async function ${fn}`));
    }

    assert.match(api, /\/ticketing\/filters/);
    assert.match(api, /\/ticketing\/dashboard/);
    assert.match(api, /\/ticketing\/tickets/);
    assert.match(api, /Date\.now\(\)/);
    assert.match(api, /Cache-Control': 'no-cache'/);
  });

  it('renders the required Ticketing dashboard sections and filters', () => {
    const pagePath = srcPath('pages', 'TicketingPage.jsx');
    assert.equal(existsSync(pagePath), true);
    const page = readFileSync(pagePath, 'utf8');

    for (const label of [
      'Ticketing',
      'Ticket Fault Center',
      'Date Range',
      'Tahun / Bulan',
      'Cluster TO',
      'Kategori Ticket',
      'SLA Status',
      'Ticket Status',
      'Backup Sukses',
      'RC Category',
      'Is Escalate',
      'Total Tickets',
      'Ticket Category',
      'BPS',
      'TS',
      'OUT SLA Rate',
      'Visitation Rate',
      'Backup Sukses Rate',
      'Escalated',
      'Daily Trend Ticket by Kategori',
      'SLA Status Distribution',
      'Visiting Site vs Backup Genset',
      'Kabupaten/Kota Distribution',
      'RC Category Pareto',
      'Top Problem Sites',
      'Ticket List',
    ]) {
      assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.doesNotMatch(page, /Scorecard title="Median MTTR"/);
    assert.match(page, /summary\?\.visitation_rate/);
    assert.match(page, /summary\?\.visitation_tickets/);

    for (const id of [
      'ticketing-start-date',
      'ticketing-end-date',
      'ticketing-year',
      'ticketing-month',
      'ticketing-nop',
      'ticketing-cluster',
      'ticketing-category',
      'ticketing-sla',
      'ticketing-status',
      'ticketing-backup',
      'ticketing-rc-category',
      'ticketing-escalate',
    ]) {
      assert.match(page, new RegExp(`id="${id}"`));
    }
  });

  it('keeps fixed Kabupaten/Kota breakdown, table drilldown, and chart primitives visible', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.match(page, /Kabupaten\/Kota Distribution/);
    assert.doesNotMatch(page, /NOP Distribution/);
    assert.doesNotMatch(page, /Ticket Status Distribution/);
    assert.match(page, /visiting_backup_distribution/);
    assert.match(page, /visiting_site/);
    assert.match(page, /backup_genset/);
    assert.match(page, /ticket_number_swfm/);
    assert.match(page, /setSelectedTicket/);
    assert.match(page, /fetchTicketingTicketDetail\(selectedTicket/);
    assert.match(page, /ResponsiveContainer/);
    assert.match(page, /BarChart/);
    assert.match(page, /LineChart/);
    assert.match(page, /<Line /);
  });

  it('uses compact chart heights for the revised dashboard layout', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.match(page, /height=\{220\}/);
    assert.doesNotMatch(page, /height=\{280\}/);
    assert.ok(page.includes('xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)_minmax(280px,0.65fr)]'));
    assert.match(page, /xl:grid-cols-2/);
  });

  it('keeps Ticketing page free from static sidebar shell and uses backend default date range', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.doesNotMatch(page, /function TicketingSidebar/);
    assert.doesNotMatch(page, /SIDEBAR_ITEMS/);
    assert.doesNotMatch(page, /NavLink/);
    assert.match(page, /default_start_date/);
    assert.match(page, /default_end_date/);
  });

  it('supports collapsing global filters and refresh retries filter loading', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.match(page, /filtersCollapsed/);
    assert.match(page, /setFiltersCollapsed/);
    assert.match(page, /aria-expanded={!filtersCollapsed}/);
    assert.match(page, /Collapse Filter/);
    assert.match(page, /Show Filter/);
    assert.match(page, /loadFilterOptions/);
    assert.match(page, /handleRefresh/);
  });
});

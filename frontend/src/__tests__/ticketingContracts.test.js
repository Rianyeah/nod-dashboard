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
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const breadcrumb = src('components', 'Breadcrumb.jsx');
    const api = src('services', 'api.js');
    const pagePath = srcPath('pages', 'TicketingPage.jsx');

    assert.equal(existsSync(pagePath), true);
    assert.match(app, /TicketingPage/);
    assert.match(app, /path="\/ticketing"/);
    assert.match(sidebar, /to: '\/ticketing'/);
    assert.match(sidebar, /Ticketing/);
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
    const charts = src('features', 'ticketing', 'TicketingCharts.jsx');
    const feature = `${page}\n${charts}`;

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
      assert.match(feature, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
      assert.match(page, new RegExp(id));
    }
  });

  it('keeps fixed Kabupaten/Kota breakdown, table drilldown, and chart primitives visible', () => {
    const page = src('pages', 'TicketingPage.jsx');
    const charts = src('features', 'ticketing', 'TicketingCharts.jsx');
    const feature = `${page}\n${charts}`;

    assert.match(feature, /Kabupaten\/Kota Distribution/);
    assert.doesNotMatch(feature, /NOP Distribution/);
    assert.doesNotMatch(feature, /Ticket Status Distribution/);
    assert.match(charts, /visiting_backup_distribution/);
    assert.match(charts, /visiting_site/);
    assert.match(charts, /backup_genset/);
    assert.match(page, /ticket_number_swfm/);
    assert.match(page, /setSelectedTicket/);
    assert.match(page, /fetchTicketingTicketDetail\(selectedTicket/);
    assert.match(page, /TicketingCharts/);
    assert.doesNotMatch(page, /ResponsiveContainer/);
    assert.match(charts, /ChartContainer/g);
    assert.match(charts, /BarChart/);
    assert.match(charts, /LineChart/);
    assert.match(charts, /<Line /);
    assert.match(charts, /DashboardChartTooltipContent/);
    assert.match(charts, /accessibilityLayer/g);
  });

  it('shows Ticketing MoM/category percentages, SLA pie hover, and help hints', () => {
    const page = src('pages', 'TicketingPage.jsx');
    const charts = src('features', 'ticketing', 'TicketingCharts.jsx');
    const feature = `${page}\n${charts}`;

    assert.match(page, /total_tickets_mom_delta/);
    assert.match(page, /total_tickets_mom_rate/);
    assert.match(page, /formatTicketMoM/);
    assert.match(page, /categoryShare/);
    assert.match(page, /BPS \$\{categoryShare/);
    assert.match(page, /TS \$\{categoryShare/);
    assert.match(charts, /PieChart/);
    assert.match(charts, /dataKey="tickets"/);
    assert.match(charts, /nameKey="label"/);
    assert.match(charts, /DonutCenterLabel/);
    assert.match(charts, /getSlaStatusColor/);
    assert.match(charts, /activeSlaIndex/);
    assert.match(charts, /activeShape=\{renderActivePieShape\}/);
    assert.match(feature, /HelpCircle/);
    assert.match(page, /Response P90 menghitung persentil ke-90/);
    assert.match(charts, /Pareto menampilkan kontribusi kumulatif/);
    assert.match(charts, /ComposedChart/);
    assert.match(charts, /dataKey="cumulative_rate"/);
    assert.match(charts, /yAxisId="percentage"/);
    assert.match(charts, /domain=\{\[0,\s*100\]\}/);
  });

  it('uses compact chart heights for the revised dashboard layout', () => {
    const charts = src('features', 'ticketing', 'TicketingCharts.jsx');

    assert.match(charts, /h-\[220px\]/);
    assert.doesNotMatch(charts, /h-\[280px\]/);
    assert.ok(charts.includes('xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)_minmax(280px,0.65fr)]'));
    assert.match(charts, /xl:grid-cols-2/);
  });

  it('keeps Ticketing page free from static sidebar shell and uses backend default date range', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.doesNotMatch(page, /function TicketingSidebar/);
    assert.doesNotMatch(page, /SIDEBAR_ITEMS/);
    assert.doesNotMatch(page, /NavLink/);
    assert.match(page, /default_start_date/);
    assert.match(page, /default_end_date/);
  });

  it('uses adaptive shadcn filters and refresh retries filter loading', () => {
    const page = src('pages', 'TicketingPage.jsx');
    const header = page.split('</header>', 1)[0];

    for (const component of [
      'DashboardFilterBar',
      'DashboardDateRangePicker',
      'DashboardCombobox',
      'DashboardFilterPopover',
      'DashboardFilterChips',
      'DashboardFilterSelect',
      'DashboardSearchInput',
      'DashboardTableToolbar',
      'DashboardPagination',
    ]) {
      assert.match(page, new RegExp(component));
    }
    assert.match(header, /DashboardFilterBar/);
    assert.match(header, /DashboardFilterPopover/);
    assert.match(header, /lg:flex-nowrap/);
    assert.doesNotMatch(page, /DashboardFilterSheet/);
    assert.match(page, /useDebouncedValue\(search,\s*300\)/);
    assert.doesNotMatch(page, /function SelectFilter/);
    assert.doesNotMatch(page, /function DateFilter/);
    assert.doesNotMatch(page, /filtersCollapsed/);
    assert.doesNotMatch(page, /type="date"/);
    assert.doesNotMatch(page, /<select/);
    assert.match(page, /loadFilterOptions/);
    assert.match(page, /handleRefresh/);
  });

  it('isolates ticket search and pagination from dashboard requests', () => {
    const page = src('pages', 'TicketingPage.jsx');

    assert.match(page, /const dashboardParams = useMemo/);
    assert.match(page, /const tableParams = useMemo/);
    assert.match(page, /dashboardLoading/);
    assert.match(page, /tableLoading/);
    assert.match(page, /fetchTicketingTickets\(tableParams\)/);
    assert.match(page, /resetTableFilters/);
    assert.match(page, /Reset tabel/);

    const dashboardRequestBlock = page.split('fetchTicketingDashboard(dashboardParams)', 2)[0];
    assert.doesNotMatch(dashboardRequestBlock.slice(-500), /fetchTicketingTickets/);
  });
});

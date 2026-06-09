/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('new home page command center contracts', () => {
  it('wires home and site-map routes with dashboard compatibility redirect', () => {
    const app = src('App.jsx');

    assert.equal(existsSync(srcPath('pages', 'HomePage.jsx')), true);
    assert.equal(existsSync(srcPath('pages', 'SiteMapPage.jsx')), true);
    assert.match(app, /HomePage/);
    assert.match(app, /SiteMapPage/);
    assert.match(app, /path="\/home"/);
    assert.match(app, /path="\/site-map"/);
    assert.match(app, /path="\/dashboard"[\s\S]*<Navigate to="\/site-map"/);
    assert.match(app, /path="\/"[\s\S]*<Navigate to="\/home"/);
  });

  it('moves page navigation and logout into a collapsible sidebar shell', () => {
    const app = src('App.jsx');
    const sidebar = src('components', 'DashboardSidebar.jsx');
    const header = src('components', 'Header.jsx');

    assert.match(app, /AppShell/);
    assert.match(sidebar, /aria-label="Collapse sidebar"/);
    assert.match(sidebar, /Last data update/);
    assert.match(sidebar, /authLogout/);

    for (const route of ['/home', '/site-map', '/reporting', '/impact-service', '/transport-quality', '/ticketing']) {
      assert.match(sidebar, new RegExp(`to: '${route}'`));
      assert.doesNotMatch(header, new RegExp(`to="${route}"`));
    }

    assert.match(sidebar, /Logout/);
    assert.doesNotMatch(header, /id="header-logout"/);
  });

  it('keeps breadcrumbs, login redirect, and sub-page back links aligned to home', () => {
    const breadcrumb = src('components', 'Breadcrumb.jsx');
    const login = src('pages', 'LoginPage.jsx');

    assert.match(breadcrumb, /home: 'Home'/);
    assert.match(breadcrumb, /'site-map': 'Site Map'/);
    assert.match(breadcrumb, /to="\/home"/);
    assert.match(login, /navigate\('\/home'/);

    for (const pageName of [
      'NetworkReportingPage.jsx',
      'ImpactServicePage.jsx',
      'TransportQualityPage.jsx',
      'TicketingPage.jsx',
    ]) {
      const page = src('pages', pageName);
      assert.match(page, /navigate\('\/home'\)/, `${pageName} must navigate back to /home`);
      assert.doesNotMatch(page, /navigate\('\/dashboard'\)/, `${pageName} must not navigate back to /dashboard`);
    }
  });

  it('renders the revised command center scorecards and executive insight', () => {
    const api = src('services', 'api.js');
    assert.equal(existsSync(srcPath('pages', 'HomePage.jsx')), true);
    const page = src('pages', 'HomePage.jsx');

    assert.match(api, /export async function fetchOverview/);
    assert.match(api, /\/overview/);
    assert.match(page, /fetchOverview/);
    assert.match(page, /fetchImpactServiceFilters/);
    assert.match(page, /fetchTicketingFilters/);
    assert.match(page, /fetchTransportQualityFilters/);
    assert.match(page, /mergeNopOptions/);
    assert.match(page, /normalizeNopOption/);
    assert.match(page, /\^NOP\\s\+/);
    assert.match(page, /new Map\(\)/);

    for (const label of [
      'Command Center',
      'Total Sites',
      'Network Availability',
      'Revenue',
      'Payload',
      'Ticket Fault Center',
      'Today Impact Service',
      'Impact Service',
      'Transport Quality',
      'Data Potensi Site',
      'Site Lithium',
      'Site VRLA',
      'ENVA Validated',
      'Radio IP',
      'Class Site',
      'Performance Trend',
      'Executive Insight',
      'Module Overview',
      'Worst Sites',
      'Priority Signals',
    ]) {
      assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const removedLabel of [
      'NOD Command Center',
      'Site Map Preview',
      'Active Alarms',
      'P1 Transport',
      'Open Tickets',
      'Snapshot',
      'Health Status',
    ]) {
      assert.doesNotMatch(page, new RegExp(removedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(page, /impact_daily_trend/);
    assert.match(page, /BPS:/);
    assert.match(page, /TS:/);
    assert.match(page, /Last data/);
    assert.match(page, /site_potential/);
    assert.match(page, /PotentialItem/);
    assert.match(page, /ClassBreakdownLegend/);

    const impactIndex = page.indexOf("title: 'Today Impact Service'");
    const transportIndex = page.indexOf("title: 'Transport Quality'");
    assert.ok(impactIndex > -1, 'Today Impact Service scorecard must exist');
    assert.ok(transportIndex > impactIndex, 'Transport Quality scorecard must be placed after Today Impact Service');
  });

  it('defaults Home NOP to SIDOARJO and uses requested MoM and latest impact subtitles', () => {
    const page = src('pages', 'HomePage.jsx');

    assert.match(page, /HOME_DEFAULT_NOP\s*=\s*'SIDOARJO'/);
    assert.match(page, /setNop\(HOME_DEFAULT_NOP\)/);
    assert.match(page, /const availabilityDelta/);
    assert.match(page, /const payloadDelta/);
    assert.match(page, /title: 'Network Availability'[\s\S]*subtitle:\s*`\$\{formatSignedPercent\(availabilityDelta\)\} MoM`/);
    assert.match(page, /title: 'Payload'[\s\S]*subtitle:\s*`\$\{formatSignedPercent\(payloadDelta\)\} MoM`/);
    assert.match(page, /title: 'Today Impact Service'[\s\S]*subtitle:\s*`Open: \$\{formatNumber\(latestImpactDaily\?\.open/);
    assert.doesNotMatch(page, /critical sites`/);
    assert.doesNotMatch(page, /subtitle: 'total data usage'/);
  });

  it('uses meaningful data charts in each module overview card', () => {
    const page = src('pages', 'HomePage.jsx');

    assert.match(page, /ResponsiveContainer/);
    assert.match(page, /ComposedChart/);
    assert.doesNotMatch(page, /function MiniTrendBars/);
    assert.doesNotMatch(page, /function SeverityMiniBar/);

    for (const chartContract of [
      'ReportingMiniChart',
      'ImpactServiceDailyChart',
      'TransportQualityMiniChart',
      'TicketFaultCenterMiniChart',
      'total_revenue',
      'total_payload',
      'open',
      'clear',
      'p1_sites',
      'pl_over_1_sites',
      'bps',
      'ts',
    ]) {
      assert.match(page, new RegExp(chartContract));
    }
  });

  it('keeps worst availability and worst revenue top-10 lists on the home surface', () => {
    const page = src('pages', 'HomePage.jsx');

    assert.match(page, /Top 10 Worst Availability/);
    assert.match(page, /Top 10 Worst Revenue/);
    assert.match(page, /worst_revenue_sites/);
    assert.match(page, /mom_percentage/);
    assert.match(page, /MoM/);
    assert.match(page, /\.slice\(0,\s*10\)/);
    assert.match(page, /formatRevenue/);
    assert.match(page, /formatOutageHours/);
    assert.match(page, /jumlah_cell/);
  });

  it('uses dynamic Home performance domains and priority signal ordering', () => {
    const page = src('pages', 'HomePage.jsx');

    assert.match(page, /homeRevenueDomain/);
    assert.match(page, /homePayloadDomain/);
    assert.match(page, /homeAvailabilityDomain/);
    assert.match(page, /function buildAvailabilityDomain/);
    assert.match(page, /buildAvailabilityDomain\(trendRows\)/);
    assert.match(page, /domain=\{homeRevenueDomain\}/);
    assert.match(page, /domain=\{homePayloadDomain\}/);
    assert.match(page, /domain=\{homeAvailabilityDomain\}/);
    assert.match(page, /yAxisId="availability"[\s\S]*tickCount=\{5\}/);
    assert.match(page, /PRIORITY_TONE_RANK/);
    assert.match(page, /\.sort\(\(a,\s*b\) => PRIORITY_TONE_RANK/);
    assert.match(page, /buildPrioritySignals\(overview,\s*latestImpactDaily\)/);
    assert.match(page, /transport_priority_sites\?\.items/);
    assert.match(page, /ticketing\?\.top_sites/);
    assert.doesNotMatch(page, /transportPriority\.slice\(0,\s*2\)\.map/);
    assert.doesNotMatch(page, /ticketingTopSites\.slice\(0,\s*2\)\.map/);
    assert.match(page, /xl:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(300px,0\.55fr\)\]/);
    assert.match(page, /grid grid-cols-1 gap-2 p-3/);
  });

  it('uses latest daily Impact Service data in priority signals and executive insight', () => {
    const page = src('pages', 'HomePage.jsx');
    const executiveInsight = page.split('function ExecutiveInsightPanel', 2)[1].split('function buildPrioritySignals', 1)[0];
    const prioritySignals = page.split('function buildPrioritySignals', 2)[1].split('export default function HomePage', 1)[0];

    assert.match(page, /latestImpactDaily=\{latestImpactDaily\}/);
    assert.match(executiveInsight, /latestImpactDaily\?\.total/);
    assert.match(executiveInsight, /latestImpactDaily\?\.open/);
    assert.match(executiveInsight, /latestImpactDaily\?\.clear/);
    assert.match(executiveInsight, /latestImpactDaily\?\.tanggal/);
    assert.match(prioritySignals, /latestImpactDaily\?\.open/);
    assert.match(prioritySignals, /latestImpactDaily\?\.tanggal/);
  });

  it('removes the Site Map worst-sites sidebar and keeps noisy modal fields hidden', () => {
    const siteMap = src('pages', 'SiteMapPage.jsx');
    const modal = src('components', 'SiteDetailModal.jsx');
    const infoSiteGroup = modal.split("title: 'Info Site'", 2)[1].split("title: 'Teknologi'", 1)[0];

    assert.doesNotMatch(siteMap, /import WorstSitesPanel/);
    assert.doesNotMatch(siteMap, /<WorstSitesPanel/);
    assert.match(infoSiteGroup, /OA Date/);
    assert.match(modal, /'row_number'/);
    assert.match(modal, /'Cek'/);
    assert.doesNotMatch(modal, /<InfoRow label="Cek"/);
  });

  it('keeps chart and detail links available from the home surface', () => {
    const page = src('pages', 'HomePage.jsx');

    assert.match(page, /Link to="\/site-map"/);
    assert.match(page, /Link to="\/reporting"/);
    assert.match(page, /Link to="\/impact-service"/);
    assert.match(page, /Link to="\/transport-quality"/);
    assert.match(page, /Link to="\/ticketing"/);
  });
});

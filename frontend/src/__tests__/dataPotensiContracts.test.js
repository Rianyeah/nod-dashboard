/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = (...parts) => resolve(process.cwd(), ...parts);
const src = (...parts) => readFileSync(root('src', ...parts), 'utf8');

describe('Data Potensi dashboard contracts', () => {
  it('extracts an Impact Service style shadcn site table', () => {
    const tablePath = root('src', 'features', 'data-potensi', 'DataPotensiSiteTable.jsx');
    assert.equal(existsSync(tablePath), true);
    const table = readFileSync(tablePath, 'utf8');
    const dashboardFilters = src('components', 'dashboard-filters', 'DashboardFilters.jsx');

    for (const contract of [
      'DashboardTableToolbar',
      'DashboardSearchInput',
      'DashboardFilterPopover',
      'DashboardFilterChips',
      'DashboardPagination',
      'TableHeader',
      'TableBody',
      'Skeleton',
      'Empty',
      'Tooltip',
      'aria-sort',
      'onSortChange',
      'onResetTable',
      'onSelectSite',
    ]) {
      assert.match(table, new RegExp(contract));
    }

    assert.match(table, /Filter lanjutan/);
    assert.match(table + dashboardFilters, /Bersihkan/);
    assert.match(table, /\? 'Tidak ada'/);
    assert.match(table, /tabIndex=\{0\}/);
    assert.match(table, /event\.key === 'Enter' \|\| event\.key === ' '/);
    assert.match(table, /event\.preventDefault\(\)/);
    assert.doesNotMatch(table, /group-hover:block/);
  });

  it('applies advanced filters to dashboard and table requests', () => {
    const page = src('pages', 'DataPotensiPage.jsx');
    const api = src('services', 'api.js');

    for (const contract of [
      'advancedFilters',
      'dashboardParams',
      'tableParams',
      'fetchDataPotensiFilterOptions',
      'useDeferredValue',
      'sort_by: sortBy',
      'sort_dir: sortDir',
      'cluster: advancedFilters.cluster',
      'kabupaten: advancedFilters.kabupaten',
      'site_class: advancedFilters.site_class',
      'type_site: advancedFilters.type_site',
      'transport_type: advancedFilters.transport_type',
      'type_battery: advancedFilters.type_battery',
      'tp: advancedFilters.tp',
      'bblti_software',
    ]) {
      assert.match(page + api, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(api, /\/data-potensi\/filter-options/);
    assert.doesNotMatch(page, /displaySites/);
    assert.doesNotMatch(page, /chipOptions/);
  });

  it('resets pagination for every filter, search, and sort change', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    for (const handler of [
      'handleNopChange',
      'handleStatusChange',
      'handleAdvancedFiltersApply',
      'handleSearchChange',
      'handleSortChange',
      'handleResetTable',
    ]) {
      const section = page.split(`const ${handler}`, 2)[1]?.split('}, [', 1)[0]
        || page.split(`const ${handler}`, 2)[1]?.split('}, []', 1)[0]
        || '';
      assert.match(section, /setPage\(1\)/, handler);
    }
  });

  it('uses responsive KPI layout and explicit loading/error states', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    assert.match(page, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6/);
    assert.match(page, /InsideBarValueLabel/);
    assert.match(page, /dataKey=\{cat\}/);
    assert.match(page, /Alert/);
    assert.match(page, /Skeleton/);
    assert.match(page, /dashboardError/);
    assert.match(page, /tableError/);
    assert.doesNotMatch(page, /useDashboardThemeTokens/);
  });

  it('opens a valid Site Map handoff once without weakening site-id validation', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    assert.match(page, /useSearchParams/);
    assert.match(page, /normalizedDeepLinkSite/);
    assert.match(page, /lastDeepLinkedSiteRef/);
    assert.match(page, /handleSiteClick\(deepLinkedSite\)/);
  });

  it('uses the graphite Data Potensi chart language', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    assert.doesNotMatch(page, /text-cyan-|bg-cyan-|border-cyan-|#22D3EE|#0EA5E9|#38BDF8/i);
    assert.doesNotMatch(page, /shadow-\[0_0_|blur-sm/);
    assert.match(page, /DashboardChartPanel|DashboardTableShell/);
    assert.match(page, /dataPotensiChartConfig/);
  });

  it('places the insight carousel beside Tower Provider before the Kabupaten breakdown', () => {
    const page = src('pages', 'DataPotensiPage.jsx');

    assert.match(page, /readiness_by_kabupaten/);
    assert.match(page, /transport_configuration_matrix/);
    assert.match(page, /cell_distribution_by_kabupaten/);
    assert.match(page, /DataPotensiInsightCarousel/);
    assert.match(page, /cellDistributionData=/);
    assert.ok(
      page.indexOf('<DataPotensiInsightCarousel') < page.indexOf('<TpDistributionChart'),
      'insight carousel must occupy the left column beside Tower Provider',
    );
    assert.ok(
      page.indexOf('<TpDistributionChart') < page.indexOf('<StackedBarSection'),
      'Tower Provider must move into the matrix row before Breakdown by Kabupaten',
    );
    assert.match(page, /grid grid-cols-1 gap-3 xl:grid-cols-2/);
    assert.doesNotMatch(page, /import DataPotensiMatrixCharts from/);
  });

  it('prepares three content-only matrices for carousel composition', () => {
    const charts = src('features', 'data-potensi', 'DataPotensiMatrixCharts.jsx');
    const utils = src('features', 'data-potensi', 'dataPotensiMatrixUtils.js');
    const combined = `${charts}\n${utils}`;

    assert.match(charts, /export function CellDistributionHeatmap/);
    assert.match(charts, /Cell Distribution Heatmap per Kabupaten/);
    assert.match(charts, /buildCellDistributionMatrix/);
    assert.match(charts, /data-carousel-scroll-region/);
    assert.doesNotMatch(charts, /Persentase site siap per Kabupaten berdasarkan status monitoring/);
    assert.doesNotMatch(charts, /Jumlah site untuk kombinasi Transport Type, Modem, dan Jumper/);
    assert.doesNotMatch(charts, /<DashboardChartPanel/);

    for (const label of [
      'GSM900',
      'DCS1800',
      'L900',
      'L1800',
      'L2100',
      'L2300',
      'LTE NB-IoT',
      'NR2100',
      'NR2300',
    ]) {
      assert.match(combined, new RegExp(label));
    }
  });

  it('composes the three matrices in a controlled shadcn carousel', () => {
    const primitivePath = root('src', 'components', 'ui', 'carousel.jsx');
    const carouselPath = root('src', 'features', 'data-potensi', 'DataPotensiInsightCarousel.jsx');

    assert.equal(existsSync(primitivePath), true);
    assert.equal(existsSync(carouselPath), true);

    const primitive = readFileSync(primitivePath, 'utf8');
    const carousel = readFileSync(carouselPath, 'utf8');

    assert.match(primitive, /useEmblaCarousel/);
    assert.match(carousel, /CarouselContent/);
    assert.match(carousel, /CarouselItem/);
    assert.match(carousel, /Operational Readiness Heatmap/);
    assert.match(carousel, /Transport Configuration Matrix/);
    assert.match(carousel, /Cell Distribution Heatmap/);
    assert.match(carousel, /readinessData/);
    assert.match(carousel, /transportData/);
    assert.match(carousel, /cellDistributionData/);
    assert.match(carousel, /align:\s*'start'/);
    assert.match(carousel, /loop:\s*false/);
    assert.match(carousel, /watchDrag:\s*shouldHandleCarouselDrag/);
    assert.match(carousel, /prefers-reduced-motion:\s*reduce/);
    assert.match(carousel, /aria-label="Slide sebelumnya"/);
    assert.match(carousel, /aria-label="Slide berikutnya"/);
    assert.match(carousel, /aria-current=/);
    assert.match(carousel, /api\?\.scrollTo\(index\)/);
    assert.match(carousel, /aria-live="polite"/);
    assert.match(carousel, /Slide \{current \+ 1\} dari \{slides\.length\}/);
  });
});

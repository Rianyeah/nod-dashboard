/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ALL_FILTER_VALUE,
  countActiveFilters,
  fromFilterControlValue,
  normalizeFilterOptions,
  toFilterControlValue,
} from '../components/dashboard-filters/dashboardFilterUtils.js';

const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);
const src = (...parts) => readFileSync(srcPath(...parts), 'utf8');

describe('shared dashboard shadcn filter contracts', () => {
  it('normalizes filter options and maps the all sentinel at the control boundary', () => {
    assert.equal(ALL_FILTER_VALUE, '__all__');
    assert.deepEqual(normalizeFilterOptions(['OPEN', 2026]), [
      { value: 'OPEN', label: 'OPEN' },
      { value: '2026', label: '2026' },
    ]);
    assert.deepEqual(normalizeFilterOptions([
      { value: 'critical', label: 'Critical' },
      { id: 'SIDOARJO', name: 'Sidoarjo' },
    ]), [
      { value: 'critical', label: 'Critical' },
      { value: 'SIDOARJO', label: 'Sidoarjo' },
    ]);
    assert.equal(toFilterControlValue(''), ALL_FILTER_VALUE);
    assert.equal(toFilterControlValue(null), ALL_FILTER_VALUE);
    assert.equal(toFilterControlValue('OPEN'), 'OPEN');
    assert.equal(fromFilterControlValue(ALL_FILTER_VALUE), '');
    assert.equal(fromFilterControlValue('OPEN'), 'OPEN');
  });

  it('counts only applied non-default filters', () => {
    assert.equal(countActiveFilters({
      nop: '',
      status: 'OPEN',
      category: null,
      severity: '__all__',
      year: 2026,
    }), 2);
  });

  it('provides the complete adaptive filter component set', () => {
    const componentPath = srcPath('components', 'dashboard-filters', 'DashboardFilters.jsx');
    assert.equal(existsSync(componentPath), true);

    const component = readFileSync(componentPath, 'utf8');
    for (const exportedName of [
      'DashboardFilterBar',
      'DashboardFilterSheet',
      'DashboardFilterPopover',
      'DashboardCombobox',
      'DashboardDateRangePicker',
      'DashboardPeriodPicker',
      'DashboardFilterChips',
      'DashboardTableToolbar',
      'DashboardFilterSelect',
      'DashboardSearchInput',
      'DashboardPagination',
    ]) {
      assert.match(component, new RegExp(`export function ${exportedName}`));
    }

    for (const shadcnPrimitive of [
      '@/components/ui/sheet',
      '@/components/ui/command',
      '@/components/ui/calendar',
      '@/components/ui/select',
      '@/components/ui/input-group',
      '@/components/ui/pagination',
    ]) {
      assert.match(component, new RegExp(shadcnPrimitive));
    }

    assert.match(component, /SheetTitle/);
    assert.match(component, /SheetDescription/);
    assert.match(component, /PopoverHeader/);
    assert.match(component, /PopoverTitle/);
    assert.match(component, /PopoverDescription/);
    assert.match(component, /draftValues/);
    assert.match(component, /onApply\(draftValues\)/);
    assert.match(component, /flex flex-wrap items-end gap-2 lg:flex-nowrap/);
    assert.match(component, /flex min-w-0 flex-1 flex-wrap items-end gap-2 lg:flex-nowrap/);
    assert.match(component, /CommandInput/);
    assert.match(component, /mode="range"/);
    assert.match(component, /numberOfMonths=\{isDesktop \? 2 : 1\}/);
    assert.match(component, /triggerTestId/);
    assert.match(component, /applyTestId/);
    assert.match(component, /minDate/);
    assert.match(component, /previousTestId/);
    assert.match(component, /nextTestId/);
    assert.match(component, /testId/);
    assert.doesNotMatch(component, /<select/);
  });

  it('migrates shared Site Map and Reporting filter surfaces off native controls', () => {
    const header = src('components', 'Header.jsx');
    const filterPanel = src('components', 'FilterPanel.jsx');
    const reporting = src('pages', 'NetworkReportingPage.jsx');

    for (const source of [header, filterPanel, reporting]) {
      assert.match(source, /dashboard-filters\/DashboardFilters/);
      assert.doesNotMatch(source, /<select/);
    }

    assert.match(header, /DashboardFilterBar/);
    assert.match(header, /DashboardCombobox/);
    assert.match(header, /DashboardFilterSelect/);
    assert.match(header, /id="filter-nop"/);
    assert.match(header, /id="filter-bulan"/);
    assert.match(header, /id="filter-tahun"/);

    assert.match(filterPanel, /DashboardFilterSheet/);
    assert.match(filterPanel, /DashboardFilterChips/);
    assert.match(filterPanel, /onApply=\{onFilterChange\}/);

    assert.match(reporting, /DashboardPeriodPicker/);
    assert.match(reporting, /DashboardCombobox/);
    assert.match(reporting, /id="reporting-nop"/);
    assert.match(reporting, /id="reporting-period"/);
  });

  it('migrates Impact Service and removes unused native dashboard filter primitives', () => {
    const impactFilters = src('features', 'impact-service', 'ImpactServiceFilters.jsx');
    const primitives = src('components', 'ui', 'DashboardPrimitives.jsx');

    assert.match(impactFilters, /DashboardFilterBar/);
    assert.match(impactFilters, /DashboardDateRangePicker/);
    assert.match(impactFilters, /DashboardCombobox/);
    assert.doesNotMatch(impactFilters, /@\/components\/ui\/select/);
    assert.doesNotMatch(impactFilters, /@\/components\/ui\/calendar/);
    assert.doesNotMatch(primitives, /export function DashboardSelect/);
    assert.doesNotMatch(primitives, /export function DashboardInput/);
    assert.doesNotMatch(primitives, /<select/);
  });
});

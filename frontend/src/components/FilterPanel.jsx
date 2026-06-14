import {
  DashboardCombobox,
  DashboardFilterChips,
  DashboardFilterSelect,
  DashboardFilterSheet,
} from './dashboard-filters/DashboardFilters';

export default function FilterPanel({
  filters,
  onFilterChange,
  options = { kabupaten: [], cluster: [], kelas: [] },
}) {
  const chipItems = [
    { key: 'kabupaten', label: 'Kabupaten', value: filters.kabupaten },
    { key: 'cluster', label: 'Cluster', value: filters.cluster },
    { key: 'kelas', label: 'Kelas Site', value: filters.kelas },
  ];

  const removeFilter = (key) => {
    const nextFilters = { ...filters };
    delete nextFilters[key];
    onFilterChange(nextFilters);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <DashboardFilterChips
        items={chipItems}
        onRemove={removeFilter}
        className="hidden xl:flex"
      />
      <DashboardFilterSheet
        title="Filter daftar site"
        description="Filter Kabupaten, Cluster, dan Kelas Site diterapkan bersama."
        values={filters}
        onApply={onFilterChange}
        onReset={() => ({})}
        testId="site-filter-sheet"
      >
        {({ draftValues, setDraftValue }) => (
          <>
            <DashboardCombobox
              id="site-filter-kabupaten"
              label="Kabupaten"
              value={draftValues.kabupaten}
              onChange={(value) => setDraftValue('kabupaten', value)}
              options={options.kabupaten}
              allLabel="Semua Kabupaten"
            />
            <DashboardCombobox
              id="site-filter-cluster"
              label="Cluster"
              value={draftValues.cluster}
              onChange={(value) => setDraftValue('cluster', value)}
              options={options.cluster}
              allLabel="Semua Cluster"
            />
            <DashboardFilterSelect
              id="site-filter-kelas"
              label="Kelas Site"
              value={draftValues.kelas}
              onChange={(value) => setDraftValue('kelas', value)}
              options={options.kelas}
              allLabel="Semua Kelas"
            />
          </>
        )}
      </DashboardFilterSheet>
    </div>
  );
}

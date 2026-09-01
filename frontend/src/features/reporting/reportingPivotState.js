const NON_ADDITIVE_FIELDS = new Set(['availability', 'backup_success_rate', 'revenue_per_site', 'payload_per_site']);


export function validatePivotDraft(draft = {}) {
  if (!draft.rows?.length || !draft.values?.length) {
    return { valid: false, message: 'Pilih minimal satu baris dan satu nilai.' };
  }
  if (draft.rows.length > 2 || (draft.columns?.length || 0) > 1 || draft.values.length > 3) {
    return { valid: false, message: 'Maksimal 2 baris, 1 kolom, dan 3 nilai.' };
  }
  return { valid: true, message: '' };
}


function dimensionLabel(dimensions, fields) {
  return fields.map((field) => dimensions?.[field] ?? 'Tidak Diketahui').join(' · ');
}


export function buildPivotGrid(response = {}) {
  const rowFields = response.row_dimensions || [];
  const columnFields = response.column_dimensions || [];
  const valueFields = response.value_fields || [];
  const columnKeys = [];
  const rowMap = new Map();

  for (const item of response.rows || []) {
    const rowLabel = dimensionLabel(item.dimensions, rowFields);
    const columnLabel = columnFields.length ? dimensionLabel(item.dimensions, columnFields) : 'Nilai';
    if (!rowMap.has(rowLabel)) rowMap.set(rowLabel, new Map());
    for (const field of valueFields) {
      const key = `${columnLabel} · ${field}`;
      if (!columnKeys.includes(key)) columnKeys.push(key);
      rowMap.get(rowLabel).set(key, item.values?.[field] ?? null);
    }
  }

  columnKeys.sort((a, b) => a.localeCompare(b));
  const singleValueField = valueFields.length === 1 ? valueFields[0] : null;
  const rows = [...rowMap.entries()].map(([label, cellsByKey]) => {
    const cells = columnKeys.map((key) => cellsByKey.get(key) ?? null);
    const additive = singleValueField && !NON_ADDITIVE_FIELDS.has(singleValueField);
    return {
      label,
      cells,
      total: additive ? cells.reduce((sum, value) => sum + (Number(value) || 0), 0) : null,
    };
  });
  const totals = columnKeys.map((key, index) => (
    NON_ADDITIVE_FIELDS.has(key.split(' · ').at(-1))
      ? null
      : rows.reduce((sum, row) => sum + (Number(row.cells[index]) || 0), 0)
  ));
  const grandTotal = singleValueField && totals.every((value) => value != null)
    ? totals.reduce((sum, value) => sum + value, 0)
    : null;

  return { columns: columnKeys, rows, totals, grandTotal };
}


export function sortPivotRows(grid = {}, sort = {}) {
  const direction = sort.direction === 'desc' ? 'desc' : 'asc';
  const valueFor = (row) => {
    if (sort.key === 'cell') return row.cells?.[sort.index] ?? null;
    if (sort.key === 'total') return row.total ?? null;
    return row.label ?? '';
  };
  return [...(grid.rows || [])].sort((left, right) => {
    const leftValue = valueFor(left);
    const rightValue = valueFor(right);
    const leftMissing = leftValue == null || (typeof leftValue === 'number' && !Number.isFinite(leftValue));
    const rightMissing = rightValue == null || (typeof rightValue === 'number' && !Number.isFinite(rightValue));
    if (leftMissing && rightMissing) return String(left.label).localeCompare(String(right.label), 'id');
    if (leftMissing) return 1;
    if (rightMissing) return -1;

    let comparison;
    if (sort.key === 'label') {
      comparison = String(leftValue).localeCompare(String(rightValue), 'id', { numeric: true });
    } else {
      comparison = Number(leftValue) - Number(rightValue);
    }
    if (comparison === 0) return String(left.label).localeCompare(String(right.label), 'id');
    return direction === 'desc' ? -comparison : comparison;
  });
}

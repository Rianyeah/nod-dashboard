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

const MISSING_LABEL = 'Tidak ada';


function normalizeDimension(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.toUpperCase().startsWith('#N/A') || normalized.toUpperCase().startsWith('#REF!')) {
    return MISSING_LABEL;
  }
  return normalized;
}


export function buildReadinessColumns() {
  return [
    { key: 'enva_ready_pct', countKey: 'enva_ready', label: 'ENVA' },
    { key: 'dual_eas_ready_pct', countKey: 'dual_eas_ready', label: 'Dual EAS' },
    { key: 'bblti_software_ready_pct', countKey: 'bblti_software_ready', label: 'BBLTI SW' },
  ];
}


export function buildTransportMatrix(sourceRows = []) {
  const cells = {};
  const rowMap = new Map();
  const columnSet = new Set();

  for (const sourceRow of sourceRows) {
    const transportType = normalizeDimension(sourceRow.transport_type);
    const modemTransport = normalizeDimension(sourceRow.modem_transport);
    const jumperModem = normalizeDimension(sourceRow.jumper_modem);
    const key = `${transportType}|${modemTransport}`;
    const siteCount = Number(sourceRow.site_count) || 0;
    const percentage = Number(sourceRow.percentage) || 0;

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        key,
        transport_type: transportType,
        modem_transport: modemTransport,
        site_count: 0,
      });
      cells[key] = {};
    }

    rowMap.get(key).site_count += siteCount;
    columnSet.add(jumperModem);
    cells[key][jumperModem] = {
      site_count: siteCount,
      percentage,
    };
  }

  const rows = [...rowMap.values()].sort((a, b) => (
    b.site_count - a.site_count
    || a.transport_type.localeCompare(b.transport_type)
    || a.modem_transport.localeCompare(b.modem_transport)
  ));
  const columns = [...columnSet].sort((a, b) => a.localeCompare(b));

  return { rows, columns, cells };
}

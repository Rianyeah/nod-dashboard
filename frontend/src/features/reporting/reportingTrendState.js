function finiteCount(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


export function enrichRevenueBandTrend(rows = []) {
  let previousAtRisk = null;
  return rows.map((source, index) => {
    const u30 = finiteCount(source?.u30_sites);
    const u60 = finiteCount(source?.u60_sites);
    const atRisk = u30 != null && u60 != null ? u30 + u60 : null;
    const delta = index > 0 && atRisk != null && previousAtRisk != null
      ? atRisk - previousAtRisk
      : null;
    previousAtRisk = atRisk;
    return {
      ...source,
      at_risk_sites: atRisk,
      at_risk_delta: delta,
    };
  });
}

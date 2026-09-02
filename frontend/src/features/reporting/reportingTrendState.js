function finiteCount(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


export function enrichRevenueBandTrend(rows = []) {
  let previousAchieved = null;
  return rows.map((source, index) => {
    const achieved = finiteCount(source?.achieved_sites);
    const delta = index > 0 && achieved != null && previousAchieved != null
      ? achieved - previousAchieved
      : null;
    previousAchieved = achieved;
    return {
      ...source,
      achieved_sites: achieved,
      achieved_delta: delta,
    };
  });
}

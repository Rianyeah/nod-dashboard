const DASHBOARD_MODULES = ['summary', 'trend', 'distributions', 'breakdowns'];

export function collectTransportDashboardResults(results = []) {
  const values = {};
  const failures = {};

  DASHBOARD_MODULES.forEach((moduleName, index) => {
    const result = results[index];
    if (result?.status === 'fulfilled') {
      values[moduleName] = result.value;
    } else {
      failures[moduleName] = result?.reason;
    }
  });

  return {
    values,
    failures,
    failedModules: Object.keys(failures),
  };
}

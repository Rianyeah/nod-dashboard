export function resolveVantaFogFactory(moduleValue) {
  const candidates = [
    moduleValue,
    moduleValue?.FOG,
    moduleValue?.default,
    moduleValue?.default?.FOG,
    moduleValue?.default?.default,
  ];

  return candidates.find((candidate) => typeof candidate === 'function') ?? null;
}

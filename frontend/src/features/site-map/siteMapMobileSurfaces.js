export function resolveMobileSiteMapSurfaces({
  isMobile,
  selectedSiteId,
  inspectorState,
  resultsOpen,
}) {
  if (!isMobile) {
    return { inspectorOpen: false, resultsOpen: false };
  }

  const mobileResultsOpen = Boolean(resultsOpen);
  const inspectorRequested = Boolean(selectedSiteId) && (
    inspectorState?.siteId === selectedSiteId
      ? Boolean(inspectorState.open)
      : true
  );

  return {
    inspectorOpen: !mobileResultsOpen && inspectorRequested,
    resultsOpen: mobileResultsOpen,
  };
}

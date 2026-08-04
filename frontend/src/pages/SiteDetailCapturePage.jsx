import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  consumeFragmentToken,
  normalizeCaptureSiteId,
  validateCaptureBundleSite,
} from '../features/siteCapture/captureRuntime';
import { fetchSiteDetailCapture } from '../services/siteDetailCapture';

export default function SiteDetailCapturePage() {
  const { siteId: routeSiteId } = useParams();
  const [captureState, setCaptureState] = useState('loading');
  const [bundle, setBundle] = useState(null);

  useEffect(() => {
    const previousTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');

    return () => {
      if (previousTheme === null) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', previousTheme);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadCapture() {
      try {
        const requestedSiteId = normalizeCaptureSiteId(routeSiteId);
        const token = consumeFragmentToken();
        const response = await fetchSiteDetailCapture(requestedSiteId, token, controller.signal);
        const validatedBundle = validateCaptureBundleSite(requestedSiteId, response);

        if (active) {
          setBundle(validatedBundle);
        }
      } catch (error) {
        if (active && error?.name !== 'AbortError') {
          setCaptureState('error');
        }
      }
    }

    loadCapture();

    return () => {
      active = false;
      controller.abort();
    };
  }, [routeSiteId]);

  return (
    <main
      className="site-detail-capture-root"
      data-capture-site-id={routeSiteId ?? ''}
      data-capture-state={captureState}
    >
      {captureState === 'loading' && <p>Memuat detail site untuk capture…</p>}
      {captureState === 'error' && <p>Detail site tidak dapat dimuat untuk capture.</p>}
      {bundle && <span className="sr-only">Data detail site telah dimuat.</span>}
    </main>
  );
}

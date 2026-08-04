import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  consumeFragmentToken,
  normalizeCaptureSiteId,
  validateCaptureBundleSite,
  waitForCaptureVisuals,
} from '../features/siteCapture/captureRuntime';
import { fetchSiteDetailCapture } from '../services/siteDetailCapture';
import SiteDetailModal from '../components/SiteDetailModal';

export default function SiteDetailCapturePage() {
  const { siteId: routeSiteId } = useParams();
  const [captureState, setCaptureState] = useState('loading');
  const [bundle, setBundle] = useState(null);
  const [requestedSiteId, setRequestedSiteId] = useState(null);
  const captureRootRef = useRef(null);
  const captureTokenRef = useRef(null);

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
        const token = captureTokenRef.current ?? consumeFragmentToken();
        captureTokenRef.current = token;
        const response = await fetchSiteDetailCapture(requestedSiteId, token, controller.signal);
        const validatedBundle = validateCaptureBundleSite(requestedSiteId, response);

        if (active) {
          setRequestedSiteId(requestedSiteId);
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

  useEffect(() => {
    if (!bundle || !requestedSiteId) return undefined;

    let active = true;

    waitForCaptureVisuals(captureRootRef.current, { expectedSiteId: requestedSiteId })
      .then(() => {
        if (active) setCaptureState('ready');
      })
      .catch(() => {
        if (active) setCaptureState('error');
      });

    return () => {
      active = false;
    };
  }, [bundle, requestedSiteId]);

  return (
    <main
      className="site-detail-capture-root"
      ref={captureRootRef}
      data-capture-site-id={requestedSiteId ?? ''}
      data-capture-state={captureState}
    >
      {captureState === 'loading' && !bundle && <p>Memuat detail site untuk capture…</p>}
      {captureState === 'error' && <p>Detail site tidak dapat dimuat untuk capture.</p>}
      {bundle && (
        <SiteDetailModal
          data={bundle.detail}
          trendData={bundle.trend_data}
          performanceData={bundle.performance_data}
          onClose={() => {}}
          captureMode
        />
      )}
    </main>
  );
}

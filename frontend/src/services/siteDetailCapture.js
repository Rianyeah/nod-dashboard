export class CaptureRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CaptureRequestError';
    this.status = status;
  }
}

export async function fetchSiteDetailCapture(siteId, token, signal) {
  const response = await fetch(
    `/api/v1/integrations/n8n/site-detail-capture/${encodeURIComponent(siteId)}`,
    {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      cache: 'no-store',
      signal,
    },
  );

  if (!response.ok) {
    throw new CaptureRequestError('Unable to load site detail capture', response.status);
  }

  return response.json();
}

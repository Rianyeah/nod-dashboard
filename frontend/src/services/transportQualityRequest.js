const TRANSIENT_STATUS_CODES = new Set([408, 429, 502, 503, 504]);
const TRANSIENT_ERROR_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']);

const defaultWait = (delay) => new Promise((resolve) => {
  setTimeout(resolve, delay);
});

export function isRetryableTransportError(error) {
  if (!error || error.code === 'ERR_CANCELED' || error.name === 'AbortError') return false;

  const status = error.response?.status;
  if (status != null) return TRANSIENT_STATUS_CODES.has(status);

  return TRANSIENT_ERROR_CODES.has(error.code) || error.message === 'Network Error';
}

export async function withTransportRetry(request, {
  retries = 2,
  wait = defaultWait,
} = {}) {
  let attempt = 0;

  while (true) {
    try {
      return await request(attempt);
    } catch (error) {
      if (attempt >= retries || !isRetryableTransportError(error)) throw error;
      await wait(250 * (2 ** attempt));
      attempt += 1;
    }
  }
}

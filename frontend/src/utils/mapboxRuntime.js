const MISSING_TOKEN_MESSAGE = 'Public Mapbox token belum dikonfigurasi pada build production.';


export function validateMapboxRuntime({ token, mapbox, container }) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return { code: 'missing-token', message: MISSING_TOKEN_MESSAGE };
  }
  if (!normalizedToken.startsWith('pk.')) {
    return {
      code: 'invalid-token-type',
      message: 'Mapbox membutuhkan public token dengan prefix pk.; secret token tidak boleh digunakan di browser.',
    };
  }
  if (typeof mapbox?.supported !== 'function' || !mapbox.supported()) {
    return {
      code: 'webgl-unavailable',
      message: 'Map tidak dapat ditampilkan karena WebGL tidak didukung atau dinonaktifkan.',
    };
  }

  const bounds = container?.getBoundingClientRect?.();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return {
      code: 'container-size',
      message: 'Container map belum memiliki ukuran yang valid. Coba buka ulang halaman atau ubah ukuran jendela.',
    };
  }
  return null;
}


function mapboxStatus(event) {
  return Number(
    event?.error?.status
      || event?.error?.statusCode
      || event?.status
      || event?.statusCode
      || 0,
  );
}


export function describeMapboxError(event) {
  const status = mapboxStatus(event);
  if (status === 401) {
    return { fatal: true, message: 'Token Mapbox invalid, kedaluwarsa, atau sudah dihapus (401).' };
  }
  if (status === 403) {
    return { fatal: true, message: 'Mapbox menolak scope token atau URL restriction aplikasi ini (403).' };
  }
  if (status === 429) {
    return { fatal: true, message: 'Mapbox mencapai rate limit. Tunggu sebentar lalu coba lagi (429).' };
  }

  const message = String(event?.error?.message || event?.message || 'Mapbox resource gagal dimuat.');
  if (/content security policy|\bcsp\b/i.test(message)) {
    return {
      fatal: true,
      message: 'Koneksi Mapbox diblokir oleh konfigurasi CSP/jaringan. Periksa domain Mapbox yang diizinkan.',
    };
  }
  if (/access token|unauthori[sz]ed|forbidden|style.*(not found|failed)/i.test(message)) {
    return { fatal: true, message };
  }
  return { fatal: false, message };
}

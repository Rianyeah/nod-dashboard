export function filenameFromDisposition(disposition, fallback) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
  if (encoded?.[1]) return decodeURIComponent(encoded[1].replaceAll('"', '').trim());
  const quoted = /filename="([^"]+)"/i.exec(disposition || '');
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(disposition || '');
  return plain?.[1]?.trim() || fallback;
}


export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

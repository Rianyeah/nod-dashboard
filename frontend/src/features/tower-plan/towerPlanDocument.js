export const MAX_NOTE_CHARACTERS = 1200;
export const MAX_NOTE_LINES = 16;
export const NOTE_WRAP_CHARACTERS = 86;

export const DEFAULT_DOCUMENT_NOTE = Object.freeze({
  title: 'Skenario Pekerjaan',
  text: '',
  headerColor: '#17263b',
});

export const DETAIL_FONT_PRESETS = Object.freeze([
  { id: 'small', label: 'Small', size: 11 },
  { id: 'standard', label: 'Standard', size: 13 },
  { id: 'large', label: 'Large', size: 15 },
  { id: 'custom', label: 'Custom', size: null },
]);

export const BACKGROUND_PRESETS = Object.freeze([
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'soft-gray', label: 'Soft Gray', color: '#eef2f6' },
  { id: 'warm-ivory', label: 'Warm Ivory', color: '#f7f3e8' },
  { id: 'blueprint-navy', label: 'Blueprint Navy', color: '#102337' },
  { id: 'custom', label: 'Custom', color: null },
]);

export function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function presetById(id) {
  return BACKGROUND_PRESETS.find((preset) => preset.id === id);
}

export function normalizeDetailTypography(raw = {}) {
  const preset = DETAIL_FONT_PRESETS.find(
    (candidate) => candidate.id === raw.detailFontPreset,
  ) || DETAIL_FONT_PRESETS[1];
  const numericSize = Number(raw.detailFontSize);
  const customSize = Math.min(
    16,
    Math.max(10, Number.isFinite(numericSize) ? numericSize : 13),
  );
  return {
    detailFontPreset: preset.id,
    detailFontSize: preset.size ?? customSize,
  };
}

export function normalizeDocumentSettings(raw = {}) {
  const requestedPreset = presetById(raw.backgroundPreset);
  const backgroundPreset = requestedPreset?.id || 'white';
  const presetColor = requestedPreset?.color || '#ffffff';
  const backgroundColor = backgroundPreset === 'custom' && isHexColor(raw.backgroundColor)
    ? String(raw.backgroundColor).toLowerCase()
    : presetColor;
  const sourceNote = raw.documentNote && typeof raw.documentNote === 'object'
    ? raw.documentNote
    : {};
  const sourceTitle = String(sourceNote.title || '').trim();

  return {
    documentNote: {
      title: !sourceTitle || sourceTitle === 'WORKFLOW NOTE'
        ? DEFAULT_DOCUMENT_NOTE.title
        : sourceTitle,
      text: String(sourceNote.text || '').slice(0, MAX_NOTE_CHARACTERS),
      headerColor: isHexColor(sourceNote.headerColor)
        ? String(sourceNote.headerColor).toLowerCase()
        : DEFAULT_DOCUMENT_NOTE.headerColor,
    },
    backgroundPreset,
    backgroundColor,
    ...normalizeDetailTypography(raw),
  };
}

export function resolveDetailTypography(plan = {}) {
  const { detailFontSize: size } = normalizeDetailTypography(plan);
  return {
    size,
    titleSize: Math.min(16, size + 1),
    lineHeight: size + 4,
    noteLineHeight: size + 5,
    wrapCharacters: Math.max(26, Math.round(40 * 13 / size)),
  };
}

function splitLongToken(token, maxCharacters) {
  const chunks = [];
  for (let index = 0; index < token.length; index += maxCharacters) {
    chunks.push(token.slice(index, index + maxCharacters));
  }
  return chunks;
}

function wrapParagraph(paragraph, maxCharacters) {
  const words = paragraph.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let current = '';
  words.forEach((word) => {
    const chunks = splitLongToken(word, maxCharacters);
    chunks.forEach((chunk, chunkIndex) => {
      const proposed = [current, chunk].filter(Boolean).join(' ');
      if (current && proposed.length > maxCharacters) {
        lines.push(current);
        current = chunk;
      } else {
        current = proposed;
      }
      if (chunkIndex < chunks.length - 1) {
        lines.push(current);
        current = '';
      }
    });
  });
  if (current) lines.push(current);
  return lines;
}

export function wrapDocumentNote(text, maxCharacters = NOTE_WRAP_CHARACTERS) {
  const value = String(text || '').replace(/\r\n?/g, '\n');
  if (!value.trim()) return [];
  const safeWidth = Math.max(1, Number(maxCharacters) || NOTE_WRAP_CHARACTERS);
  return value.split('\n').flatMap((paragraph) => (
    wrapParagraph(paragraph, safeWidth)
  ));
}

export function validateDocumentNote(note = {}) {
  const text = String(note.text || '');
  if (text.length > MAX_NOTE_CHARACTERS) {
    return ['Workflow note maksimal 1.200 karakter.'];
  }
  if (wrapDocumentNote(text).length > MAX_NOTE_LINES) {
    return ['Workflow note maksimal 16 baris pada hasil gambar.'];
  }
  return [];
}

function relativeLuminance(color) {
  const hex = isHexColor(color) ? color.slice(1) : 'ffffff';
  const channels = [0, 2, 4].map((offset) => (
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  ));
  const linear = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastTextColor(color) {
  return relativeLuminance(color) < 0.35 ? '#ffffff' : '#17263b';
}

export function resolveDocumentPalette(plan = {}) {
  const settings = normalizeDocumentSettings(plan);
  const dark = relativeLuminance(settings.backgroundColor) < 0.35;
  return {
    background: settings.backgroundColor,
    canvasInk: dark ? '#f8fafc' : '#111827',
    canvasMuted: dark ? '#cbd5e1' : '#26384d',
    guide: dark ? '#94a3b8' : '#64748b',
  };
}

export function documentBackgroundPrompt(plan = {}) {
  const settings = normalizeDocumentSettings(plan);
  const preset = presetById(settings.backgroundPreset);
  return settings.backgroundPreset === 'custom'
    ? `Custom ${settings.backgroundColor}`
    : preset.label;
}

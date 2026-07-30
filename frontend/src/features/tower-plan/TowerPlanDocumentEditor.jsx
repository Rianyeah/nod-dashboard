import { useMemo, useState } from 'react';

import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  BACKGROUND_PRESETS,
  DETAIL_FONT_PRESETS,
  MAX_NOTE_CHARACTERS,
  MAX_NOTE_LINES,
  isHexColor,
  wrapDocumentNote,
} from './towerPlanDocument';

const HEX_HINT = 'Gunakan format #RRGGBB.';

function HexColorField({
  id,
  label,
  pickerLabel,
  value,
  onCommit,
}) {
  const [draft, setDraft] = useState(value);
  const invalid = !isHexColor(draft);

  const updateDraft = (nextValue) => {
    setDraft(nextValue);
    if (isHexColor(nextValue)) {
      onCommit(nextValue.toLowerCase());
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          aria-label={pickerLabel}
          className="w-14 shrink-0 cursor-pointer rounded-xl p-1"
          type="color"
          value={value}
          onChange={(event) => updateDraft(event.target.value)}
        />
        <Input
          id={id}
          aria-invalid={invalid || undefined}
          className="font-mono uppercase"
          inputMode="text"
          spellCheck="false"
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
        />
      </div>
      {invalid ? (
        <p className="text-xs text-destructive" role="alert">{HEX_HINT}</p>
      ) : null}
    </div>
  );
}

export default function TowerPlanDocumentEditor({ plan, onChange }) {
  const noteLines = useMemo(
    () => wrapDocumentNote(plan.documentNote.text).length,
    [plan.documentNote.text],
  );

  const updateNote = (changes) => onChange({
    documentNote: {
      ...plan.documentNote,
      ...changes,
    },
  });

  const selectPreset = (preset) => {
    const color = preset.color || plan.backgroundColor;
    onChange({
      backgroundPreset: preset.id,
      backgroundColor: color,
    });
  };

  const selectDetailFontPreset = (preset) => {
    onChange({
      detailFontPreset: preset.id,
      detailFontSize: preset.size ?? plan.detailFontSize,
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tower-note-title">Note header</Label>
          <Input
            id="tower-note-title"
            maxLength={48}
            value={plan.documentNote.title}
            onBlur={() => {
              if (!plan.documentNote.title.trim()) {
                updateNote({ title: 'Skenario Pekerjaan' });
              }
            }}
            onChange={(event) => updateNote({ title: event.target.value })}
          />
        </div>

        <HexColorField
          key={`header-${plan.documentNote.headerColor}`}
          id="tower-note-header-color"
          label="Header colour"
          pickerLabel="Header colour picker"
          value={plan.documentNote.headerColor}
          onCommit={(value) => updateNote({ headerColor: value })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="tower-workflow-note">Workflow note</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {plan.documentNote.text.length} / {MAX_NOTE_CHARACTERS}
          </span>
        </div>
        <Textarea
          id="tower-workflow-note"
          aria-describedby="tower-workflow-note-hint"
          className="min-h-28 resize-y"
          maxLength={MAX_NOTE_CHARACTERS}
          placeholder="Contoh: verifikasi mounting, labeling feeder, dan urutan pekerjaan."
          value={plan.documentNote.text}
          onChange={(event) => updateNote({ text: event.target.value })}
        />
        <p
          id="tower-workflow-note-hint"
          className={noteLines > MAX_NOTE_LINES
            ? 'text-xs text-destructive'
            : 'text-xs text-muted-foreground'}
        >
          {noteLines > MAX_NOTE_LINES
            ? `Note melebihi ${MAX_NOTE_LINES} baris pada hasil gambar.`
            : `Maksimal ${MAX_NOTE_LINES} baris pada hasil gambar; panel disembunyikan jika kosong.`}
        </p>
      </div>

      <fieldset className="space-y-2.5">
        <legend className="text-sm font-medium">Background</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BACKGROUND_PRESETS.map((preset) => {
            const selected = plan.backgroundPreset === preset.id;
            const swatchColor = preset.color || plan.backgroundColor;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                className={[
                  'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition',
                  selected
                    ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/20'
                    : 'border-[var(--border-strong)] bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                ].join(' ')}
                onClick={() => selectPreset(preset)}
              >
                <span
                  aria-hidden="true"
                  className="size-5 shrink-0 rounded-md border border-[var(--border-strong)]"
                  style={{ backgroundColor: swatchColor }}
                />
                <span className="truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {plan.backgroundPreset === 'custom' ? (
          <div className="max-w-sm pt-1">
            <HexColorField
              key={`background-${plan.backgroundColor}`}
              id="tower-custom-background"
              label="Custom background"
              pickerLabel="Custom background colour picker"
              value={plan.backgroundColor}
              onCommit={(value) => onChange({
                backgroundPreset: 'custom',
                backgroundColor: value,
              })}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="sr-only">Detail font size</legend>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium" aria-hidden="true">
            Detail font size
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {plan.detailFontSize} px
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DETAIL_FONT_PRESETS.map((preset) => {
            const selected = plan.detailFontPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                className={[
                  'flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition',
                  selected
                    ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/20'
                    : 'border-[var(--border-strong)] bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                ].join(' ')}
                onClick={() => selectDetailFontPreset(preset)}
              >
                <span className="text-xs font-semibold">{preset.label}</span>
                <span className="mt-0.5 text-[11px] tabular-nums opacity-75">
                  {preset.size ? `${preset.size} px` : '10–16 px'}
                </span>
              </button>
            );
          })}
        </div>

        {plan.detailFontPreset === 'custom' ? (
          <div className="max-w-48 space-y-1.5 pt-1">
            <Label htmlFor="tower-custom-detail-font-size">Custom font size</Label>
            <div className="relative">
              <Input
                id="tower-custom-detail-font-size"
                className="pr-10 tabular-nums"
                max={16}
                min={10}
                type="number"
                value={plan.detailFontSize}
                onChange={(event) => onChange({
                  detailFontPreset: 'custom',
                  detailFontSize: Math.min(
                    16,
                    Math.max(10, Number(event.target.value) || 13),
                  ),
                })}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                px
              </span>
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

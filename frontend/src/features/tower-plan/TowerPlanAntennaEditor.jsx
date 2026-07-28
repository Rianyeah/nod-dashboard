import { useState } from 'react';
import { Copy, GripVertical, RadioTower, Trash2 } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  FOUR_LEG_TOWER,
  STATUS_COLORS,
  TOWER_TYPE_CONFIG,
} from './towerPlanState';

const FIELD_CLASS = 'space-y-1.5';

function CidInput({ antennaId, initialValue, onChange }) {
  const [cidDraft, setCidDraft] = useState(initialValue);

  const commitCidDraft = () => {
    if (cidDraft !== initialValue) onChange(cidDraft);
  };

  return (
    <Input
      id={`antenna-cid-${antennaId}`}
      placeholder="Contoh: 11, 14, 15"
      value={cidDraft}
      onBlur={commitCidDraft}
      onChange={(event) => setCidDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export default function TowerPlanAntennaEditor({
  antenna,
  index,
  towerType,
  onChange,
  onDuplicate,
  onRemove,
}) {
  const towerConfig = TOWER_TYPE_CONFIG[towerType] || TOWER_TYPE_CONFIG[FOUR_LEG_TOWER];
  const committedCidValue = (antenna.cids || []).join(', ');

  return (
    <article
      className="rounded-xl border border-border bg-muted/20 p-4"
      style={{ borderLeft: `4px solid ${antenna.color}` }}
    >
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{antenna.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline">{towerConfig.label} {antenna.leg}</Badge>
              <Badge variant="outline">{antenna.status}</Badge>
              {antenna.source?.cellCount > 0 && (
                <Badge variant="secondary">{antenna.source.cellCount} cell</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex self-end sm:self-auto">
          <Button
            aria-label={`Duplikasi ${antenna.name}`}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={onDuplicate}
          >
            <Copy />
          </Button>
          <Button
            aria-label={`Hapus ${antenna.name}`}
            size="icon-sm"
            type="button"
            variant="destructive"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <Label htmlFor={`antenna-name-${antenna.id}`}>Nama antena</Label>
          <Input
            id={`antenna-name-${antenna.id}`}
            value={antenna.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-status-${antenna.id}`}>Status</Label>
          <select
            id={`antenna-status-${antenna.id}`}
            className="dashboard-control h-9 w-full rounded-full px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            value={antenna.status}
            onChange={(event) => onChange({
              status: event.target.value,
              color: STATUS_COLORS[event.target.value],
            })}
          >
            {Object.keys(STATUS_COLORS).map((status) => <option key={status}>{status}</option>)}
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-sector-${antenna.id}`}>Sector</Label>
          <Input
            id={`antenna-sector-${antenna.id}`}
            value={antenna.sector}
            onChange={(event) => onChange({ sector: event.target.value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-height-${antenna.id}`}>Height (m)</Label>
          <Input
            id={`antenna-height-${antenna.id}`}
            min="0"
            step="0.1"
            type="number"
            value={antenna.height}
            onChange={(event) => onChange({ height: event.target.value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-mechanical-tilt-${antenna.id}`}>Mechanical Tilt (MT)</Label>
          <Input
            id={`antenna-mechanical-tilt-${antenna.id}`}
            step="0.1"
            type="number"
            value={antenna.mechanicalTilt ?? ''}
            onChange={(event) => onChange({ mechanicalTilt: event.target.value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-azimuth-${antenna.id}`}>Azimuth</Label>
          <div className="relative">
            <RadioTower className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`antenna-azimuth-${antenna.id}`}
              className="pl-8"
              min="0"
              max="359.9"
              step="0.1"
              type="number"
              value={antenna.azimuth}
              onChange={(event) => onChange({ azimuth: event.target.value })}
            />
          </div>
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-leg-${antenna.id}`}>{towerConfig.label}</Label>
          <select
            id={`antenna-leg-${antenna.id}`}
            className="dashboard-control h-9 w-full rounded-full px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            value={antenna.leg}
            onChange={(event) => onChange({ leg: event.target.value })}
          >
            {towerConfig.positions.map((position) => (
              <option key={position}>{position}</option>
            ))}
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-cid-${antenna.id}`}>CID(s)</Label>
          <CidInput
            key={`${antenna.id}-${committedCidValue}`}
            antennaId={antenna.id}
            initialValue={committedCidValue}
            onChange={(cids) => onChange({ cids })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor={`antenna-color-${antenna.id}`}>Colour</Label>
          <Input
            id={`antenna-color-${antenna.id}`}
            className="h-9 px-2 py-1"
            type="color"
            value={antenna.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </div>
        <div className={`${FIELD_CLASS} sm:col-span-2 xl:col-span-4`}>
          <Label htmlFor={`antenna-note-${antenna.id}`}>Notes</Label>
          <Input
            id={`antenna-note-${antenna.id}`}
            placeholder="Catatan pemasangan atau verifikasi lapangan"
            value={antenna.note}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </div>
      </div>

      {antenna.source && (
        <details className="mt-4 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Metadata sumber RF</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <span>Model: {antenna.source.antennaModel || 'n/a'}</span>
            <span>Cell: {antenna.source.cellCount}</span>
            <span>Band: {antenna.source.bands.join(', ') || 'n/a'}</span>
            <span>Technology: {antenna.source.technologies.join(', ') || 'n/a'}</span>
          </div>
        </details>
      )}
    </article>
  );
}

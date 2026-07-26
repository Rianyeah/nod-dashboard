import { AlertTriangle, Antenna, Database, Layers3, RadioTower } from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  FOUR_LEG_TOWER,
  TOWER_TYPE_CONFIG,
  buildAutofillWarnings,
  updateAutofillAntennaDraft,
  validateAutofillDraft,
} from './towerPlanState';

export default function TowerPlanAutofillDialog({
  draft,
  open,
  onApply,
  onOpenChange,
  onDraftChange,
}) {
  if (!draft) return null;
  const selectedCount = draft.antennas.filter((antenna) => antenna.selected).length;
  const errors = validateAutofillDraft(draft);
  const warnings = buildAutofillWarnings(draft);
  const towerConfig = TOWER_TYPE_CONFIG[draft.towerType]
    || TOWER_TYPE_CONFIG[FOUR_LEG_TOWER];

  const updateAntenna = (antennaId, changes) => {
    onDraftChange(updateAutofillAntennaDraft(draft, antennaId, changes));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <div>
              <DialogTitle>Review Auto-fill · {draft.siteName}</DialogTitle>
              <DialogDescription>
                Periksa grouping antena fisik sebelum mengganti konfigurasi saat ini.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(92vh-148px)] space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cell sumber</p>
              <p className="mt-1 text-xl font-semibold">
                {draft.antennas.reduce((total, antenna) => total + antenna.source.cellCount, 0)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Antena fisik</p>
              <p className="mt-1 text-xl font-semibold">{draft.antennas.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dipilih</p>
              <p className="mt-1 text-xl font-semibold">{selectedCount} / maksimal 16</p>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-200">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                Perlu verifikasi
              </div>
              <ul className="space-y-1">
                {warnings.map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="autofill-plan-title">Plan title</Label>
              <Input
                id="autofill-plan-title"
                value={draft.planTitle}
                onChange={(event) => onDraftChange({ ...draft, planTitle: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="autofill-tower-height">Tower height (m)</Label>
              <Input
                id="autofill-tower-height"
                min="1"
                step="0.1"
                type="number"
                value={draft.towerHeight}
                onChange={(event) => onDraftChange({ ...draft, towerHeight: event.target.value })}
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Hasil grouping antena sectoral</h3>
                <p className="text-xs text-muted-foreground">
                  Key: sector_base + antenna_type + antenna_height.
                </p>
              </div>
              <Badge variant={selectedCount > 16 ? 'destructive' : 'secondary'}>
                {selectedCount} dipilih
              </Badge>
            </div>

            <div className="space-y-2">
              {draft.antennas.map((antenna, index) => (
                <article
                  key={antenna.id}
                  className={[
                    'rounded-xl border p-4 transition-colors',
                    antenna.selected ? 'border-primary/30 bg-primary/5' : 'border-border opacity-65',
                  ].join(' ')}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <Checkbox
                      aria-label={`Pilih ${antenna.name}`}
                      checked={antenna.selected}
                      onCheckedChange={(checked) => updateAntenna(antenna.id, { selected: checked === true })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                        <h4 className="truncate font-semibold">{antenna.name}</h4>
                        <Badge variant="outline">{antenna.source.cellCount} cell</Badge>
                        <Badge variant="outline">{antenna.source.bands.join(', ') || 'Band n/a'}</Badge>
                        {antenna.cids.length > 0 && (
                          <Badge variant="secondary">CID: {antenna.cids.join(', ')}</Badge>
                        )}
                        {antenna.azimuthConflict && (
                          <Badge variant="destructive">Azimuth conflict</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {antenna.source.cellNames.join(' · ') || 'Cell name tidak tersedia'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Antenna className="size-3.5" /> {antenna.height} m</span>
                        <span className="flex items-center gap-1">
                          <RadioTower className="size-3.5" />
                          {antenna.azimuthConflict
                            ? `${antenna.azimuthValues.join('° / ')}°`
                            : `${antenna.azimuth}°`}
                        </span>
                        <span className="flex items-center gap-1"><Layers3 className="size-3.5" /> Existing</span>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-2 lg:w-80">
                      <div className="space-y-1">
                        <Label className="text-[10px]" htmlFor={`review-sector-${antenna.id}`}>Sector</Label>
                        <Input
                          id={`review-sector-${antenna.id}`}
                          disabled={!antenna.selected}
                          value={antenna.sector}
                          onChange={(event) => updateAntenna(antenna.id, { sector: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]" htmlFor={`review-azimuth-${antenna.id}`}>
                          Azimuth
                        </Label>
                        <Input
                          id={`review-azimuth-${antenna.id}`}
                          disabled={!antenna.selected}
                          max="359.9"
                          min="0"
                          step="0.1"
                          type="number"
                          value={antenna.azimuth}
                          onChange={(event) => updateAntenna(
                            antenna.id,
                            { azimuth: event.target.value },
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]" htmlFor={`review-leg-${antenna.id}`}>
                          {towerConfig.label}
                        </Label>
                        <select
                          id={`review-leg-${antenna.id}`}
                          className="dashboard-control h-9 w-full rounded-full px-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                          disabled={!antenna.selected}
                          value={antenna.leg}
                          onChange={(event) => updateAntenna(antenna.id, { leg: event.target.value })}
                        >
                          {towerConfig.positions.map((position) => (
                            <option key={position}>{position}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
              <p className="mb-2 font-semibold">Konfigurasi belum dapat diterapkan:</p>
              <ul className="space-y-1">
                {errors.slice(0, 8).map((error) => <li key={error}>• {error}</li>)}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button disabled={errors.length > 0} onClick={onApply}>
            Terapkan konfigurasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

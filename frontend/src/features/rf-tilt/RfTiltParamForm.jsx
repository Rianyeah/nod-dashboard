import { useState, useMemo, useRef, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CaretUpDownIcon, CheckIcon, MapPinIcon, CircleNotchIcon, MagnifyingGlassIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { FREQUENCY_OPTIONS, TYPICAL_VBW_BY_BAND } from './rfTiltChartConfig';

function NumberField({ label, value, onChange, step = 1, suffix, disabled = false }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={suffix ? 'pr-8' : ''}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function AntennaModelPreview({ model }) {
  if (!model) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-muted-foreground">
        Hover or focus a model to preview its specifications.
      </div>
    );
  }

  const details = [
    ['Vendor', model.vendor],
    ['Series', model.series],
    ['Frequency bands', model.frequency_bands],
    ['Frequency range', model.frequency_low_mhz != null && model.frequency_high_mhz != null
      ? `${model.frequency_low_mhz} – ${model.frequency_high_mhz} MHz`
      : null],
    ['Ports', model.ports],
    ['Connector', model.connector_type],
  ].filter(([, value]) => value != null && value !== '');

  return (
    <div className="h-full border-l border-border bg-muted/20 p-3" aria-live="polite">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Specification preview</p>
      <p className="mt-2 break-words text-xs font-semibold text-foreground">{model.antenna_model}</p>
      <dl className="mt-3 space-y-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
            <dd className="mt-0.5 break-words text-[11px] font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
        Select this model to load its full datasheet details in the Antenna Specification panel.
      </p>
    </div>
  );
}

export default function RfTiltParamForm({
  params,
  set,
  setMultiple,
  targetMode,
  setTargetMode,
  manualMode,
  setManualMode,
  selectedSiteId,
  siteSearchResults,
  siteSearchLoading,
  searchSites,
  selectSite,
  loading,
  onRun,
  totalTilt,
  antennaModelResults = [],
  antennaModelLoading = false,
  antennaModelError = null,
  searchAntennaModels,
  selectAntennaModel,
  antennaSpec,
}) {
  const [siteSearchOpen, setSiteSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [previewedAntennaModelId, setPreviewedAntennaModelId] = useState(null);
  const modelSearchInputRef = useRef(null);
  const selectedAntennaModelLabel = antennaSpec?.antenna_model || params.antenna_type;
  const previewedAntennaModel = antennaModelResults.find(
    (model) => model.antenna_model === previewedAntennaModelId,
  ) || antennaModelResults[0] || null;

  const siteOptions = useMemo(
    () => siteSearchResults.map((s) => ({
      value: `${s.site_id}-${s.cell_name}`,
      label: `${s.site_id} — ${s.cell_name || s.sector_base || ''}`.trim(),
      site: s,
    })),
    [siteSearchResults],
  );

  useEffect(() => {
    if (siteSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [siteSearchOpen]);

  useEffect(() => {
    if (modelSearchOpen && modelSearchInputRef.current) {
      setTimeout(() => modelSearchInputRef.current?.focus(), 100);
    }
  }, [modelSearchOpen]);

  useEffect(() => {
    if (modelSearchOpen) {
      searchAntennaModels(modelQuery);
    }
  }, [modelSearchOpen, modelQuery, searchAntennaModels]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val && val.trim().length >= 2) {
      searchSites(val);
    }
  };

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        {/* Site Search */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">Site Selection</Label>
          <Popover open={siteSearchOpen} onOpenChange={(open) => { setSiteSearchOpen(open); if (!open) setSearchQuery(''); }}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                role="combobox"
                aria-expanded={siteSearchOpen}
                className="w-full justify-between font-normal"
                disabled={manualMode}
              >
                {selectedSiteId ? selectedSiteId : 'Search site from ransys...'}
                <CaretUpDownIcon className="size-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[480px] p-0" align="start">
              <div className="relative p-2 border-b border-border">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Type site_id or cell_name..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-8"
                />
              </div>
              <ScrollArea className="h-[280px]">
                {siteSearchLoading && (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <CircleNotchIcon className="size-4 animate-spin" />
                    Searching...
                  </div>
                )}
                {!siteSearchLoading && siteOptions.length === 0 && searchQuery.trim().length >= 2 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No sites found.
                  </div>
                )}
                {!siteSearchLoading && siteOptions.length === 0 && searchQuery.trim().length < 2 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search.
                  </div>
                )}
                <div className="p-1">
                  {siteOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.label}
                      onClick={() => {
                        selectSite(opt.site);
                        setSiteSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="manual-mode"
              checked={manualMode}
              onCheckedChange={(checked) => setManualMode(checked === true)}
            />
            <Label htmlFor="manual-mode" className="text-xs text-muted-foreground cursor-pointer">
              Manual input (override site selection)
            </Label>
          </div>
        </div>

        <Separator />

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Latitude" step={0.000001} value={params.latitude} onChange={set('latitude')} disabled={!manualMode} />
          <NumberField label="Longitude" step={0.000001} value={params.longitude} onChange={set('longitude')} disabled={!manualMode} />
          <NumberField label="Azimuth" suffix="°" value={params.azimuth} onChange={set('azimuth')} disabled={targetMode} />
          <NumberField label="Antenna Height" suffix="m" value={params.antenna_height} onChange={set('antenna_height')} />
          <NumberField label="Mechanical Tilt" suffix="°" step={0.5} value={params.mechanical_tilt} onChange={set('mechanical_tilt')} />
          <NumberField label="Electrical Tilt" suffix="°" step={0.5} value={params.electrical_tilt} onChange={set('electrical_tilt')} />
          <NumberField label="Vertical BW" suffix="°" step={0.5} value={params.vertical_beamwidth} onChange={set('vertical_beamwidth')} />
          <NumberField label="Horizontal BW" suffix="°" value={params.horizontal_beamwidth} onChange={set('horizontal_beamwidth')} />
          <NumberField label="Max Distance" suffix="m" step={50} value={params.max_distance} onChange={set('max_distance')} disabled={targetMode} />
          <NumberField label="Sample Interval" suffix="m" step={5} value={params.sample_interval} onChange={set('sample_interval')} />
        </div>

        {/* P2P Mode */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="target-mode"
              checked={targetMode}
              onCheckedChange={(checked) => setTargetMode(checked === true)}
            />
            <Label htmlFor="target-mode" className="text-xs text-muted-foreground cursor-pointer">
              Point-to-Point mode (analyze to a target coordinate)
            </Label>
          </div>
          {targetMode && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <NumberField label="Target Latitude" step={0.000001} value={params.target_latitude ?? ''} onChange={set('target_latitude')} />
              <NumberField label="Target Longitude" step={0.000001} value={params.target_longitude ?? ''} onChange={set('target_longitude')} />
              <div className="col-span-2">
                <NumberField label="Target Height" suffix="m" step={0.5} value={params.target_height} onChange={set('target_height')} />
              </div>
              <p className="col-span-2 text-[10px] text-muted-foreground">
                Click the Coverage Map to place or drag the target pin. Azimuth and Max Distance are calculated from the selected target.
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Frequency + Antenna */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            <Select
              value={String(params.frequency_mhz)}
              onValueChange={(val) => {
                const freq = parseInt(val, 10);
                setMultiple({
                  frequency_mhz: freq,
                  vertical_beamwidth: TYPICAL_VBW_BY_BAND[freq] ?? params.vertical_beamwidth,
                });
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)}>{f} MHz</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Antenna Model</Label>
            <Popover open={modelSearchOpen} onOpenChange={(open) => { setModelSearchOpen(open); if (!open) setModelQuery(''); }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  role="combobox"
                  aria-label="Antenna model"
                  aria-expanded={modelSearchOpen}
                  aria-controls="antenna-model-listbox"
                  aria-autocomplete="list"
                  className="w-full justify-between font-normal text-left truncate"
                >
                  <span className="truncate">{selectedAntennaModelLabel || 'Search antenna model...'}</span>
                  <CaretUpDownIcon className="size-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(620px,calc(100vw-2rem))] gap-0 overflow-hidden p-0" align="start" sideOffset={6}>
                <div className="relative p-2 border-b border-border">
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={modelSearchInputRef}
                    type="text"
                    placeholder="Search canonical models..."
                    value={modelQuery}
                    onChange={(e) => setModelQuery(e.target.value)}
                    className="pl-8"
                    aria-controls="antenna-model-listbox"
                  />
                </div>
                <div className="grid min-h-[280px] sm:grid-cols-[minmax(0,1fr)_240px]">
                  <ScrollArea className="h-[280px]">
                    {antennaModelLoading && (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                        <CircleNotchIcon className="size-3.5 animate-spin" />
                        Loading antenna models...
                      </div>
                    )}
                    {!antennaModelLoading && antennaModelError && (
                      <div className="flex flex-col items-center gap-2 px-4 py-7 text-center text-xs text-destructive">
                        <WarningCircleIcon className="size-5" />
                        <p>{antennaModelError}</p>
                        <Button type="button" variant="outline" size="xs" onClick={() => searchAntennaModels(modelQuery)}>
                          Try again
                        </Button>
                      </div>
                    )}
                    {!antennaModelLoading && !antennaModelError && antennaModelResults.length === 0 && (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        No antenna models match “{modelQuery}”.
                      </div>
                    )}
                    <div id="antenna-model-listbox" role="listbox" aria-label="Antenna models" className="space-y-0.5 p-1">
                      {!antennaModelLoading && !antennaModelError && antennaModelResults.map((model) => {
                        const selected = model.antenna_model === selectedAntennaModelLabel;
                        return (
                          <button
                            key={model.antenna_model}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onMouseEnter={() => setPreviewedAntennaModelId(model.antenna_model)}
                            onFocus={() => setPreviewedAntennaModelId(model.antenna_model)}
                            onClick={() => {
                              selectAntennaModel(model);
                              setModelSearchOpen(false);
                              setModelQuery('');
                              setPreviewedAntennaModelId(model.antenna_model);
                            }}
                            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-foreground">{model.antenna_model}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {[model.vendor, model.series, model.frequency_bands].filter(Boolean).join(' • ') || 'Specification available'}
                              </span>
                            </span>
                            {selected && <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" weight="bold" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="hidden sm:block">
                    <AntennaModelPreview model={previewedAntennaModel} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <NumberField
          label="Fresnel Clearance Required"
          suffix="%"
          step={5}
          value={params.fresnel_clearance_pct}
          onChange={set('fresnel_clearance_pct')}
        />

        {/* DEM Source */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">DEM Source</Label>
          <Select value={params.dem_source} onValueChange={set('dem_source')}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open_meteo">Open-Meteo (90m bare terrain)</SelectItem>
              <SelectItem value="opentopography">OpenTopography COP30 (30m DSM)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Total Tilt + Run */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Tilt:</span>
          <span className="font-mono font-medium text-foreground">{totalTilt}°</span>
        </div>
        <Button
          onClick={onRun}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <CircleNotchIcon className="animate-spin" />
              Running...
            </>
          ) : (
            'Run Analysis'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

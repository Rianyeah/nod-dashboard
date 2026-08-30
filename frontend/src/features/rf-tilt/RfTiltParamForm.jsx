import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Check as CheckIcon,
  ChevronsUpDown as CaretUpDownIcon,
  CircleAlert as WarningCircleIcon,
  Info as InfoIcon,
  LoaderCircle as CircleNotchIcon,
  MapPin as MapPinIcon,
  Search as MagnifyingGlassIcon,
} from 'lucide-react';
import { FREQUENCY_OPTIONS } from './rfTiltChartConfig';

function FieldLabel({ label, help, source, htmlFor }) {
  return (
    <div className="flex min-h-4 items-center gap-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={`Bantuan: ${label}`} className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <InfoIcon className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-64 leading-relaxed">{help}</TooltipContent>
      </Tooltip>
      {source && <span className="ml-auto whitespace-nowrap text-[9px] font-medium text-primary/85">{source}</span>}
    </div>
  );
}

function NumberField({ label, help, source, value, onChange, step = 1, suffix, disabled = false }) {
  const inputId = `rf-tilt-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} help={help} source={source} htmlFor={inputId} />
      <div className="relative">
        <Input
          id={inputId}
          type="number"
          step={step}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const rawValue = event.target.value;
            const numericValue = rawValue === '' ? null : Number(rawValue);
            onChange(Number.isFinite(numericValue) ? numericValue : null);
          }}
          className={suffix ? 'pr-8' : ''}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function AntennaModelPreview({ model }) {
  if (!model) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-muted-foreground">Hover or focus a model to preview its specifications.</div>;
  }

  const details = [
    ['Vendor', model.vendor],
    ['Series', model.series],
    ['Frequency bands', model.frequency_bands],
    ['Frequency range', model.frequency_low_mhz != null && model.frequency_high_mhz != null ? `${model.frequency_low_mhz}–${model.frequency_high_mhz} MHz` : null],
    ['Ports', model.ports],
    ['Connector', model.connector_type],
  ].filter(([, value]) => value != null && value !== '');

  return (
    <div className="h-full border-l border-[var(--border-strong)] bg-muted/20 p-3" aria-live="polite">
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
      <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">Select this model to load its full datasheet details in the Antenna Specification panel.</p>
    </div>
  );
}

function formatSiteLabel(site) {
  const azimuth = Number(site?.azimuth);
  const hasAzimuth = site?.azimuth != null && site.azimuth !== '' && Number.isFinite(azimuth);
  return `${site?.site_id} - ${site?.cell_name || site?.sector_base || 'Unknown cell'} - Az ${hasAzimuth ? `${azimuth}°` : 'n/a'}`;
}

export default function RfTiltParamForm({
  initialSiteQuery = null,
  params,
  set,
  targetMode,
  setTargetMode,
  manualMode,
  setManualMode,
  selectedSiteId,
  selectedSite,
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
  selectFrequency,
  antennaSpec,
  inputSources,
  compatibilityWarning,
}) {
  const [siteSearchOpen, setSiteSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const lastInitialSiteQueryRef = useRef(null);
  const [modelSearchOpen, setModelSearchOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [previewedAntennaModelId, setPreviewedAntennaModelId] = useState(null);
  const modelSearchInputRef = useRef(null);
  const selectedAntennaModelLabel = antennaSpec?.antenna_model || params.antenna_type;
  const previewedAntennaModel = antennaModelResults.find((model) => model.antenna_model === previewedAntennaModelId) || antennaModelResults[0] || null;
  const verticalBwHelp = inputSources?.verticalBeamwidth === 'Antenna spec'
    ? 'Nilai ini berasal dari spesifikasi antena yang cocok pada frekuensi aktif. Nilai tetap dapat diubah secara manual.'
    : 'Spesifikasi antena yang cocok pada frekuensi aktif tidak tersedia atau tidak valid, sehingga digunakan nilai standar 6°. Nilai tetap dapat diubah secara manual.';

  const siteOptions = useMemo(() => siteSearchResults.map((site) => ({
    value: `${site.site_id}-${site.cell_name}`,
    label: formatSiteLabel(site),
    site,
  })), [siteSearchResults]);

  useEffect(() => {
    if (siteSearchOpen && searchInputRef.current) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [siteSearchOpen]);

  useEffect(() => {
    if (!initialSiteQuery || lastInitialSiteQueryRef.current === initialSiteQuery) return;

    lastInitialSiteQueryRef.current = initialSiteQuery;
    setSearchQuery(initialSiteQuery);
    setSiteSearchOpen(true);
    searchSites(initialSiteQuery);
  }, [initialSiteQuery, searchSites]);

  useEffect(() => {
    if (modelSearchOpen && modelSearchInputRef.current) setTimeout(() => modelSearchInputRef.current?.focus(), 100);
  }, [modelSearchOpen]);

  useEffect(() => {
    if (modelSearchOpen) searchAntennaModels(modelQuery);
  }, [modelSearchOpen, modelQuery, searchAntennaModels]);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (value.trim().length >= 2) searchSites(value);
  };

  return (
    <TooltipProvider>
      <Card size="sm" className="border border-[var(--border-strong)]">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <FieldLabel
              label="Site Selection"
              source={manualMode ? 'Manual' : selectedSiteId ? 'Site data' : null}
              help="Cari konfigurasi site terpasang berdasarkan site ID atau nama cell. Saat dipilih, koordinat, azimuth, tinggi antena, tilt, dan band site akan terisi otomatis."
            />
            <Popover open={siteSearchOpen} onOpenChange={(open) => { setSiteSearchOpen(open); if (!open) setSearchQuery(''); }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" role="combobox" aria-expanded={siteSearchOpen} className="w-full justify-between font-normal" disabled={manualMode}>
                  {selectedSite ? formatSiteLabel(selectedSite) : selectedSiteId || 'Search site from ransys...'}
                  <CaretUpDownIcon className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[480px] p-0" align="start">
                <div className="relative border-b border-border p-2">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={searchInputRef} type="text" placeholder="Type site_id or cell_name..." value={searchQuery} onChange={handleSearchChange} className="pl-8" />
                </div>
                <ScrollArea className="h-[280px]">
                  {siteSearchLoading && <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><CircleNotchIcon className="size-4 animate-spin" />Searching...</div>}
                  {!siteSearchLoading && siteOptions.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{searchQuery.trim().length >= 2 ? 'No sites found.' : 'Type at least 2 characters to search.'}</div>}
                  <div className="p-1">
                    {siteOptions.map((option) => (
                      <button key={option.value} type="button" title={option.label} onClick={() => { selectSite(option.site); setSiteSearchOpen(false); setSearchQuery(''); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                        <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="manual-mode" checked={manualMode} onCheckedChange={(checked) => setManualMode(checked === true)} />
              <FieldLabel htmlFor="manual-mode" label="Manual input" help="Aktifkan untuk mengubah koordinat site secara manual tanpa menggunakan konfigurasi site yang dipilih." />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Latitude" help="Lintang site dalam derajat desimal. Nilai mengikuti site yang dipilih, kecuali Input manual diaktifkan." step={0.000001} value={params.latitude} onChange={set('latitude')} disabled={!manualMode} />
            <NumberField label="Longitude" help="Bujur site dalam derajat desimal. Nilai mengikuti site yang dipilih, kecuali Input manual diaktifkan." step={0.000001} value={params.longitude} onChange={set('longitude')} disabled={!manualMode} />
            <NumberField label="Azimuth" help="Arah hadap antena dalam derajat searah jarum jam dari utara. Pada mode Point-to-Point, nilainya dihitung dari pin target." suffix="°" value={params.azimuth} onChange={set('azimuth')} disabled={targetMode} />
            <NumberField label="Antenna Height" help="Tinggi titik tengah antena di atas permukaan tanah, dalam meter." suffix="m" value={params.antenna_height} onChange={set('antenna_height')} />
            <NumberField label="Mechanical Tilt" help="Downtilt fisik yang diatur melalui dudukan atau braket antena." suffix="°" step={0.5} value={params.mechanical_tilt} onChange={set('mechanical_tilt')} />
            <NumberField label="Electrical Tilt" help="Downtilt elektrik atau RET. Spesifikasi model hanya memvalidasi rentangnya tanpa mengubah nilai konfigurasi site." suffix="°" step={0.5} value={params.electrical_tilt} onChange={set('electrical_tilt')} />
            <NumberField label="Vertical BW" help={verticalBwHelp} source={inputSources?.verticalBeamwidth} suffix="°" step={0.5} value={params.vertical_beamwidth} onChange={set('vertical_beamwidth')} />
            <NumberField label="Horizontal BW" help="Lebar berkas setengah daya secara horizontal. Data site terpasang diprioritaskan; jika tidak tersedia, spesifikasi antena yang cocok dapat menjadi nilai nominal." source={inputSources?.horizontalBeamwidth} suffix="°" value={params.horizontal_beamwidth} onChange={set('horizontal_beamwidth')} />
            <NumberField label="Max Distance" help="Jarak maksimum profil medan dan peta cakupan dari antena. Pada mode Point-to-Point, jaraknya dihitung dari target." suffix="m" step={50} value={params.max_distance} onChange={set('max_distance')} disabled={targetMode} />
            <NumberField label="Sample Interval" help="Jarak antar sampel medan. Nilai yang lebih kecil memberi detail lebih tinggi, tetapi analisis dapat lebih lama." suffix="m" step={5} value={params.sample_interval} onChange={set('sample_interval')} />
          </div>
          {compatibilityWarning && <div role="status" className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300"><WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" /><span>{compatibilityWarning}</span></div>}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="target-mode" checked={targetMode} onCheckedChange={(checked) => setTargetMode(checked === true)} />
              <FieldLabel htmlFor="target-mode" label="Point-to-Point mode" help="Analisis satu lokasi target. Klik Coverage Map untuk membuat pin target, lalu seret pin untuk menyempurnakan posisinya." />
            </div>
            {targetMode && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <NumberField label="Target Latitude" help="Lintang target dalam derajat desimal. Isi langsung atau tempatkan pin pada Coverage Map." step={0.000001} value={params.target_latitude ?? ''} onChange={set('target_latitude')} />
                <NumberField label="Target Longitude" help="Bujur target dalam derajat desimal. Isi langsung atau tempatkan pin pada Coverage Map." step={0.000001} value={params.target_longitude ?? ''} onChange={set('target_longitude')} />
                <div className="col-span-2"><NumberField label="Target Height" help="Tinggi antena atau penerima target di atas permukaan tanah, dalam meter." suffix="m" step={0.5} value={params.target_height} onChange={set('target_height')} /></div>
                <p className="col-span-2 text-[10px] text-muted-foreground">Klik Coverage Map untuk menempatkan atau menyeret pin target. Azimuth dan Max Distance dihitung dari target yang dipilih.</p>
              </div>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <FieldLabel label="Frequency" help="Frekuensi kerja yang digunakan untuk perhitungan RF. Mengubahnya akan memeriksa kembali spesifikasi antena dan Vertical BW." />
              <Select value={String(params.frequency_mhz)} onValueChange={(value) => selectFrequency(parseInt(value, 10))}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCY_OPTIONS.map((frequency) => <SelectItem key={frequency} value={String(frequency)}>{frequency} MHz</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label="Antenna Model" help="Cari model pada katalog antena. Model yang cocok menyediakan nilai beamwidth nominal dan memvalidasi rentang electrical tilt." />
              <Popover open={modelSearchOpen} onOpenChange={(open) => { setModelSearchOpen(open); if (!open) setModelQuery(''); }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" role="combobox" aria-label="Antenna model" aria-expanded={modelSearchOpen} aria-controls="antenna-model-listbox" aria-autocomplete="list" className="w-full justify-between text-left font-normal">
                    <span className="truncate">{selectedAntennaModelLabel || 'Search antenna model...'}</span><CaretUpDownIcon className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(620px,calc(100vw-2rem))] overflow-hidden p-0" align="start" sideOffset={6}>
                  <div className="relative border-b border-border p-2"><MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input ref={modelSearchInputRef} type="text" placeholder="Search canonical models..." value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} className="pl-8" aria-controls="antenna-model-listbox" /></div>
                  <div className="grid min-h-[280px] sm:grid-cols-[minmax(0,1fr)_240px]">
                    <ScrollArea className="h-[280px]">
                      {antennaModelLoading && <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><CircleNotchIcon className="size-3.5 animate-spin" />Loading antenna models...</div>}
                      {!antennaModelLoading && antennaModelError && <div className="flex flex-col items-center gap-2 px-4 py-7 text-center text-xs text-destructive"><WarningCircleIcon className="size-5" /><p>{antennaModelError}</p><Button type="button" variant="outline" size="xs" onClick={() => searchAntennaModels(modelQuery)}>Try again</Button></div>}
                      {!antennaModelLoading && !antennaModelError && antennaModelResults.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">No antenna models match “{modelQuery}”.</div>}
                      <div id="antenna-model-listbox" role="listbox" aria-label="Antenna models" className="space-y-0.5 p-1">
                        {!antennaModelLoading && !antennaModelError && antennaModelResults.map((model) => {
                          const selected = model.antenna_model === selectedAntennaModelLabel;
                          return <button key={model.antenna_model} type="button" role="option" aria-selected={selected} onMouseEnter={() => setPreviewedAntennaModelId(model.antenna_model)} onFocus={() => setPreviewedAntennaModelId(model.antenna_model)} onClick={() => { selectAntennaModel(model); setModelSearchOpen(false); setModelQuery(''); setPreviewedAntennaModelId(model.antenna_model); }} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-foreground">{model.antenna_model}</span><span className="block truncate text-[10px] text-muted-foreground">{[model.vendor, model.series, model.frequency_bands].filter(Boolean).join(' • ') || 'Specification available'}</span></span>{selected && <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />}</button>;
                        })}
                      </div>
                    </ScrollArea>
                    <div className="hidden sm:block"><AntennaModelPreview model={previewedAntennaModel} /></div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <NumberField label="Fresnel Clearance Required" help="Persentase zona Fresnel pertama yang harus tetap bebas halangan agar lintasan dianggap tidak terhalang." suffix="%" step={5} value={params.fresnel_clearance_pct} onChange={set('fresnel_clearance_pct')} />
          <div className="flex flex-col gap-1">
            <FieldLabel label="DEM Source" help="Sumber elevasi medan untuk membentuk profil lintasan. Sumber beresolusi lebih tinggi dapat meningkatkan detail lokal bila tersedia." />
            <Select value={params.dem_source} onValueChange={set('dem_source')}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open_meteo">Open-Meteo (90m bare terrain)</SelectItem><SelectItem value="opentopography">OpenTopography COP30 (30m DSM)</SelectItem></SelectContent></Select>
          </div>

          <Separator />
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Total Tilt:</span><span className="font-mono font-medium text-foreground">{totalTilt}°</span></div>
          <Button onClick={onRun} disabled={loading} className="w-full">{loading ? <><CircleNotchIcon className="animate-spin" />Running...</> : 'Run Analysis'}</Button>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

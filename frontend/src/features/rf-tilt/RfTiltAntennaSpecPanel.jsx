import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Info as InfoIcon,
  Link as LinkIcon,
  Radio as RadioIcon,
} from 'lucide-react';

export default function RfTiltAntennaSpecPanel({ antennaSpec, loading }) {
  if (loading) {
    return (
      <Card size="sm" className="w-full border-dashed animate-pulse">
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          Loading antenna specifications...
        </CardContent>
      </Card>
    );
  }

  if (!antennaSpec) {
    return (
      <Card size="sm" className="w-full border-dashed bg-muted/10">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
          <InfoIcon className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No Antenna Selected</p>
          <p className="text-xs text-muted-foreground/60 max-w-[240px]">
            Select an antenna model from the parameters form to load its canonical specifications.
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    antenna_model,
    vendor,
    series,
    frequency_bands,
    frequency_low_mhz,
    frequency_high_mhz,
    ports,
    connector_type,
    horizontal_beamwidth,
    electrical_tilt_min,
    electrical_tilt_max,
    gain_dbi_by_band,
    vertical_beamwidth_by_band,
    weight_kg,
    height_mm,
    width_mm,
    depth_mm,
    source_url,
    matched,
  } = antennaSpec;

  const hasGain = gain_dbi_by_band && Object.keys(gain_dbi_by_band).length > 0;
  const hasVbw = vertical_beamwidth_by_band && Object.keys(vertical_beamwidth_by_band).length > 0;

  return (
    <Card size="sm" className="w-full overflow-hidden transition-all hover:shadow-md border-border bg-card/60 backdrop-blur-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--primary-light)]">
          <RadioIcon className="size-4" />
          <h2>Antenna Specification</h2>
        </div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b pb-3 border-border">
          <div className="space-y-0.5 min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate" title={antenna_model}>
              {antenna_model}
            </h3>
            {(vendor || series) && (
              <p className="text-xs text-muted-foreground truncate">
                {[vendor, series].filter(Boolean).join(' • ')}
              </p>
            )}
          </div>
          <Badge
            variant={matched ? "success" : "secondary"}
            className={
              matched
                ? "text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20 text-[9px] font-semibold shrink-0 uppercase tracking-wider px-2 py-0.5"
                : "text-muted-foreground bg-muted/40 border-muted-foreground/10 text-[9px] font-semibold shrink-0 uppercase tracking-wider px-2 py-0.5"
            }
          >
            {matched ? "Matched spec" : "generic fallback"}
          </Badge>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Frequency range</span>
            <span className="font-medium text-foreground">
              {frequency_low_mhz && frequency_high_mhz
                ? `${frequency_low_mhz} – ${frequency_high_mhz} MHz`
                : frequency_bands || '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Horizontal Beamwidth</span>
            <span className="font-medium text-foreground">
              {horizontal_beamwidth != null ? `${horizontal_beamwidth}°` : '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Electrical Tilt Range</span>
            <span className="font-medium text-foreground">
              {electrical_tilt_min != null && electrical_tilt_max != null
                ? `${electrical_tilt_min}° – ${electrical_tilt_max}°`
                : '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Ports & Connector</span>
            <span className="font-medium text-foreground">
              {ports != null ? `${ports}p` : ''}
              {ports != null && connector_type ? ' • ' : ''}
              {connector_type || '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Dimensions (H×W×D)</span>
            <span className="font-medium text-foreground">
              {height_mm && width_mm && depth_mm
                ? `${height_mm} × ${width_mm} × ${depth_mm} mm`
                : '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Weight</span>
            <span className="font-medium text-foreground">
              {weight_kg != null ? `${weight_kg} kg` : '—'}
            </span>
          </div>
        </div>

        {/* Detailed band info if available */}
        {(hasGain || hasVbw) && (
          <div className="rounded-lg bg-muted/30 p-2 text-xs space-y-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider block">Gain & Vertical Beamwidth by Band</span>
            <div className="grid grid-cols-1 gap-1 text-[11px]">
              {hasGain && Object.entries(gain_dbi_by_band).map(([band, gain]) => {
                const vbw = vertical_beamwidth_by_band?.[band];
                return (
                  <div key={band} className="flex justify-between items-center text-muted-foreground hover:text-foreground">
                    <span className="font-mono">{band} MHz</span>
                    <span className="font-medium">
                      {gain} dBi {vbw != null ? ` • VBW: ${vbw}°` : ''}
                    </span>
                  </div>
                );
              })}
              {!hasGain && hasVbw && Object.entries(vertical_beamwidth_by_band).map(([band, vbw]) => (
                <div key={band} className="flex justify-between items-center text-muted-foreground">
                  <span className="font-mono">{band} MHz</span>
                  <span className="font-medium">VBW: {vbw}°</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Datasheet Link */}
        {source_url && (
          <div className="pt-1 border-t border-border flex justify-end">
            <a
              href={source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-600 transition-colors font-medium"
            >
              <LinkIcon className="size-3.5" />
              Official Datasheet ↗
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

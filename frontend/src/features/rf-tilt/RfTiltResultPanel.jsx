import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RF_COLORS } from './rfTiltChartConfig';

const COLORS = {
  lower:   RF_COLORS.impactLower,   // same red as chart lower beam
  main:    RF_COLORS.impactMain,    // same cyan as chart main beam
  upper:   RF_COLORS.impactUpper,   // same amber as chart upper beam
  fresnel: RF_COLORS.fresnel,       // orange
};

function StatRow({ label, value, color, icon }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs group">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {icon && (
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: color || 'var(--text-secondary)' }}
          />
        )}
        {label}
      </span>
      <span className="font-mono font-medium" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

export default function RfTiltResultPanel({ result, clutterCount, selectedSiteId }) {
  if (!result) return null;

  return (
    <>
      <Card size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[var(--primary-light)] flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <path d="M4 9L6 5L8 7L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
            </svg>
            Result Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0.5">
          <StatRow label="Selected site" value={selectedSiteId || 'Manual input'} />
          <StatRow label="DEM source" value={result.dem_source_used} />
          <StatRow label="Buildings detected" value={clutterCount ?? 0} />
          <StatRow label="Site elevation" value={`${Math.round(result.site_elevation)} m`} />

          <Separator className="my-2" />

          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1">
            Beam Impact Points
          </p>
          <StatRow
            icon
            label="Lower beam"
            value={result.near_m != null ? `${Math.round(result.near_m)} m` : '— clear'}
            color={COLORS.lower}
          />
          <StatRow
            icon
            label="Main beam (LOS)"
            value={result.main_m != null ? `${Math.round(result.main_m)} m` : '— clear'}
            color={COLORS.main}
          />
          <StatRow
            icon
            label="Upper beam"
            value={result.far_m != null ? `${Math.round(result.far_m)} m` : '— clear'}
            color={COLORS.upper}
          />

          <Separator className="my-2" />

          <StatRow
            icon
            label={`Fresnel (${result.fresnel_clearance_pct}% @ ${result.frequency_mhz} MHz)`}
            value={result.practical_main_m != null ? `${Math.round(result.practical_main_m)} m` : 'n/a'}
            color={COLORS.fresnel}
          />
          {result.practical_main_m != null && result.main_m != null &&
            result.practical_main_m < result.main_m && (
            <p className="text-[10px] text-[var(--warning)] pl-3.5 pb-1">
              ⚡ Diffraction loss starts {Math.round(result.main_m - result.practical_main_m)} m before hard LOS block.
            </p>
          )}

          {result.antenna_reference && (
            <>
              <Separator className="my-2" />
              <div className="rounded-md bg-muted/30 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Antenna Reference
                  </p>
                  {result.antenna_reference.matched ? (
                    <Badge variant="secondary" className="text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20 text-[9px]">
                      {result.antenna_reference.match_method === 'fuzzy' ? 'Fuzzy Match' : 'Matched'}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20 text-[9px]">
                      Generic
                    </Badge>
                  )}
                </div>
                {result.antenna_reference.antenna_model && (
                  <p className="text-xs font-medium text-foreground">
                    {result.antenna_reference.antenna_model}
                    {result.antenna_reference.vendor && ` (${result.antenna_reference.vendor})`}
                  </p>
                )}
                {result.antenna_reference.series && (
                  <p className="text-xs text-muted-foreground">
                    Series: {result.antenna_reference.series} @ {result.antenna_reference.frequency_mhz}MHz
                  </p>
                )}
                <div className="grid grid-cols-3 gap-1 text-xs">
                  {result.antenna_reference.gain_dbi != null && (
                    <div>
                      <span className="text-muted-foreground/60">Gain: </span>
                      <span className="font-mono">{result.antenna_reference.gain_dbi} dBi</span>
                    </div>
                  )}
                  {result.antenna_reference.vertical_beamwidth_deg != null && (
                    <div>
                      <span className="text-muted-foreground/60">VBW: </span>
                      <span className="font-mono">{result.antenna_reference.vertical_beamwidth_deg}°</span>
                    </div>
                  )}
                  {result.antenna_reference.horizontal_beamwidth_deg != null && (
                    <div>
                      <span className="text-muted-foreground/60">HBW: </span>
                      <span className="font-mono">{result.antenna_reference.horizontal_beamwidth_deg}°</span>
                    </div>
                  )}
                </div>
                {result.antenna_reference.source_url && (
                  <a
                    href={result.antenna_reference.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:underline"
                  >
                    Source ↗
                  </a>
                )}
                {result.antenna_reference.note && (
                  <p className="text-[10px] text-muted-foreground/60">
                    {result.antenna_reference.note}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result.link && (
        <Card size="sm" className="border-[#a78bfa]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-[#a78bfa] flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="3" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
              </svg>
              Point-to-Point Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <StatRow
              label="Distance / Azimuth"
              value={`${Math.round(result.link.distance_m)} m @ ${result.link.azimuth_deg.toFixed(1)}°`}
            />
            <div className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-muted-foreground">LOS</span>
              {result.link.los_clear ? (
                <Badge variant="secondary" className="text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20">
                  ✓ Clear
                </Badge>
              ) : (
                <Badge variant="destructive">
                  ✗ Blocked @ {Math.round(result.link.los_obstruction_distance)} m
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-muted-foreground">Fresnel ({result.fresnel_clearance_pct}%)</span>
              {result.link.fresnel_clear ? (
                <Badge variant="secondary" className="text-[var(--success)] bg-[var(--success)]/10 border-[var(--success)]/20">
                  ✓ Clear
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/20">
                  ⚠ Violated @ {Math.round(result.link.fresnel_obstruction_distance)} m
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

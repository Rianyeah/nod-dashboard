import { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Customized,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartLegend,
} from '@/components/ui/chart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { rfTiltChartConfig, RF_COLORS } from './rfTiltChartConfig';

const C = RF_COLORS;
const GRID_COLOR = 'rgba(148,163,184,0.12)';
const AXIS_COLOR = 'rgba(148,163,184,0.45)';

/* ═══ SVG defs injected into the chart ═══════════════════════════════ */
function ChartDefs() {
  return (
    <defs>
      <linearGradient id="rfTerrainGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={C.terrainFillTop}    stopOpacity={0.75} />
        <stop offset="100%" stopColor={C.terrainFillBottom} stopOpacity={0.95} />
      </linearGradient>
      <filter id="rfBeamGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/* ═══ Lattice cell tower SVG ═════════════════════════════════════════ */
function CellTowerSVG({ x, y, h = 48 }) {
  if (x == null || y == null || !isFinite(x) || !isFinite(y)) return null;
  const topY = y - h;
  const bw = h * 0.28;  // half-width at base
  const tw = h * 0.06;  // half-width at top
  const lb = x - bw, rb = x + bw, lt = x - tw, rt = x + tw;
  const lvl = [0.25, 0.50, 0.75];
  return (
    <g>
      {/* Foundation */}
      <rect x={lb - 2} y={y - 1} width={(bw + 2) * 2} height={3} rx={1.5} fill={C.towerBrace} opacity={0.5} />
      {/* Legs */}
      <line x1={lb} y1={y} x2={lt} y2={topY + 6} stroke={C.towerStruct} strokeWidth={1.8} />
      <line x1={rb} y1={y} x2={rt} y2={topY + 6} stroke={C.towerStruct} strokeWidth={1.8} />
      {/* Cross-bars + X braces */}
      {lvl.map((p, i) => {
        const py = y - h * p;
        const lx = lb + (lt - lb) * p, rx2 = rb + (rt - rb) * p;
        const np = lvl[i + 1];
        return (
          <g key={i}>
            <line x1={lx} y1={py} x2={rx2} y2={py} stroke={C.towerBrace} strokeWidth={1.2} />
            {np != null && (() => {
              const npy = y - h * np;
              const nlx = lb + (lt - lb) * np, nrx = rb + (rt - rb) * np;
              return (
                <>
                  <line x1={lx} y1={py} x2={nrx} y2={npy} stroke={C.towerDiag} strokeWidth={0.7} />
                  <line x1={rx2} y1={py} x2={nlx} y2={npy} stroke={C.towerDiag} strokeWidth={0.7} />
                </>
              );
            })()}
          </g>
        );
      })}
      {/* Mast */}
      <line x1={x} y1={topY + 6} x2={x} y2={topY - 8} stroke="#e2e8f0" strokeWidth={1.8} />
      {/* Antenna panels */}
      <rect x={x - 2} y={topY - 4} width={4} height={10} rx={1} fill={C.main} opacity={0.9} />
      <rect x={x - 8} y={topY - 2} width={3.5} height={8} rx={1} fill={C.main} opacity={0.55}
        transform={`rotate(-12 ${x - 6} ${topY + 2})`} />
      <rect x={x + 4.5} y={topY - 2} width={3.5} height={8} rx={1} fill={C.main} opacity={0.55}
        transform={`rotate(12 ${x + 6} ${topY + 2})`} />
      {/* Beacon */}
      <circle cx={x} cy={topY - 8} r={2.2} fill={C.beacon} opacity={0.9} />
      <circle cx={x} cy={topY - 8} r={4}   fill={C.beacon} opacity={0.2} />
      {/* Panel glow */}
      <circle cx={x} cy={topY + 1} r={6} fill={C.main} opacity={0.08} />
    </g>
  );
}

/* ═══ Renders the tower using Y/X axis scales from the chart ═══════ */
function TowerAtOrigin(props) {
  const { xAxisMap, yAxisMap, chartData: data } = props;
  if (!xAxisMap || !yAxisMap || !data?.length) return null;
  const xAxis = Object.values(xAxisMap)[0];
  const yAxis = Object.values(yAxisMap)[0];
  if (!xAxis?.scale || !yAxis?.scale) return null;
  const pt = data[0];
  if (pt.towerTop == null) return null;
  const x = xAxis.scale(pt.distance);
  const yBase = yAxis.scale(pt.terrain);
  const yTop = yAxis.scale(pt.towerTop);
  if (!isFinite(x) || !isFinite(yBase) || !isFinite(yTop)) return null;
  const h = Math.max(yBase - yTop, 20);
  return <CellTowerSVG x={x} y={yBase} h={h} />;
}

/* ═══ Custom tooltip ═════════════════════════════════════════════════ */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const colors = {
    terrain: C.terrainStroke, main: C.main, upper: C.upper,
    lower: C.lower, link: C.link,
  };
  return (
    <div style={{
      background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(148,163,184,0.15)', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
        Distance: {label}m
      </div>
      {payload
        .filter(p => p.value != null && p.dataKey !== 'towerTop')
        .map(p => {
          const c = colors[p.dataKey] || '#e2e8f0';
          return (
            <div key={p.dataKey} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, padding: '2px 0', fontSize: 12,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: c }}>
                <span style={{
                  width: 8, height: 8, display: 'inline-block', flexShrink: 0,
                  borderRadius: p.dataKey === 'terrain' ? 2 : '50%', background: c,
                }} />
                {p.name}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>
                {Math.round(p.value)}m
              </span>
            </div>
          );
        })}
    </div>
  );
}

/* ═══ Custom legend ══════════════════════════════════════════════════ */
function CustomLegend({ payload }) {
  if (!payload?.length) return null;
  const colorMap = {
    Terrain: C.terrainStroke, 'Main Beam': C.main, 'Upper Beam': C.upper,
    'Lower Beam': C.lower, 'Link Line (P2P)': C.link,
  };
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', gap: 18, paddingTop: 10, flexWrap: 'wrap',
    }}>
      {payload.filter(p => p.value !== 'Tower').map(entry => {
        const c = colorMap[entry.value] || entry.color;
        const dashed = entry.value === 'Upper Beam' || entry.value === 'Lower Beam';
        return (
          <div key={entry.value} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8',
          }}>
            {entry.value === 'Terrain' ? (
              <span style={{
                width: 12, height: 8, borderRadius: 2, display: 'inline-block', flexShrink: 0,
                background: `linear-gradient(180deg, ${C.terrainFillTop}, ${C.terrainFillBottom})`,
                border: `1px solid ${C.terrainStroke}`,
              }} />
            ) : (
              <span style={{
                width: 16, height: 0, display: 'inline-block', flexShrink: 0,
                borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${c}`,
              }} />
            )}
            <span>{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Chart Component
   ═══════════════════════════════════════════════════════════════════════ */
export default function RfTiltChart({ result }) {
  const antennaHeight = result?.antenna_height ?? 0;

  const { chartData, yMin, yMax } = useMemo(() => {
    if (!result) return { chartData: [], yMin: 0, yMax: 0 };
    const raw = result.terrain_profile.map((tp, i) => ({
      distance: Math.round(tp.distance),
      terrain: Math.round(tp.elevation),
      main:  Math.round(result.main_beam.profile[i]?.elevation ?? 0),
      upper: Math.round(result.upper_beam.profile[i]?.elevation ?? 0),
      lower: Math.round(result.lower_beam.profile[i]?.elevation ?? 0),
      link:  result.link ? Math.round(result.link.profile[i]?.elevation ?? 0) : undefined,
    }));

    // Clip beams at terrain
    const clipped = raw.map((pt, i) => {
      const c = { ...pt };
      if (i === 0) return c;
      if (c.main  != null && c.main  <= c.terrain) c.main  = null;
      if (c.upper != null && c.upper <= c.terrain) c.upper = null;
      if (c.lower != null && c.lower <= c.terrain) c.lower = null;
      if (c.link  != null && c.link  <= c.terrain) c.link  = null;
      return c;
    });

    // Once killed, stay killed
    const killed = {};
    for (const pt of clipped) {
      for (const k of ['main', 'upper', 'lower', 'link']) {
        if (killed[k]) pt[k] = null;
        else if (pt[k] === null) killed[k] = true;
      }
    }

    // Tower top — invisible data point for Y domain and tower icon positioning
    if (clipped.length > 0) {
      clipped[0].towerTop = clipped[0].terrain + antennaHeight;
    }

    // Y domain
    let lo = Infinity, hi = -Infinity;
    for (const pt of clipped) {
      for (const k of ['terrain', 'main', 'upper', 'lower', 'link', 'towerTop']) {
        if (pt[k] != null) { lo = Math.min(lo, pt[k]); hi = Math.max(hi, pt[k]); }
      }
    }
    const rng = hi - lo || 20;
    const pad = Math.max(rng * 0.12, 10);

    return { chartData: clipped, yMin: Math.floor(lo - pad), yMax: Math.ceil(hi + pad) };
  }, [result, antennaHeight]);

  if (!result) return null;

  return (
    <Card size="sm" className="overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold text-[var(--primary-light)] flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L6 7H10L8 1Z" fill="currentColor" opacity="0.7"/>
            <path d="M5 15L8 5L11 15" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="6.5" y1="8" x2="9.5" y2="8" stroke="currentColor" strokeWidth="0.8"/>
          </svg>
          Terrain Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ChartContainer config={rfTiltChartConfig} className="h-[320px] w-full">
          <ComposedChart data={chartData} margin={{ top: 14, right: 16, left: 4, bottom: 4 }}>
            <Customized component={ChartDefs} />
            <CartesianGrid strokeDasharray="3 6" stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="distance" stroke={AXIS_COLOR} fontSize={10} unit="m"
              tickLine={false} axisLine={{ stroke: AXIS_COLOR, strokeWidth: 0.5 }}
            />
            <YAxis
              stroke={AXIS_COLOR} fontSize={10} domain={[yMin, yMax]} unit="m"
              tickLine={false} axisLine={{ stroke: AXIS_COLOR, strokeWidth: 0.5 }} width={52}
            />
            <ChartTooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'rgba(148,163,184,0.2)', strokeWidth: 1 }}
            />

            {/* Terrain */}
            <Area
              type="monotone" dataKey="terrain" name="Terrain"
              fill="url(#rfTerrainGrad)" stroke={C.terrainStroke}
              strokeWidth={1.5} fillOpacity={1}
              animationDuration={800}
            />

            {/* Tower icon — positioned using Y/X axis scales */}
            <Customized component={TowerAtOrigin} chartData={chartData} />
            {/* Invisible line to include towerTop in Y domain */}
            <Line
              type="monotone" dataKey="towerTop" name="Tower"
              stroke="transparent" strokeWidth={0}
              dot={false} activeDot={false}
              legendType="none" connectNulls={false}
              isAnimationActive={false}
            />

            {/* Main beam */}
            <Line
              type="monotone" dataKey="main" name="Main Beam"
              stroke={C.main} dot={false} strokeWidth={2.5}
              connectNulls={false} filter="url(#rfBeamGlow)"
              animationDuration={1000}
            />
            {/* Upper beam */}
            <Line
              type="monotone" dataKey="upper" name="Upper Beam"
              stroke={C.upper} dot={false} strokeWidth={1.5}
              strokeDasharray="6 3" connectNulls={false}
              animationDuration={1000}
            />
            {/* Lower beam */}
            <Line
              type="monotone" dataKey="lower" name="Lower Beam"
              stroke={C.lower} dot={false} strokeWidth={1.5}
              strokeDasharray="6 3" connectNulls={false}
              animationDuration={1000}
            />
            {/* P2P link */}
            {result.link && (
              <Line
                type="monotone" dataKey="link" name="Link Line (P2P)"
                stroke={C.link} dot={false} strokeWidth={2}
                connectNulls={false} animationDuration={1000}
              />
            )}

            {/* Reference lines */}
            {result.main_m != null && (
              <ReferenceLine
                x={Math.round(result.main_m)} stroke={C.main}
                strokeDasharray="3 3" strokeWidth={1}
                label={{ value: '◆ LOS', fontSize: 10, fill: C.main, fontWeight: 600 }}
              />
            )}
            {result.practical_main_m != null && result.practical_main_m !== result.main_m && (
              <ReferenceLine
                x={Math.round(result.practical_main_m)} stroke={C.fresnel}
                strokeDasharray="3 3" strokeWidth={1}
                label={{ value: '◆ Fresnel', fontSize: 10, fill: C.fresnel, fontWeight: 600 }}
              />
            )}

            <ChartLegend content={<CustomLegend />} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

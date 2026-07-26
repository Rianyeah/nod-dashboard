import { MONOPOLE_TOWER, normalizeCids } from './towerPlanState.js';
import {
  TOWER_DRAWING_LAYOUT,
  getTowerGeometry,
} from './towerPlanGeometry.js';
import {
  buildElevationRings,
  radiusForHeight,
} from './towerPlanHelicopter.js';

const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const polar = (cx, cy, radius, bearing) => {
  const radians = Number(bearing) * Math.PI / 180;
  return {
    x: cx + Math.sin(radians) * radius,
    y: cy - Math.cos(radians) * radius,
  };
};

function coloredArrowHead(x, y, bearing, color) {
  const tail = polar(x, y, 8, Number(bearing) + 180);
  const left = polar(tail.x, tail.y, 4, Number(bearing) + 90);
  const right = polar(tail.x, tail.y, 4, Number(bearing) - 90);
  return `<path data-arrow-color="${escapeXml(color)}" d="M${x} ${y} L${left.x} ${left.y} L${right.x} ${right.y} Z" fill="${escapeXml(color)}"/>`;
}

function projectPoint(point, towerHeight, geometry) {
  const height = Math.max(0, Math.min(towerHeight, Number(point.height) || 0));
  const taper = 0.18 + 0.82 * (1 - height / towerHeight);
  const depthScale = 1 + 0.22 * point.z;
  return {
    x: geometry.towerCenterX + point.x * 128 * taper * depthScale,
    y: TOWER_DRAWING_LAYOUT.towerBaseY
      - height * (TOWER_DRAWING_LAYOUT.towerVerticalSpan / towerHeight)
      + point.z * 28 * taper,
  };
}

function installationPoint(geometry, position) {
  return geometry.installationPoints.find((point) => point.id === position)
    || geometry.installationPoints[0];
}

function groundPad(points) {
  if (points.length < 2) return '';
  const center = points.reduce(
    (result, point) => ({ x: result.x + point.x, y: result.y + point.y }),
    { x: 0, y: 0 },
  );
  center.x /= points.length;
  center.y /= points.length;
  const expanded = points.map((point) => ({
    x: center.x + (point.x - center.x) * 1.17,
    y: center.y + (point.y - center.y) * 1.17 + 12,
  }));
  return `<path d="M${expanded.map((point) => `${point.x} ${point.y}`).join(' L')} Z" fill="#d8d4cc" stroke="#9f9789"/>`;
}

function latticeStructure(towerHeight, geometry) {
  const positions = geometry.positions;
  const levels = Array.from({ length: 13 }, (_, index) => (
    index === 12 ? towerHeight : index * towerHeight / 12
  ));
  const projected = (position, height) => projectPoint(
    { ...installationPoint(geometry, position), height },
    towerHeight,
    geometry,
  );
  const faces = positions.map((position, index) => (
    [position, positions[(index + 1) % positions.length]]
  ));
  const legs = positions.map((position) => {
    const bottom = projected(position, 0);
    const top = projected(position, towerHeight);
    return `<line x1="${bottom.x}" y1="${bottom.y}" x2="${top.x}" y2="${top.y}" stroke="url(#steel)" stroke-width="12"/>`;
  }).join('');
  const rings = levels.map((height) => {
    const points = positions.map((position) => projected(position, height));
    return `<path d="M${points.map((point) => `${point.x} ${point.y}`).join(' L')} Z" fill="none" stroke="#64748b" stroke-width="3"/>`;
  }).join('');
  const braces = levels.slice(0, -1).map((height, levelIndex) => (
    faces.map(([first, second]) => {
      const a = projected(first, height);
      const b = projected(second, height);
      const c = projected(first, levels[levelIndex + 1]);
      const d = projected(second, levels[levelIndex + 1]);
      return `<path d="M${a.x} ${a.y} L${d.x} ${d.y} M${b.x} ${b.y} L${c.x} ${c.y}" fill="none" stroke="#94a3b8" stroke-width="2"/>`;
    }).join('')
  )).join('');
  const footPoints = geometry.feet.map((foot) => projectPoint(
    { ...foot, height: 0 },
    towerHeight,
    geometry,
  ));
  const feet = geometry.feet.map((foot, index) => {
    const point = footPoints[index];
    return `
      <g>
        <rect data-foot-plate="${foot.id}" x="${point.x - 24}" y="${point.y - 7}" width="48" height="17" rx="3" fill="#cbd5e1" stroke="#475569"/>
        <circle cx="${point.x}" cy="${point.y + 48}" r="20" fill="#17263b"/>
        <text data-installation-label="${foot.id}" x="${point.x}" y="${point.y + 54}" text-anchor="middle" fill="#fff" font-size="19" font-weight="800">${foot.id}</text>
        <text x="${point.x}" y="${point.y + 77}" text-anchor="middle" fill="#17263b" font-size="11" font-weight="700">LEG ${foot.id}</text>
      </g>`;
  }).join('');
  return `${groundPad(footPoints)}${legs}${rings}${braces}${feet}`;
}

function monopoleStructure(towerHeight, geometry) {
  const base = projectPoint({ x: 0, z: 0, height: 0 }, towerHeight, geometry);
  const top = projectPoint({ x: 0, z: 0, height: towerHeight }, towerHeight, geometry);
  const anchorBolts = Array.from({ length: 6 }, (_, index) => {
    const point = polar(base.x, base.y + 6, 31, index * 60);
    return `<circle data-anchor-bolt="${index + 1}" cx="${point.x}" cy="${point.y}" r="4.5" fill="#475569"/>`;
  }).join('');
  const seams = [0.25, 0.5, 0.75].map((fraction) => {
    const y = base.y - (base.y - top.y) * fraction;
    const halfWidth = 26 - 18 * fraction;
    return `<line x1="${base.x - halfWidth}" y1="${y}" x2="${base.x + halfWidth}" y2="${y}" stroke="#64748b" stroke-width="3"/>`;
  }).join('');
  return `
    <ellipse cx="${base.x}" cy="${base.y + 18}" rx="68" ry="22" fill="#d8d4cc" stroke="#9f9789"/>
    <path d="M${base.x - 27} ${base.y} L${top.x - 8} ${top.y} L${top.x + 8} ${top.y} L${base.x + 27} ${base.y} Z" fill="url(#steel)" stroke="#354454" stroke-width="3"/>
    ${seams}
    <ellipse data-foot-plate="BASE" cx="${base.x}" cy="${base.y + 6}" rx="48" ry="15" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
    ${anchorBolts}
    <text x="${base.x}" y="${base.y + 58}" text-anchor="middle" fill="#17263b" font-size="11" font-weight="800">MONOPOLE BASE</text>`;
}

function towerStructure(towerHeight, geometry) {
  const structure = geometry.structureKind === 'monopole'
    ? monopoleStructure(towerHeight, geometry)
    : latticeStructure(towerHeight, geometry);
  return `<g data-structure-kind="${geometry.structureKind}" filter="url(#towerShadow)">${structure}</g>`;
}

function antennaCallouts(state, towerHeight, geometry) {
  const antennas = [...(state.antennas || [])]
    .sort((a, b) => Number(b.height) - Number(a.height));
  return antennas.map((antenna, index) => {
    const world = installationPoint(geometry, antenna.leg);
    const anchor = projectPoint({ ...world, height: antenna.height }, towerHeight, geometry);
    const left = world.x < 0;
    const direction = left ? -1 : 1;
    const mastX = anchor.x + direction * 42;
    const mastY = anchor.y - 30;
    const cardX = left ? 62 : 688;
    const cardY = Math.max(180, Math.min(910, 205 + index * 105));
    const cardWidth = 274;
    const edgeX = left ? cardX + cardWidth : cardX;
    const elbowX = left ? 345 : 668;
    const color = escapeXml(antenna.color);
    const cids = normalizeCids(antenna.cids ?? antenna.cid);
    const cidText = cids.length ? cids.join(', ') : 'N/A';
    const positionLabel = state.towerType === MONOPOLE_TOWER ? 'SIDE' : 'LEG';
    return `<g>
      <line x1="${anchor.x}" y1="${anchor.y}" x2="${mastX}" y2="${mastY + 30}" stroke="#64748b" stroke-width="5"/>
      <rect x="${mastX - 13}" y="${mastY - 42}" width="26" height="84" rx="5" fill="${color}" stroke="#fff" stroke-width="3"/>
      <path d="M${mastX} ${mastY} L${elbowX} ${cardY + 30} L${edgeX} ${cardY + 30}" fill="none" stroke="${color}" stroke-width="2.5"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="92" rx="7" fill="#fff" stroke="${color}" stroke-width="1.5"/>
      <path d="M${cardX + 7} ${cardY} H${cardX + cardWidth - 7} Q${cardX + cardWidth} ${cardY} ${cardX + cardWidth} ${cardY + 7} V${cardY + 29} H${cardX} V${cardY + 7} Q${cardX} ${cardY} ${cardX + 7} ${cardY}" fill="${color}"/>
      <text x="${cardX + 12}" y="${cardY + 20}" fill="#fff" font-size="13" font-weight="800">${index + 1}. ${escapeXml(antenna.name.toUpperCase())}</text>
      <text x="${cardX + 13}" y="${cardY + 48}" fill="#26384d" font-size="12">SECTOR: ${escapeXml(antenna.sector)} · ${positionLabel}: ${escapeXml(antenna.leg)} · ${Number(antenna.height).toFixed(1)} m</text>
      <text x="${cardX + 13}" y="${cardY + 66}" fill="#26384d" font-size="12">AZIMUTH: ${Number(antenna.azimuth).toFixed(1)}°</text>
      <text x="${cardX + 13}" y="${cardY + 83}" fill="#26384d" font-size="12">CID(S): ${escapeXml(cidText)}</text>
    </g>`;
  }).join('');
}

function helicopterView(state, geometry) {
  const {
    x, y, width, height,
  } = geometry.helicopterPanel;
  const cx = x + width / 2;
  const cy = y + 180;
  const bearing = Number(state.legABearingDeg) || 0;
  const positionPoints = Object.fromEntries(geometry.positions.map((position, index) => [
    position,
    polar(cx, cy, 35, bearing + index * geometry.interval),
  ]));
  const rings = buildElevationRings(state.antennas);
  const ringMarkup = rings.map(({ height: ringHeight, radius }, index) => `
  <circle data-elevation-ring="${escapeXml(ringHeight)}"
    cx="${cx}" cy="${cy}" r="${radius}" fill="none"
    stroke="#d3dce7" stroke-width="1.5"/>
  <text x="${cx + radius + 5}" y="${cy + (index % 2 === 0 ? -3 : 10)}"
    fill="#637389" font-size="9">${ringHeight} m</text>
`).join('');
  const footprint = geometry.structureKind === 'monopole'
    ? `<circle cx="${cx}" cy="${cy}" r="23" fill="#eef2f6" stroke="#58697c" stroke-width="3"/>`
    : `<path d="M${geometry.positions.map((position) => {
      const point = positionPoints[position];
      return `${point.x} ${point.y}`;
    }).join(' L')} Z" fill="#eef2f6" stroke="#58697c" stroke-width="3"/>`;
  const labels = geometry.positions.map((position) => {
    const point = positionPoints[position];
    return `<g data-installation-label="${position}">
      <circle cx="${point.x}" cy="${point.y}" r="11" fill="#17263b"/>
      <text x="${point.x}" y="${point.y + 4}" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">${position}</text>
    </g>`;
  }).join('');
  const overlapCounts = new Map();
  const antennas = (state.antennas || []).map((antenna) => {
    const positionIndex = Math.max(0, geometry.positions.indexOf(antenna.leg));
    const positionPoint = positionPoints[antenna.leg] || positionPoints[geometry.positions[0]];
    const positionBearing = bearing + positionIndex * geometry.interval;
    const overlapKey = `${antenna.leg}|${Number(antenna.height)}|${Number(antenna.azimuth)}`;
    const occurrence = overlapCounts.get(overlapKey) || 0;
    overlapCounts.set(overlapKey, occurrence + 1);
    const tangent = polar(0, 0, occurrence * 6, positionBearing + 90);
    const startRing = radiusForHeight(rings, antenna.height);
    const startBase = polar(
      cx,
      cy,
      startRing,
      positionBearing,
    );
    const start = {
      x: startBase.x + tangent.x,
      y: startBase.y + tangent.y,
    };
    const end = polar(start.x, start.y, 45, Number(antenna.azimuth));
    const shiftedPosition = {
      x: positionPoint.x + tangent.x,
      y: positionPoint.y + tangent.y,
    };
    const azimuth = Number(antenna.azimuth);
    const azimuthLabel = Number.isFinite(azimuth) ? String(azimuth) : '';
    const color = antenna.color;
    return `<g data-top-antenna="${escapeXml(antenna.id)}" data-overlap-index="${occurrence}">
      <line x1="${shiftedPosition.x}" y1="${shiftedPosition.y}" x2="${start.x}" y2="${start.y}" stroke="${escapeXml(color)}" stroke-dasharray="3 3"/>
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${escapeXml(color)}" stroke-width="3"/>
      ${coloredArrowHead(end.x, end.y, azimuth, color)}
      <text x="${end.x}" y="${end.y - 6}" text-anchor="middle" fill="#24364a" font-size="9" font-weight="700">SEC ${escapeXml(antenna.sector)} | ${escapeXml(azimuthLabel)}°</text>
    </g>`;
  }).join('');
  const footerLabel = state.towerType === MONOPOLE_TOWER
    ? 'Mounting Side A bearing'
    : 'Leg A bearing';
  return `<g data-helicopter-panel="true">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="9" fill="#fff" stroke="#7f8fa2" stroke-width="1.5"/>
    <path d="M${x + 9} ${y} H${x + width - 9} Q${x + width} ${y} ${x + width} ${y + 9} V${y + 34} H${x} V${y + 9} Q${x} ${y} ${x + 9} ${y}" fill="#17263b"/>
    <text x="${x + width / 2}" y="${y + 23}" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">HELICOPTER VIEW</text>
    <text x="${cx}" y="${y + 57}" text-anchor="middle" fill="#17263b" font-size="11" font-weight="800">N · 0°</text>
    <line x1="${cx}" y1="${y + 65}" x2="${cx}" y2="${y + 94}" stroke="#17263b" stroke-width="2" marker-end="url(#arrowDark)"/>
    ${ringMarkup}${footprint}${labels}${antennas}
    <text x="${x + 12}" y="${y + height - 14}" fill="#5e6f84" font-size="9">${footerLabel}: ${Number(state.legABearingDeg).toFixed(1)}° · North fixed</text>
  </g>`;
}

export function renderTowerPlanSvg(state) {
  const geometry = getTowerGeometry(state.towerType);
  const towerHeight = Math.max(Number(state.towerHeight) || 1, 1);
  const guideHeights = [...new Set((state.antennas || []).map(
    (antenna) => Number(antenna.height),
  ))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const guides = guideHeights.map((height) => {
    const point = projectPoint({ x: 0, z: 0, height }, towerHeight, geometry);
    return `<text x="100" y="${point.y + 5}" text-anchor="end" fill="#17263b" font-size="17" font-weight="800">${height.toFixed(1)} m</text>
      <line x1="118" y1="${point.y}" x2="325" y2="${point.y}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 6"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536" role="img" aria-label="${escapeXml(state.towerType)} plan">
  <defs>
    <linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#354454"/><stop offset=".46" stop-color="#d8dde2"/><stop offset="1" stop-color="#48586a"/></linearGradient>
    <filter id="towerShadow" x="-25%" y="-10%" width="150%" height="135%"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-color="#1d2939" flood-opacity=".18"/></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#1769e0"/></marker>
    <marker id="arrowDark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#17263b"/></marker>
  </defs>
  <rect width="1024" height="1536" fill="#ffffff"/>
  <text x="512" y="55" text-anchor="middle" fill="#111827" font-size="34" font-weight="900">${escapeXml(state.planTitle || 'UNTITLED PLAN')}</text>
  <text x="512" y="90" text-anchor="middle" fill="#111827" font-size="21" font-weight="800">SITE: <tspan fill="#1769e0">${escapeXml(state.siteName || '—')}</tspan></text>
  <rect x="28" y="118" width="145" height="31" rx="6" fill="#17263b"/>
  <text x="100" y="139" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">TOWER HEIGHT</text>
  <line x1="42" y1="165" x2="42" y2="1190" stroke="#17263b" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="23" y="680" transform="rotate(-90 23 680)" text-anchor="middle" fill="#17263b" font-size="14" font-weight="800">${towerHeight.toFixed(1)} m OVERALL TOWER HEIGHT</text>
  ${guides}
  ${towerStructure(towerHeight, geometry)}
  ${antennaCallouts(state, towerHeight, geometry)}
  ${helicopterView(state, geometry)}
  <g>
    <rect x="35" y="1385" width="410" height="120" rx="8" fill="#fff" stroke="#8493a6"/>
    <rect x="35" y="1385" width="410" height="30" rx="8" fill="#17263b"/>
    <text x="240" y="1405" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">SITE DATA</text>
    <text x="55" y="1440" fill="#26384d" font-size="12">SITE ID: <tspan font-weight="700">${escapeXml(state.siteName || '—')}</tspan></text>
    <text x="55" y="1465" fill="#26384d" font-size="12">TOWER: <tspan font-weight="700">${escapeXml(String(state.towerType).toUpperCase())}</tspan></text>
    <text x="55" y="1490" fill="#26384d" font-size="12">HEIGHT: <tspan font-weight="700">${towerHeight.toFixed(1)} m</tspan></text>
  </g>
  <g>
    <rect x="460" y="1385" width="225" height="120" rx="8" fill="#fff" stroke="#8493a6"/>
    <rect x="460" y="1385" width="225" height="30" rx="8" fill="#17263b"/>
    <text x="572" y="1405" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">LEGEND</text>
    <rect x="480" y="1430" width="22" height="22" rx="3" fill="#334155"/><text x="512" y="1446" fill="#26384d" font-size="11">Existing</text>
    <rect x="480" y="1464" width="22" height="22" rx="3" fill="#1769e0"/><text x="512" y="1480" fill="#26384d" font-size="11">New</text>
  </g>
</svg>`;
}

export function towerPlanSvgDataUrl(state) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderTowerPlanSvg(state))}`;
}

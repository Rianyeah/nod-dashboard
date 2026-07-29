import { MONOPOLE_TOWER, normalizeCids } from './towerPlanState.js';
import {
  TOWER_DRAWING_LAYOUT,
  getTowerGeometry,
} from './towerPlanGeometry.js';
import {
  buildElevationRings,
  radiusForHeight,
} from './towerPlanHelicopter.js';
import {
  contrastTextColor,
  normalizeDocumentSettings,
  resolveDocumentPalette,
  wrapDocumentNote,
} from './towerPlanDocument.js';

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

function displayNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : null;
}

function wrapSvgText(value, maxCharacters = 30, maxLines = 3) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['ANTENNA'];
  const lines = [''];
  words.forEach((word) => {
    const current = lines.at(-1);
    const proposed = [current, word].filter(Boolean).join(' ');
    if (current && proposed.length > maxCharacters && lines.length < maxLines) {
      lines.push(word);
    } else if (!current) {
      lines[lines.length - 1] = word;
    } else if (proposed.length <= maxCharacters) {
      lines[lines.length - 1] = proposed;
    } else {
      lines[lines.length - 1] = `${current.slice(0, Math.max(1, maxCharacters - 1))}…`;
    }
  });
  return lines.map((line) => (
    line.length > maxCharacters ? `${line.slice(0, Math.max(1, maxCharacters - 1))}…` : line
  ));
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

function towerPaintBand(height) {
  const index = Math.max(0, Math.floor(Number(height) / 10));
  return {
    index,
    color: index % 2 === 0 ? 'red' : 'white',
    stroke: index % 2 === 0 ? '#c81e1e' : '#ffffff',
    outline: index % 2 === 0 ? '#8f1d1d' : '#cbd5e1',
  };
}

function paintBandSegments(towerHeight) {
  const segmentCount = Math.max(1, Math.ceil(towerHeight / 10));
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = index * 10;
    return {
      start,
      end: Math.min(towerHeight, start + 10),
      ...towerPaintBand(start),
    };
  });
}

function paintedTowerLine(start, end, band, strokeWidth = 12, attributes = '') {
  const whiteOutline = band.color === 'white'
    ? `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${band.outline}" stroke-width="${strokeWidth + 4}"/>`
    : '';
  return `<g data-tower-paint-band="${band.index}" data-paint-color="${band.color}"${attributes}>
    ${whiteOutline}
    <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${band.stroke}" stroke-width="${strokeWidth}"/>
  </g>`;
}

function paintedTowerPath(path, band, strokeWidth) {
  const whiteOutline = band.color === 'white'
    ? `<path d="${path}" fill="none" stroke="${band.outline}" stroke-width="${strokeWidth + 2}"/>`
    : '';
  return `<g data-tower-paint-band="${band.index}" data-paint-color="${band.color}">
    ${whiteOutline}
    <path d="${path}" fill="none" stroke="${band.stroke}" stroke-width="${strokeWidth}"/>
  </g>`;
}

function paintedBraceSegments(
  first,
  second,
  startHeight,
  endHeight,
  towerHeight,
  geometry,
) {
  const boundaries = paintBandSegments(towerHeight)
    .flatMap((band) => [band.start, band.end])
    .filter((height) => height > startHeight && height < endHeight);
  const heights = [startHeight, ...new Set(boundaries), endHeight];
  const firstPoint = installationPoint(geometry, first);
  const secondPoint = installationPoint(geometry, second);
  const pointAtHeight = (height) => {
    const ratio = (height - startHeight) / (endHeight - startHeight);
    return projectPoint({
      x: firstPoint.x + (secondPoint.x - firstPoint.x) * ratio,
      z: firstPoint.z + (secondPoint.z - firstPoint.z) * ratio,
      height,
    }, towerHeight, geometry);
  };
  return heights.slice(0, -1).map((height, index) => {
    const nextHeight = heights[index + 1];
    return paintedTowerLine(
      pointAtHeight(height),
      pointAtHeight(nextHeight),
      towerPaintBand(height),
      2,
      ` data-structure-member="brace" data-band-start-height="${height}" data-band-end-height="${nextHeight}"`,
    );
  }).join('');
}

function latticeStructure(towerHeight, geometry, palette) {
  const positions = geometry.positions;
  const levels = Array.from({ length: 13 }, (_, index) => (
    index === 12 ? towerHeight : index * towerHeight / 12
  ));
  const paintSegments = paintBandSegments(towerHeight);
  const projected = (position, height) => projectPoint(
    { ...installationPoint(geometry, position), height },
    towerHeight,
    geometry,
  );
  const faces = positions.map((position, index) => (
    [position, positions[(index + 1) % positions.length]]
  ));
  const legs = positions.map((position) => paintSegments.map((band) => (
    paintedTowerLine(
      projected(position, band.start),
      projected(position, band.end),
      band,
    )
  )).join('')).join('');
  const rings = levels.map((height) => {
    const points = positions.map((position) => projected(position, height));
    return paintedTowerPath(
      `M${points.map((point) => `${point.x} ${point.y}`).join(' L')} Z`,
      towerPaintBand(height),
      3,
    );
  }).join('');
  const braces = levels.slice(0, -1).map((height, levelIndex) => (
    faces.map(([first, second]) => {
      const nextHeight = levels[levelIndex + 1];
      return paintedBraceSegments(first, second, height, nextHeight, towerHeight, geometry)
        + paintedBraceSegments(second, first, height, nextHeight, towerHeight, geometry);
    }).join('')
  )).join('');
  const footPoints = geometry.feet.map((foot) => projectPoint(
    { ...foot, height: 0 },
    towerHeight,
    geometry,
  ));
  const feet = geometry.feet.map((foot, index) => {
    const point = footPoints[index];
    const labelSide = point.x < geometry.towerCenterX ? 'left' : 'right';
    const direction = labelSide === 'left' ? -1 : 1;
    const badgeX = point.x + direction * 58;
    const labelX = badgeX + direction * 22;
    const labelY = point.y + 2;
    const textAnchor = labelSide === 'left' ? 'end' : 'start';
    return `
      <g data-leg-label="${foot.id}" data-leg-label-side="${labelSide}" data-foot-x="${point.x}" data-label-x="${labelX}">
        <rect data-foot-plate="${foot.id}" x="${point.x - 24}" y="${point.y - 7}" width="48" height="17" rx="3" fill="#cbd5e1" stroke="#475569"/>
        <line x1="${point.x + direction * 24}" y1="${labelY}" x2="${badgeX - direction * 15}" y2="${labelY}" stroke="${palette.guide}" stroke-width="2"/>
        <circle cx="${badgeX}" cy="${labelY}" r="15" fill="#17263b"/>
        <text data-installation-label="${foot.id}" x="${badgeX}" y="${labelY + 5}" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">${foot.id}</text>
        <text x="${labelX}" y="${labelY + 4}" text-anchor="${textAnchor}" fill="${palette.canvasInk}" font-size="11" font-weight="800">LEG ${foot.id}</text>
      </g>`;
  }).join('');
  return `${groundPad(footPoints)}${legs}${rings}${braces}${feet}`;
}

function monopoleStructure(towerHeight, geometry, palette) {
  const base = projectPoint({ x: 0, z: 0, height: 0 }, towerHeight, geometry);
  const paintSegments = paintBandSegments(towerHeight);
  const anchorBolts = Array.from({ length: 6 }, (_, index) => {
    const point = polar(base.x, base.y + 6, 31, index * 60);
    return `<circle data-anchor-bolt="${index + 1}" cx="${point.x}" cy="${point.y}" r="4.5" fill="#475569"/>`;
  }).join('');
  const shaftSegments = paintSegments.map((band) => {
    const lower = projectPoint({ x: 0, z: 0, height: band.start }, towerHeight, geometry);
    const upper = projectPoint({ x: 0, z: 0, height: band.end }, towerHeight, geometry);
    const lowerWidth = 27 - 19 * (band.start / towerHeight);
    const upperWidth = 27 - 19 * (band.end / towerHeight);
    return `<g data-tower-paint-band="${band.index}" data-paint-color="${band.color}">
      <path d="M${lower.x - lowerWidth} ${lower.y} L${upper.x - upperWidth} ${upper.y} L${upper.x + upperWidth} ${upper.y} L${lower.x + lowerWidth} ${lower.y} Z" fill="${band.stroke}" stroke="${band.outline}" stroke-width="3"/>
    </g>`;
  }).join('');
  return `
    <ellipse cx="${base.x}" cy="${base.y + 18}" rx="68" ry="22" fill="#d8d4cc" stroke="#9f9789"/>
    ${shaftSegments}
    <ellipse data-foot-plate="BASE" cx="${base.x}" cy="${base.y + 6}" rx="48" ry="15" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
    ${anchorBolts}
    <text x="${base.x}" y="${base.y + 58}" text-anchor="middle" fill="${palette.canvasInk}" font-size="11" font-weight="800">MONOPOLE BASE</text>`;
}

function towerStructure(towerHeight, geometry, palette) {
  const structure = geometry.structureKind === 'monopole'
    ? monopoleStructure(towerHeight, geometry, palette)
    : latticeStructure(towerHeight, geometry, palette);
  return `<g data-structure-kind="${geometry.structureKind}" filter="url(#towerShadow)">${structure}</g>`;
}

export function legacyAntennaCallouts(state, towerHeight, geometry) {
  const antennas = [...(state.antennas || [])]
    .map((antenna, sourceIndex) => ({ antenna, sourceIndex }))
    .sort((a, b) => Number(b.antenna.height) - Number(a.antenna.height)
      || a.sourceIndex - b.sourceIndex);
  const cardsPerColumn = 8;
  const cardSlotHeight = 104;
  const cardStartY = 180;
  const columns = { left: 0, right: 0 };
  const arranged = antennas.map(({ antenna }, index) => {
    const world = installationPoint(geometry, antenna.leg);
    const preferredColumn = world.x < 0 ? 'left' : 'right';
    const column = columns[preferredColumn] < cardsPerColumn
      ? preferredColumn
      : (preferredColumn === 'left' ? 'right' : 'left');
    const slot = columns[column];
    columns[column] += 1;
    return {
      antenna,
      index,
      world,
      left: column === 'left',
      cardY: cardStartY + slot * cardSlotHeight,
    };
  });
  return arranged.map(({
    antenna, index, world, left, cardY,
  }) => {
    const anchor = projectPoint({ ...world, height: antenna.height }, towerHeight, geometry);
    const direction = left ? -1 : 1;
    const mastX = anchor.x + direction * 42;
    const mastY = anchor.y - 30;
    const cardX = left ? 62 : 688;
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
      <rect data-callout-card="${index + 1}" x="${cardX}" y="${cardY}" width="${cardWidth}" height="92" rx="7" fill="#fff" stroke="${color}" stroke-width="1.5"/>
      <path d="M${cardX + 7} ${cardY} H${cardX + cardWidth - 7} Q${cardX + cardWidth} ${cardY} ${cardX + cardWidth} ${cardY + 7} V${cardY + 29} H${cardX} V${cardY + 7} Q${cardX} ${cardY} ${cardX + 7} ${cardY}" fill="${color}"/>
      <text x="${cardX + 12}" y="${cardY + 20}" fill="#fff" font-size="13" font-weight="800">${index + 1}. ${escapeXml(antenna.name.toUpperCase())}</text>
      <text x="${cardX + 13}" y="${cardY + 48}" fill="#26384d" font-size="12">SECTOR: ${escapeXml(antenna.sector)} · ${positionLabel}: ${escapeXml(antenna.leg)} · ${Number(antenna.height).toFixed(1)} m</text>
      <text x="${cardX + 13}" y="${cardY + 66}" fill="#26384d" font-size="12">AZIMUTH: ${Number(antenna.azimuth).toFixed(1)}°</text>
      <text x="${cardX + 13}" y="${cardY + 83}" fill="#26384d" font-size="12">CID(S): ${escapeXml(cidText)}</text>
    </g>`;
  }).join('');
}

function antennaCallouts(state, towerHeight, geometry) {
  const antennas = [...(state.antennas || [])]
    .map((antenna, sourceIndex) => ({ antenna, sourceIndex }))
    .sort((a, b) => Number(b.antenna.height) - Number(a.antenna.height)
      || a.sourceIndex - b.sourceIndex);
  const cardsPerColumn = 8;
  const cardStartY = 146;
  const cardGap = 6;
  const titleLineHeight = 13;
  const detailLineHeight = 14;
  const columns = { left: 0, right: 0 };
  const cursors = { left: cardStartY, right: cardStartY };
  const arranged = antennas.map(({ antenna }, index) => {
    const world = installationPoint(geometry, antenna.leg);
    const preferredColumn = world.x < 0 ? 'left' : 'right';
    const column = columns[preferredColumn] < cardsPerColumn
      ? preferredColumn
      : (preferredColumn === 'left' ? 'right' : 'left');
    columns[column] += 1;
    const titleLines = wrapSvgText(String(antenna.name || '').toUpperCase(), 36, 2);
    const mechanicalTilt = displayNumber(antenna.mechanicalTilt);
    const tiltText = [
      mechanicalTilt === null ? null : `MT: ${mechanicalTilt}\u00b0`,
    ].filter(Boolean).join(' \u00b7 ');
    const positionLabel = state.towerType === MONOPOLE_TOWER ? 'SIDE' : 'LEG';
    const cids = normalizeCids(antenna.cids ?? antenna.cid);
    const details = [
      `SECTOR: ${antenna.sector} \u00b7 ${positionLabel}: ${antenna.leg} \u00b7 ${displayNumber(antenna.height) || 'N/A'} m`,
      `AZIMUTH: ${displayNumber(antenna.azimuth) || 'N/A'}\u00b0`,
      `CID(S): ${cids.length ? cids.join(', ') : 'N/A'}`,
      ...(tiltText ? [tiltText] : []),
    ];
    const headerHeight = 10 + titleLines.length * titleLineHeight;
    const cardHeight = headerHeight + 9 + details.length * detailLineHeight + 9;
    const cardY = cursors[column];
    cursors[column] += cardHeight + cardGap;
    return {
      antenna,
      index,
      world,
      left: column === 'left',
      cardY,
      cardHeight,
      headerHeight,
      titleLines,
      details,
    };
  });

  return arranged.map(({
    antenna, index, world, left, cardY, cardHeight, headerHeight, titleLines, details,
  }) => {
    const anchor = projectPoint({ ...world, height: antenna.height }, towerHeight, geometry);
    const direction = left ? -1 : 1;
    const mastX = anchor.x + direction * 42;
    const mastY = anchor.y - 30;
    const column = left
      ? TOWER_DRAWING_LAYOUT.calloutColumns.left
      : TOWER_DRAWING_LAYOUT.calloutColumns.right;
    const cardX = column.x;
    const cardWidth = column.width;
    const edgeX = left ? cardX + cardWidth : cardX;
    const color = escapeXml(antenna.color);
    const titleMarkup = titleLines.map((line, lineIndex) => (
      `<text data-callout-title-line="${index + 1}-${lineIndex + 1}" x="${cardX + 12}" y="${cardY + 15 + lineIndex * titleLineHeight}" fill="#fff" font-size="11" font-weight="800">${escapeXml(line)}</text>`
    )).join('');
    const detailMarkup = details.map((detail, detailIndex) => (
      `<text x="${cardX + 13}" y="${cardY + headerHeight + 12 + detailIndex * detailLineHeight}" fill="#26384d" font-size="11">${escapeXml(detail)}</text>`
    )).join('');
    return `<g>
      <line x1="${anchor.x}" y1="${anchor.y}" x2="${mastX}" y2="${mastY + 30}" stroke="#64748b" stroke-width="5"/>
      <rect x="${mastX - 13}" y="${mastY - 42}" width="26" height="84" rx="5" fill="${color}" stroke="#fff" stroke-width="3"/>
      <path d="M${mastX} ${mastY} L${column.elbowX} ${cardY + cardHeight / 2} L${edgeX} ${cardY + cardHeight / 2}" fill="none" stroke="${color}" stroke-width="2.5"/>
      <rect data-callout-card="${index + 1}" x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="7" fill="#fff" stroke="${color}" stroke-width="1.5"/>
      <path d="M${cardX + 7} ${cardY} H${cardX + cardWidth - 7} Q${cardX + cardWidth} ${cardY} ${cardX + cardWidth} ${cardY + 7} V${cardY + headerHeight} H${cardX} V${cardY + 7} Q${cardX} ${cardY} ${cardX + 7} ${cardY}" fill="${color}"/>
      ${titleMarkup}
      ${detailMarkup}
    </g>`;
  }).join('');
}

export function legacyHelicopterView(state, geometry) {
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

function helicopterView(state, geometry) {
  const {
    x, y, width, height,
  } = geometry.helicopterPanel;
  const radar = { x: x + 30, y: y + 80, width: 210, height: 230 };
  const readout = { x: x + 270, y: y + 54, width: width - 294, height: height - 76 };
  const cx = radar.x + radar.width / 2;
  const cy = radar.y + radar.height / 2;
  const bearing = Number(state.legABearingDeg) || 0;
  const positionPoints = Object.fromEntries(geometry.positions.map((position, index) => [
    position,
    polar(cx, cy, 30, bearing + index * geometry.interval),
  ]));
  const rings = buildElevationRings(state.antennas).map((ring) => ({
    ...ring,
    displayRadius: Math.max(34, Math.min(72, ring.radius)),
  }));
  const ringMarkup = rings.map(({ height: ringHeight, displayRadius }, index) => (
    `<circle data-elevation-ring="${escapeXml(ringHeight)}" cx="${cx}" cy="${cy}" r="${displayRadius}" fill="none" stroke="#f3b5bc" stroke-width="1.6"/>
    <text x="${cx + displayRadius + 6}" y="${cy + (index % 2 ? 12 : -6)}" fill="#7f1d1d" font-size="10" font-weight="700">${escapeXml(ringHeight)} m</text>`
  )).join('');
  const footprint = geometry.structureKind === 'monopole'
    ? `<circle cx="${cx}" cy="${cy}" r="16" fill="#fee2e2" stroke="#b42318" stroke-width="2.5"/>`
    : `<path d="M${geometry.positions.map((position) => {
      const point = positionPoints[position];
      return `${point.x} ${point.y}`;
    }).join(' L')} Z" fill="#fee2e2" stroke="#b42318" stroke-width="2.5"/>`;
  const labels = geometry.positions.map((position) => {
    const point = positionPoints[position];
    return `<g data-installation-label="${position}">
      <circle cx="${point.x}" cy="${point.y}" r="10" fill="#17263b"/>
      <text x="${point.x}" y="${point.y + 4}" text-anchor="middle" fill="#fff" font-size="10" font-weight="800">${position}</text>
    </g>`;
  }).join('');
  const overlapCounts = new Map();
  const antennaItems = (state.antennas || []).map((antenna, index) => {
    const positionIndex = Math.max(0, geometry.positions.indexOf(antenna.leg));
    const positionPoint = positionPoints[antenna.leg] || positionPoints[geometry.positions[0]];
    const positionBearing = bearing + positionIndex * geometry.interval;
    const overlapKey = `${antenna.leg}|${Number(antenna.height)}|${Number(antenna.azimuth)}`;
    const occurrence = overlapCounts.get(overlapKey) || 0;
    overlapCounts.set(overlapKey, occurrence + 1);
    const tangent = polar(0, 0, occurrence * 3, positionBearing + 90);
    const ring = rings.find((candidate) => candidate.height === Number(antenna.height));
    const startBase = polar(cx, cy, ring?.displayRadius || 34, positionBearing);
    const start = { x: startBase.x + tangent.x, y: startBase.y + tangent.y };
    const azimuth = Number(antenna.azimuth);
    const azimuthBearing = Number.isFinite(azimuth) ? azimuth : 0;
    const end = polar(start.x, start.y, 34, azimuthBearing);
    const shiftedPosition = {
      x: positionPoint.x + tangent.x,
      y: positionPoint.y + tangent.y,
    };
    return {
      antenna,
      index,
      occurrence,
      shiftedPosition,
      start,
      end,
      azimuthBearing,
    };
  });
  const antennas = antennaItems.map(({
    antenna, index, occurrence, shiftedPosition, start, end, azimuthBearing,
  }) => {
    const color = escapeXml(antenna.color);
    return `<g data-top-antenna="${escapeXml(antenna.id)}" data-overlap-index="${occurrence}">
      <line x1="${shiftedPosition.x}" y1="${shiftedPosition.y}" x2="${start.x}" y2="${start.y}" stroke="${color}" stroke-dasharray="2 2"/>
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${color}" stroke-width="2.5"/>
      ${coloredArrowHead(end.x, end.y, azimuthBearing, antenna.color)}
      <circle cx="${end.x}" cy="${end.y}" r="10" fill="#fff" stroke="${color}" stroke-width="2"/>
      <text x="${end.x}" y="${end.y + 3.5}" text-anchor="middle" fill="#17263b" font-size="10" font-weight="800">${index + 1}</text>
    </g>`;
  }).join('');
  const rowHeight = Math.max(18, Math.floor(readout.height / Math.max(1, antennaItems.length)));
  const rowGap = 2;
  const rowBoxHeight = rowHeight - rowGap;
  const rowFontSize = Math.max(11, Math.min(16, rowBoxHeight - 4));
  const readoutRows = antennaItems.map(({ antenna, index }) => {
    const rowY = readout.y + index * rowHeight;
    const color = escapeXml(antenna.color);
    const labelText = `SEC ${antenna.sector} | ${displayNumber(antenna.azimuth) || 'N/A'}\u00b0`;
    return `<g data-helicopter-readout-row="${escapeXml(antenna.id)}" data-readout-x="${readout.x}" data-readout-y="${rowY}" data-readout-width="${readout.width}" data-readout-height="${rowBoxHeight}">
      <rect x="${readout.x}" y="${rowY}" width="${readout.width}" height="${rowBoxHeight}" rx="5" fill="#fff" stroke="${color}" stroke-width="1.2"/>
      <rect x="${readout.x}" y="${rowY}" width="6" height="${rowBoxHeight}" rx="3" fill="${color}"/>
      <text x="${readout.x + 15}" y="${rowY + rowBoxHeight / 2 + rowFontSize * 0.34}" fill="#17263b" font-size="${rowFontSize}" font-weight="800">${index + 1}. ${escapeXml(labelText)}</text>
    </g>`;
  }).join('');
  const footerLabel = state.towerType === MONOPOLE_TOWER
    ? 'Mounting Side A bearing'
    : 'Leg A bearing';
  return `<g data-helicopter-panel="true" data-footer-bottom="${y + height}">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#fff" stroke="#7f8fa2" stroke-width="1.5"/>
    <path d="M${x + 8} ${y} H${x + width - 8} Q${x + width} ${y} ${x + width} ${y + 8} V${y + 26} H${x} V${y + 8} Q${x} ${y} ${x + 8} ${y}" fill="#17263b"/>
    <text x="${x + width / 2}" y="${y + 18}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">HELICOPTER VIEW</text>
    <text x="${cx}" y="${y + 44}" text-anchor="middle" fill="#17263b" font-size="9" font-weight="800">N · 0°</text>
    <line x1="${cx}" y1="${y + 48}" x2="${cx}" y2="${y + 68}" stroke="#17263b" stroke-width="2" marker-end="url(#arrowDark)"/>
    <text x="${readout.x}" y="${y + 44}" fill="#17263b" font-size="11" font-weight="800">SECTOR | AZIMUTH</text>
    ${ringMarkup}${footprint}${labels}${antennas}${readoutRows}
    <text x="${x + 12}" y="${y + height - 10}" fill="#5e6f84" font-size="8">${footerLabel}: ${displayNumber(state.legABearingDeg) || 'N/A'}° · North fixed</text>
  </g>`;
}

function footerHeader(card, title) {
  return `<path d="M${card.x + 8} ${card.y} H${card.x + card.width - 8} Q${card.x + card.width} ${card.y} ${card.x + card.width} ${card.y + 8} V${card.y + 26} H${card.x} V${card.y + 8} Q${card.x} ${card.y} ${card.x + 8} ${card.y}" fill="#17263b"/>
    <text x="${card.x + card.width / 2}" y="${card.y + 18}" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">${title}</text>`;
}

function footerPanels(state, towerHeight, layout) {
  const { sidebar } = layout;
  const siteData = sidebar.siteData;
  const legend = sidebar.legend;
  const antennaCount = (state.antennas || []).length;
  const totalCells = new Set(
    (state.antennas || []).flatMap((antenna) => normalizeCids(antenna.cids ?? antenna.cid)),
  ).size;
  const cardAttributes = (id, card) => (
    `data-footer-card="${id}" data-footer-x="${card.x}" data-footer-y="${card.y}" data-footer-width="${card.width}" data-footer-height="${card.height}"`
  );
  return `<g ${cardAttributes('site-data', siteData)}>
    <rect x="${siteData.x}" y="${siteData.y}" width="${siteData.width}" height="${siteData.height}" rx="8" fill="#fff" stroke="#8493a6"/>
    ${footerHeader(siteData, 'SITE DATA')}
    <text x="${siteData.x + 18}" y="${siteData.y + 46}" fill="#26384d" font-size="10">SITE ID: <tspan font-weight="700">${escapeXml(state.siteName || 'SITE NOT SET')}</tspan></text>
    <text x="${siteData.x + 18}" y="${siteData.y + 64}" fill="#26384d" font-size="10">TOWER: <tspan font-weight="700">${escapeXml(String(state.towerType).toUpperCase())}</tspan></text>
    <text x="${siteData.x + 18}" y="${siteData.y + 82}" fill="#26384d" font-size="10">HEIGHT: <tspan font-weight="700">${towerHeight.toFixed(1)} m</tspan></text>
    <text x="${siteData.x + 18}" y="${siteData.y + 100}" fill="#26384d" font-size="10">TOTAL ANTENNA: <tspan font-weight="700">${antennaCount}</tspan></text>
    <text x="${siteData.x + 18}" y="${siteData.y + 118}" fill="#26384d" font-size="10">TOTAL CELL: <tspan font-weight="700">${totalCells}</tspan></text>
  </g>
  <g ${cardAttributes('legend', legend)}>
    <rect x="${legend.x}" y="${legend.y}" width="${legend.width}" height="${legend.height}" rx="8" fill="#fff" stroke="#8493a6"/>
    ${footerHeader(legend, 'LEGEND')}
    <rect x="${legend.x + 18}" y="${legend.y + 35}" width="13" height="13" rx="2" fill="#334155"/><text x="${legend.x + 40}" y="${legend.y + 45}" fill="#26384d" font-size="10">Existing</text>
    <rect x="${legend.x + 150}" y="${legend.y + 35}" width="13" height="13" rx="2" fill="#1769e0"/><text x="${legend.x + 172}" y="${legend.y + 45}" fill="#26384d" font-size="10">New</text>
  </g>`;
}

function documentNoteCard(state, geometry) {
  const settings = normalizeDocumentSettings(state);
  const text = settings.documentNote.text.trim();
  if (!text) return '';

  const card = geometry.notePanel;
  const lines = wrapDocumentNote(text);
  const bodyPadding = 16;
  const contentHeight = bodyPadding * 2 + lines.length * card.lineHeight;
  const height = Math.min(
    card.maxHeight,
    Math.max(card.minHeight, card.headerHeight + contentHeight),
  );
  const headerColor = settings.documentNote.headerColor;
  const headerInk = contrastTextColor(headerColor);
  const lineMarkup = lines.map((line, index) => (
    `<text data-note-line="${index + 1}" x="${card.x + 18}" y="${card.y + card.headerHeight + 24 + index * card.lineHeight}" fill="#26384d" font-size="11">${escapeXml(line)}</text>`
  )).join('');

  return `<g data-document-note="true" data-note-x="${card.x}" data-note-y="${card.y}" data-note-width="${card.width}" data-note-height="${height}" data-note-line-count="${lines.length}" data-note-header-color="${headerColor}">
    <rect x="${card.x}" y="${card.y}" width="${card.width}" height="${height}" rx="8" fill="#ffffff" stroke="#8493a6"/>
    <path d="M${card.x + 8} ${card.y} H${card.x + card.width - 8} Q${card.x + card.width} ${card.y} ${card.x + card.width} ${card.y + 8} V${card.y + card.headerHeight} H${card.x} V${card.y + 8} Q${card.x} ${card.y} ${card.x + 8} ${card.y}" fill="${headerColor}"/>
    <text x="${card.x + 16}" y="${card.y + 21}" fill="${headerInk}" font-size="12" font-weight="800">${escapeXml(settings.documentNote.title)}</text>
    ${lineMarkup}
  </g>`;
}

export function renderTowerPlanSvg(state) {
  const geometry = getTowerGeometry(state.towerType);
  const layout = TOWER_DRAWING_LAYOUT;
  const palette = resolveDocumentPalette(state);
  const towerHeight = Math.max(Number(state.towerHeight) || 1, 1);
  const guideHeights = [...new Set((state.antennas || []).map(
    (antenna) => Number(antenna.height),
  ))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const guides = guideHeights.map((height) => {
    const point = projectPoint({ x: 0, z: 0, height }, towerHeight, geometry);
    return `<text x="126" y="${point.y + 5}" text-anchor="end" fill="${palette.canvasInk}" font-size="17" font-weight="800">${height.toFixed(1)} m</text>
      <line x1="142" y1="${point.y}" x2="${layout.heightDimensionCorridorRight - 7}" y2="${point.y}" stroke="${palette.guide}" stroke-width="1.5" stroke-dasharray="6 6"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.canvasWidth}" height="${layout.canvasHeight}" viewBox="0 0 ${layout.canvasWidth} ${layout.canvasHeight}" role="img" aria-label="${escapeXml(state.towerType)} plan" font-family="Inter, system-ui, sans-serif" data-document-background="${palette.background}" data-canvas-ink="${palette.canvasInk}">
  <defs>
    <filter id="towerShadow" x="-25%" y="-10%" width="150%" height="135%"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-color="#1d2939" flood-opacity=".18"/></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#1769e0"/></marker>
    <marker id="arrowDark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#17263b"/></marker>
  </defs>
  <rect data-document-canvas="true" width="${layout.canvasWidth}" height="${layout.canvasHeight}" fill="${palette.background}"/>
  <text x="${layout.drawingCenterX}" y="55" text-anchor="middle" fill="${palette.canvasInk}" font-size="34" font-weight="900">${escapeXml(state.planTitle || 'UNTITLED PLAN')}</text>
  <rect x="210" y="66" width="980" height="32" fill="${palette.background}"/>
  <text x="${layout.drawingCenterX}" y="90" text-anchor="middle" fill="${palette.canvasInk}" font-size="21" font-weight="800">SITE: <tspan fill="${palette.canvasInk}">${escapeXml(state.siteName || 'SITE NOT SET')}</tspan></text>
  <g data-tower-height-dimension="true" data-corridor-right="${layout.heightDimensionCorridorRight}">
    <rect x="18" y="118" width="145" height="31" rx="6" fill="#17263b"/>
    <text x="90" y="139" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">TOWER HEIGHT</text>
    <line x1="42" y1="165" x2="42" y2="${layout.towerBaseY}" stroke="${palette.canvasInk}" stroke-width="1.5" stroke-dasharray="6 5"/>
    <text x="23" y="${(165 + layout.towerBaseY) / 2}" transform="rotate(-90 23 ${(165 + layout.towerBaseY) / 2})" text-anchor="middle" fill="${palette.canvasInk}" font-size="14" font-weight="800">${towerHeight.toFixed(1)} m OVERALL TOWER HEIGHT</text>
    ${guides}
  </g>
  ${towerStructure(towerHeight, geometry, palette)}
  ${antennaCallouts(state, towerHeight, geometry)}
  ${footerPanels(state, towerHeight, layout)}
  ${helicopterView(state, geometry)}
  ${documentNoteCard(state, geometry)}
</svg>`;
}

export function towerPlanSvgDataUrl(state) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderTowerPlanSvg(state))}`;
}

/**
 * layout-sfd.mjs
 * Layout solver for SFD (Stock and Flow Diagram).
 * Organizes components along a left-to-right material/information pipeline:
 * Source Cloud -> Inflow Valve -> Core Stock -> Outflow Valve -> Sink Cloud,
 * with auxiliary regulatory variables arranged above and below the main pipe.
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutSFD(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 140;
  const defaultH = 58;
  const margin = 50;

  // 1. Classify nodes: Stocks, Flows/Valves, Clouds, Auxiliaries
  const stocks = [];
  const flows = [];
  const clouds = [];
  const auxiliaries = [];

  for (const c of rawComponents) {
    if (c.semantic === 'stock') stocks.push(c);
    else if (c.semantic === 'flow') flows.push(c);
    else if (c.semantic === 'cloud') clouds.push(c);
    else auxiliaries.push(c);
  }

  // 2. Position components
  const components = new Map();
  const centerY = 320;

  // Pipeline stages: CloudIn (x: 100) -> Inflow (x: 300) -> Stock (x: 520) -> Outflow (x: 740) -> CloudOut (x: 940)
  let cloudInCount = 0;
  let cloudOutCount = 0;

  // Stocks in center
  stocks.forEach((s, idx) => {
    const w = 170;
    const h = 72;
    const x = s.pos ? s.pos[0] : 460 + idx * 240;
    const y = s.pos ? s.pos[1] : centerY - h / 2;
    components.set(s.id, {
      ...s,
      semantic: 'stock',
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // Flows / Valves
  flows.forEach((f, idx) => {
    const w = 130;
    const h = 52;
    const x = f.pos ? f.pos[0] : (idx % 2 === 0 ? 270 : 690);
    const y = f.pos ? f.pos[1] : centerY - h / 2;
    components.set(f.id, {
      ...f,
      semantic: 'flow',
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // Clouds (Source / Sink)
  clouds.forEach((cl, idx) => {
    const w = 110;
    const h = 50;
    const isSink = cl.id.toLowerCase().includes('sink') || cl.id.toLowerCase().includes('out') || idx > 0;
    const x = cl.pos ? cl.pos[0] : (isSink ? 880 : 80);
    const y = cl.pos ? cl.pos[1] : centerY - h / 2;
    components.set(cl.id, {
      ...cl,
      semantic: 'cloud',
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // Auxiliaries (Control parameters placed above or below pipeline)
  auxiliaries.forEach((aux, idx) => {
    const w = 135;
    const h = 48;
    const isTop = idx % 2 === 0;
    const colIdx = Math.floor(idx / 2);
    const x = aux.pos ? aux.pos[0] : 260 + colIdx * 250;
    const y = aux.pos ? aux.pos[1] : (isTop ? 140 : 500);
    components.set(aux.id, {
      ...aux,
      semantic: aux.semantic || 'variable',
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // 3. Measure Boundaries
  const boundaries = [];
  for (const b of rawBoundaries) {
    const members = asArray(b.wraps).map((id) => components.get(id)).filter(Boolean);
    if (members.length > 0) {
      const pad = b.pad ?? 28;
      const minX = Math.min(...members.map((m) => m.x)) - pad;
      const minY = Math.min(...members.map((m) => m.y)) - pad - 12;
      const maxX = Math.max(...members.map((m) => m.x + m.width)) + pad;
      const maxY = Math.max(...members.map((m) => m.y + m.height)) + pad;
      boundaries.push({
        ...b,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    }
  }

  // 4. Route Flow & Auxiliary Relationships
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    const isPipeline = (source.semantic === 'cloud' && target.semantic === 'flow') ||
                       (source.semantic === 'flow' && target.semantic === 'stock') ||
                       (source.semantic === 'stock' && target.semantic === 'flow') ||
                       (source.semantic === 'flow' && target.semantic === 'cloud');

    let startX, startY, endX, endY, d, points;

    if (isPipeline) {
      // Horizontal thick pipe (LR) - snap Y to avoid fractional/sub-pixel diagonal deviations
      startX = source.x + source.width;
      endX = target.x;
      const commonY = Math.round((source.cy + target.cy) / 2);
      if (Math.abs(source.cy - target.cy) <= 4) {
        startY = commonY;
        endY = commonY;
        d = `M ${startX} ${commonY} L ${endX} ${commonY}`;
        points = [[startX, commonY], [endX, commonY]];
      } else {
        startY = source.cy;
        endY = target.cy;
        const midX = Math.round((startX + endX) / 2);
        d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        points = [[startX, startY], [midX, startY], [midX, endY], [endX, endY]];
      }
    } else {
      // Auxiliary influence link (curved dashed / informational)
      const dx = target.cx - source.cx;
      const dy = target.cy - source.cy;
      const dist = Math.hypot(dx, dy) || 1;
      startX = source.cx;
      startY = dy > 0 ? source.y + source.height : source.y;
      endX = target.cx;
      endY = dy > 0 ? target.y : target.y + target.height;

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const ctrlX = Math.round(midX - (dy / dist) * 20);
      const ctrlY = Math.round(midY + (dx / dist) * 20);

      d = `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
      points = [[startX, startY], [ctrlX, ctrlY], [endX, endY]];
    }

    const labelX = Math.round((startX + endX) / 2);
    const labelY = Math.round((startY + endY) / 2);

    relationships.push({
      ...rel,
      index: idx,
      isPipeline,
      width: isPipeline ? 3 : 1.5,
      variant: isPipeline ? 'emphasis' : (rel.variant || 'default'),
      startX,
      startY,
      endX,
      endY,
      d,
      points,
      labelX,
      labelY,
    });
  }

  // 5. Compute ViewBox
  const allNodes = [...components.values()];
  const minX = Math.min(margin, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(margin, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1040, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + margin;
  const maxY = Math.max(640, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + margin + 40;

  const viewBox = meta.viewBox || [Math.max(1080, maxX), Math.max(660, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

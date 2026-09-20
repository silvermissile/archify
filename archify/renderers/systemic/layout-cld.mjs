/**
 * layout-cld.mjs
 * Layout solver for CLD (Causal Loop Diagrams).
 * Handles circular/orbital layout for feedback loops, polarity signs, and loop centers.
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutCLD(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);
  const rawLoops = asArray(diagram.loops);

  const defaultW = 140;
  const defaultH = 54;
  const margin = 50;

  // 1. Measure and position components
  const components = new Map();
  const unpositioned = [];

  for (const c of rawComponents) {
    const [w, h] = Array.isArray(c.size) ? c.size : [defaultW, defaultH];
    if (Array.isArray(c.pos) && Number.isFinite(c.pos[0]) && Number.isFinite(c.pos[1])) {
      components.set(c.id, {
        ...c,
        x: c.pos[0],
        y: c.pos[1],
        width: w,
        height: h,
        cx: c.pos[0] + w / 2,
        cy: c.pos[1] + h / 2,
      });
    } else {
      unpositioned.push({ ...c, width: w, height: h });
    }
  }

  // If some or all components lack positions, compute an automatic loop layout
  if (unpositioned.length > 0) {
    const total = rawComponents.length;
    // Arrange in an orbital circle / ellipse
    const centerX = 480;
    const centerY = 340;
    const radiusX = Math.max(260, total * 45);
    const radiusY = Math.max(200, total * 35);

    unpositioned.forEach((c, idx) => {
      const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
      const cx = centerX + radiusX * Math.cos(angle);
      const cy = centerY + radiusY * Math.sin(angle);
      const x = Math.round(cx - c.width / 2);
      const y = Math.round(cy - c.height / 2);
      components.set(c.id, {
        ...c,
        x,
        y,
        cx: x + c.width / 2,
        cy: y + c.height / 2,
      });
    });
  }

  // 2. Measure Loops (centroids and radii)
  const loops = [];
  for (const loop of rawLoops) {
    const members = asArray(loop.members).map((id) => components.get(id)).filter(Boolean);
    if (members.length > 0) {
      const sumX = members.reduce((acc, m) => acc + m.cx, 0);
      const sumY = members.reduce((acc, m) => acc + m.cy, 0);
      const cx = Math.round(sumX / members.length);
      const cy = Math.round(sumY / members.length);
      loops.push({
        ...loop,
        cx,
        cy,
        radius: 28,
        memberCount: members.length,
      });
    }
  }

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

  // 4. Route Relationships (Curved or Directed Arcs with Polarity)
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    // Calculate boundary contact points
    const dx = target.cx - source.cx;
    const dy = target.cy - source.cy;
    const dist = Math.hypot(dx, dy) || 1;

    // Determine exit/entry ports
    let startX, startY, endX, endY;
    if (Math.abs(dx) > Math.abs(dy)) {
      startX = dx > 0 ? source.x + source.width : source.x;
      startY = source.cy;
      endX = dx > 0 ? target.x : target.x + target.width;
      endY = target.cy;
    } else {
      startX = source.cx;
      startY = dy > 0 ? source.y + source.height : source.y;
      endX = target.cx;
      endY = dy > 0 ? target.y : target.y + target.height;
    }

    // Gentle curve via midpoint offset
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    // Perpendicular curve offset
    const nx = -dy / dist;
    const ny = dx / dist;
    const curveOffset = Math.min(36, dist * 0.15);
    const ctrlX = Math.round(midX + nx * curveOffset);
    const ctrlY = Math.round(midY + ny * curveOffset);

    const d = `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
    const labelX = Math.round((startX + 2 * ctrlX + endX) / 4);
    const labelY = Math.round((startY + 2 * ctrlY + endY) / 4);

    relationships.push({
      ...rel,
      index: idx,
      startX,
      startY,
      endX,
      endY,
      ctrlX,
      ctrlY,
      d,
      points: [[startX, startY], [ctrlX, ctrlY], [endX, endY]],
      labelX,
      labelY,
    });
  }

  // 5. Compute ViewBox
  const allNodes = [...components.values()];
  const minX = Math.min(margin, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(margin, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(960, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + margin;
  const maxY = Math.max(640, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + margin + 40;

  const viewBox = meta.viewBox || [Math.max(1020, maxX), Math.max(680, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops,
    viewBox,
  };
}

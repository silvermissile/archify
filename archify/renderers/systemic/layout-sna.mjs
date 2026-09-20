/**
 * layout-sna.mjs
 * Layout solver for SNA (Stakeholder Network Analysis).
 * Organizes stakeholders into central power hubs, allied coalitions, rival blocs, and vulnerable groups.
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutSNA(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 145;
  const defaultH = 58;
  const margin = 50;

  // 1. Calculate degree centrality to scale nodes
  const degrees = new Map();
  for (const c of rawComponents) degrees.set(c.id, 0);
  for (const r of rawRelationships) {
    degrees.set(r.from, (degrees.get(r.from) || 0) + 1);
    degrees.set(r.to, (degrees.get(r.to) || 0) + 1);
  }

  // 2. Identify Hubs and Peripheral Actors
  const hubs = [];
  const allies = [];
  const rivals = [];
  const others = [];

  for (const c of rawComponents) {
    const role = c.actor_role || (
      c.semantic === 'actor-hub' ? 'hub' :
      c.semantic === 'actor-ally' ? 'ally' :
      c.semantic === 'actor-rival' ? 'rival' :
      c.semantic === 'actor-victim' ? 'victim' :
      'other'
    );
    if (role === 'hub') hubs.push(c);
    else if (role === 'ally') allies.push(c);
    else if (role === 'rival') rivals.push(c);
    else others.push(c);
  }

  // 3. Layout Positioning
  const components = new Map();
  const centerX = 520;
  const centerY = 330;

  // Position Hubs at the center
  hubs.forEach((h, idx) => {
    const deg = degrees.get(h.id) || 1;
    const w = Math.min(180, defaultW + deg * 5);
    const hDim = Math.min(80, defaultH + deg * 3);
    const offset = (idx - (hubs.length - 1) / 2) * 190;
    const x = Math.round(centerX + offset - w / 2);
    const y = Math.round(centerY - hDim / 2);
    components.set(h.id, {
      ...h,
      actor_role: 'hub',
      x: h.pos ? h.pos[0] : x,
      y: h.pos ? h.pos[1] : y,
      width: w,
      height: hDim,
      cx: (h.pos ? h.pos[0] : x) + w / 2,
      cy: (h.pos ? h.pos[1] : y) + hDim / 2,
      degree: deg,
    });
  });

  // Position Allies on Left/Top-Left
  allies.forEach((a, idx) => {
    const deg = degrees.get(a.id) || 1;
    const w = defaultW;
    const hDim = defaultH;
    const count = allies.length;
    const angle = Math.PI * 0.75 + ((idx + 0.5) / count) * Math.PI * 0.5;
    const rad = 280;
    const x = Math.round(centerX + rad * Math.cos(angle) - w / 2);
    const y = Math.round(centerY + rad * Math.sin(angle) - hDim / 2);
    components.set(a.id, {
      ...a,
      actor_role: 'ally',
      x: a.pos ? a.pos[0] : x,
      y: a.pos ? a.pos[1] : y,
      width: w,
      height: hDim,
      cx: (a.pos ? a.pos[0] : x) + w / 2,
      cy: (a.pos ? a.pos[1] : y) + hDim / 2,
      degree: deg,
    });
  });

  // Position Rivals on Right/Top-Right
  rivals.forEach((r, idx) => {
    const deg = degrees.get(r.id) || 1;
    const w = defaultW;
    const hDim = defaultH;
    const count = rivals.length;
    const angle = -Math.PI * 0.25 + ((idx + 0.5) / count) * Math.PI * 0.5;
    const rad = 280;
    const x = Math.round(centerX + rad * Math.cos(angle) - w / 2);
    const y = Math.round(centerY + rad * Math.sin(angle) - hDim / 2);
    components.set(r.id, {
      ...r,
      actor_role: 'rival',
      x: r.pos ? r.pos[0] : x,
      y: r.pos ? r.pos[1] : y,
      width: w,
      height: hDim,
      cx: (r.pos ? r.pos[0] : x) + w / 2,
      cy: (r.pos ? r.pos[1] : y) + hDim / 2,
      degree: deg,
    });
  });

  // Position Others / Victims at Bottom / Periphery
  others.forEach((o, idx) => {
    const deg = degrees.get(o.id) || 1;
    const w = defaultW;
    const hDim = defaultH;
    const count = others.length;
    const angle = Math.PI * 0.25 + ((idx + 0.5) / count) * Math.PI * 0.5;
    const rad = 300;
    const x = Math.round(centerX + rad * Math.cos(angle) - w / 2);
    const y = Math.round(centerY + rad * Math.sin(angle) - hDim / 2);
    components.set(o.id, {
      ...o,
      actor_role: o.actor_role || 'other',
      x: o.pos ? o.pos[0] : x,
      y: o.pos ? o.pos[1] : y,
      width: w,
      height: hDim,
      cx: (o.pos ? o.pos[0] : x) + w / 2,
      cy: (o.pos ? o.pos[1] : y) + hDim / 2,
      degree: deg,
    });
  });

  // 4. Measure Boundaries
  const boundaries = [];
  for (const b of rawBoundaries) {
    const members = asArray(b.wraps).map((id) => components.get(id)).filter(Boolean);
    if (members.length > 0) {
      const pad = b.pad ?? 26;
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

  // 5. Route Network Relationships
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    const dx = target.cx - source.cx;
    const dy = target.cy - source.cy;
    const dist = Math.hypot(dx, dy) || 1;

    // Contact points
    const startX = Math.round(source.cx + (dx / dist) * (source.width / 2));
    const startY = Math.round(source.cy + (dy / dist) * (source.height / 2));
    const endX = Math.round(target.cx - (dx / dist) * (target.width / 2));
    const endY = Math.round(target.cy - (dy / dist) * (target.height / 2));

    // Subtle curve
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const curveOffset = Math.min(24, dist * 0.1);
    const ctrlX = Math.round(midX + nx * curveOffset);
    const ctrlY = Math.round(midY + ny * curveOffset);

    const d = `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
    const labelX = Math.round((startX + 2 * ctrlX + endX) / 4);
    const labelY = Math.round((startY + 2 * ctrlY + endY) / 4);

    // Variant mapping based on relation_type
    const variant = rel.variant || (
      rel.relation_type === 'rivalry' ? 'security' :
      rel.relation_type === 'alliance' ? 'emphasis' :
      rel.relation_type === 'control' ? 'emphasis' :
      'default'
    );

    relationships.push({
      ...rel,
      variant,
      index: idx,
      startX,
      startY,
      endX,
      endY,
      d,
      points: [[startX, startY], [ctrlX, ctrlY], [endX, endY]],
      labelX,
      labelY,
    });
  }

  // 6. ViewBox
  const allNodes = [...components.values()];
  const minX = Math.min(margin, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(margin, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1020, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + margin;
  const maxY = Math.max(650, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + margin + 40;

  const viewBox = meta.viewBox || [Math.max(1060, maxX), Math.max(680, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

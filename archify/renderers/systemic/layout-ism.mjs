/**
 * layout-ism.mjs
 * Layout solver for ISM (Interpretive Structural Modeling).
 * Organizes components into a three-tier bottom-up pyramid:
 *   - L1 (Top): Surface Phenomena (surface)
 *   - L2 (Middle): Transmission & Feedback (transmission)
 *   - L3 (Bottom): Root Causes (root)
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutISM(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 150;
  const defaultH = 56;
  const marginX = 60;

  // Tier vertical coordinates (Top to Bottom visual, L1 to L3)
  const tierY = {
    surface: 90,       // Top (L1)
    transmission: 270,  // Middle (L2)
    root: 450,          // Bottom (L3)
  };

  // 1. Group components by layer
  const layers = {
    surface: [],
    transmission: [],
    root: [],
  };

  for (const c of rawComponents) {
    const layer = c.ism_layer || (
      c.semantic === 'root-cause' ? 'root' :
      c.semantic === 'transmission' ? 'transmission' :
      'surface'
    );
    layers[layer] = layers[layer] || [];
    layers[layer].push(c);
  }

  // 2. Measure and position components
  const components = new Map();

  for (const [layerKey, comps] of Object.entries(layers)) {
    const yBaseline = tierY[layerKey] || 300;
    const totalComps = comps.length;
    const spacingX = Math.max(180, 880 / (totalComps + 1));
    const startX = Math.max(marginX + 40, (1020 - totalComps * spacingX) / 2 + spacingX / 2);

    comps.forEach((c, idx) => {
      const [w, h] = Array.isArray(c.size) ? c.size : [defaultW, defaultH];
      let x, y;
      if (Array.isArray(c.pos) && Number.isFinite(c.pos[0]) && Number.isFinite(c.pos[1])) {
        x = c.pos[0];
        y = c.pos[1];
      } else {
        x = Math.round(startX + idx * spacingX - w / 2);
        y = Math.round(yBaseline);
      }

      components.set(c.id, {
        ...c,
        ism_layer: layerKey,
        x,
        y,
        width: w,
        height: h,
        cx: x + w / 2,
        cy: y + h / 2,
      });
    });
  }

  // 3. Synthesize or enrich boundaries for the 3 ISM layers
  const boundaries = [];
  const layerTitles = {
    surface: '【顶层：显性表象层 (Surface Phenomena)】',
    transmission: '【中层：机制传导层 (Transmission & Feedback)】',
    root: '【底层：根源驱动层 (Root Causes)】',
  };

  if (rawBoundaries.length > 0) {
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
  } else {
    // Generate standard 3 layer frames
    for (const layerKey of ['surface', 'transmission', 'root']) {
      const members = layers[layerKey].map((c) => components.get(c.id)).filter(Boolean);
      if (members.length > 0) {
        const minX = Math.min(marginX, ...members.map((m) => m.x - 30));
        const maxX = Math.max(960, ...members.map((m) => m.x + m.width + 30));
        const minY = tierY[layerKey] - 34;
        const maxY = tierY[layerKey] + defaultH + 24;
        boundaries.push({
          kind: 'ism-layer',
          layer: layerKey,
          label: layerTitles[layerKey],
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          wraps: members.map((m) => m.id),
        });
      }
    }
  }

  // 4. Route Relationships (Bottom-Up arrows with orthogonal or vertical steps)
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    // Upward flow: source top -> target bottom
    const startX = source.cx;
    const startY = source.y;
    const endX = target.cx;
    const endY = target.y + target.height;

    // Direct vertical or orthogonal step
    let d, points;
    if (Math.abs(startX - endX) < 8) {
      d = `M ${startX} ${startY} L ${endX} ${endY}`;
      points = [[startX, startY], [endX, endY]];
    } else {
      const midY = Math.round((startY + endY) / 2);
      d = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
      points = [[startX, startY], [startX, midY], [endX, midY], [endX, endY]];
    }

    const labelX = Math.round((startX + endX) / 2);
    const labelY = Math.round((startY + endY) / 2);

    relationships.push({
      ...rel,
      index: idx,
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
  const minX = Math.min(marginX, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(marginX, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1020, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + marginX;
  const maxY = Math.max(620, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + marginX + 40;

  const viewBox = meta.viewBox || [Math.max(1060, maxX), Math.max(650, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

/**
 * layout-evolution.mjs
 * Layout solver for Evolution Sandbox (dynamic scenario bifurcation trees & timeline progression).
 * Progression flows Left to Right:
 * Initial Context -> Shock / Phase Transition Threshold -> Multi-Scenario Bifurcation Branches.
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutEvolution(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 150;
  const defaultH = 60;
  const margin = 50;

  // 1. Classify nodes: Context/Initial, Bifurcation/Gates, Scenarios
  const origins = [];
  const midGates = [];
  const scenarios = [];

  for (const c of rawComponents) {
    if (c.semantic?.startsWith('scenario-') || c.id.toLowerCase().startsWith('scenario')) {
      scenarios.push(c);
    } else if (c.semantic === 'scenario-critical' || c.id.includes('gate') || c.id.includes('bifurcat')) {
      midGates.push(c);
    } else {
      origins.push(c);
    }
  }

  // 2. Position components along timeline stages:
  // Column 0 (x: 80-260): Origin / Core Actors & Chokepoints
  // Column 1 (x: 480): Bifurcation Critical Thresholds
  // Column 2 (x: 800): Future Scenario Outcomes
  const components = new Map();

  // Column 0: Origins
  origins.forEach((o, idx) => {
    const w = Array.isArray(o.size) ? o.size[0] : defaultW;
    const h = Array.isArray(o.size) ? o.size[1] : defaultH;
    const x = o.pos ? o.pos[0] : 100;
    const y = o.pos ? o.pos[1] : 180 + idx * 140;
    components.set(o.id, {
      ...o,
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // Column 1: Middle Gates / Critical Thresholds
  midGates.forEach((g, idx) => {
    const w = Array.isArray(g.size) ? g.size[0] : defaultW;
    const h = Array.isArray(g.size) ? g.size[1] : defaultH;
    const x = g.pos ? g.pos[0] : 450;
    const y = g.pos ? g.pos[1] : 240 + idx * 150;
    components.set(g.id, {
      ...g,
      x,
      y,
      width: w,
      height: h,
      cx: x + w / 2,
      cy: y + h / 2,
    });
  });

  // Column 2: Scenarios (Spread vertically on right)
  const totalScenarios = Math.max(1, scenarios.length);
  const scenarioSpacingY = Math.max(110, 480 / totalScenarios);
  const scenarioStartY = 130;

  scenarios.forEach((s, idx) => {
    const w = Array.isArray(s.size) ? s.size[0] : 160;
    const h = Array.isArray(s.size) ? s.size[1] : 62;
    const x = s.pos ? s.pos[0] : 820;
    const y = s.pos ? s.pos[1] : scenarioStartY + idx * scenarioSpacingY;
    components.set(s.id, {
      ...s,
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

  // 4. Route Scenario Forking Relationships (Branching curves)
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    const startX = source.x + source.width;
    const startY = source.cy;
    const endX = target.x;
    const endY = target.cy;

    // Cubic or smooth orthogonal horizontal branch
    const midX = Math.round((startX + endX) / 2);
    const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    const points = [[startX, startY], [midX, startY], [midX, endY], [endX, endY]];

    const labelX = midX;
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
  const minX = Math.min(margin, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(margin, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1040, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + margin;
  const maxY = Math.max(620, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + margin + 40;

  const viewBox = meta.viewBox || [Math.max(1080, maxX), Math.max(660, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

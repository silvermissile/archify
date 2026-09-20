/**
 * layout-wsr.mjs
 * Layout solver for WSR System Methodology (顾基发: 物理 - 事理 - 人理).
 * Organizes components across three parallel vertical columns:
 *   - Column 1 (Left): 物理 (Wuli: Physical & Objective Constraints)
 *   - Column 2 (Center): 事理 (Shili: Operational & Institutional Logic)
 *   - Column 3 (Right): 人理 (Renli: Human, Political & Stakeholder Dynamics)
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutWSR(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 160;
  const defaultH = 58;
  const marginX = 50;

  // Group by WSR dimension
  const columns = {
    wuli: [],
    shili: [],
    renli: [],
  };

  for (const c of rawComponents) {
    const dim = c.wsr_dimension || (
      c.semantic === 'wsr-wuli' ? 'wuli' :
      c.semantic === 'wsr-shili' ? 'shili' :
      c.semantic === 'wsr-renli' ? 'renli' :
      'shili'
    );
    columns[dim] = columns[dim] || [];
    columns[dim].push({ ...c, wsr_dimension: dim });
  }

  const colX = {
    wuli: 90,
    shili: 440,
    renli: 790,
  };

  const colWidth = 280;
  const components = new Map();

  for (const [dimKey, list] of Object.entries(columns)) {
    const baseX = colX[dimKey];
    list.forEach((c, idx) => {
      const [w, h] = Array.isArray(c.size) ? c.size : [defaultW, defaultH];
      const x = c.pos ? c.pos[0] : Math.round(baseX + (colWidth - w) / 2);
      const y = c.pos ? c.pos[1] : 140 + idx * 110;

      components.set(c.id, {
        ...c,
        x,
        y,
        width: w,
        height: h,
        cx: x + w / 2,
        cy: y + h / 2,
      });
    });
  }

  // Boundaries: 3 vertical column containers
  const boundaries = [];
  const dimTitles = {
    wuli: '【物理维：客观规律与刚性约束 (Wuli)】',
    shili: '【事理维：运作机制与制度逻辑 (Shili)】',
    renli: '【人理维：利益博弈与心理预期 (Renli)】',
  };

  if (rawBoundaries.length > 0) {
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
  } else {
    for (const dimKey of ['wuli', 'shili', 'renli']) {
      const members = columns[dimKey].map((c) => components.get(c.id)).filter(Boolean);
      if (members.length > 0) {
        const minX = colX[dimKey] - 20;
        const maxX = colX[dimKey] + colWidth + 20;
        const minY = 90;
        const maxY = Math.max(560, ...members.map((m) => m.y + m.height + 30));
        boundaries.push({
          kind: 'wsr-dimension',
          dimension: dimKey,
          label: dimTitles[dimKey],
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          wraps: members.map((m) => m.id),
        });
      }
    }
  }

  // Route Cross-Column Relationships
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    const isForward = target.cx > source.cx;
    const startX = isForward ? source.x + source.width : source.x;
    const startY = source.cy;
    const endX = isForward ? target.x : target.x + target.width;
    const endY = target.cy;

    const midX = Math.round((startX + endX) / 2);
    const d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    const points = [[startX, startY], [midX, startY], [midX, endY], [endX, endY]];

    relationships.push({
      ...rel,
      index: idx,
      startX,
      startY,
      endX,
      endY,
      d,
      points,
      labelX: midX,
      labelY: Math.round((startY + endY) / 2),
    });
  }

  // ViewBox
  const allNodes = [...components.values()];
  const minX = Math.min(marginX, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(marginX, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1120, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + marginX;
  const maxY = Math.max(650, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + marginX + 40;

  const viewBox = meta.viewBox || [Math.max(1160, maxX), Math.max(680, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

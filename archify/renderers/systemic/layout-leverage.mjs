/**
 * layout-leverage.mjs
 * Layout solver for Donella Meadows 12 Leverage Points.
 * Arranges system interventions vertically across three tiers:
 *   - Tier 3 (Top): High Leverage (L1-L3: Goals, Paradigm Shifts)
 *   - Tier 2 (Middle): Mid Leverage (L4-L6: Rules, Information Flows, Delay Reduction)
 *   - Tier 1 (Bottom): Low Leverage (L7-L12: Parameters, Buffer Sizes, Subsidies)
 */

import { asArray } from '../shared/geometry.mjs';

export function layoutLeverage(diagram) {
  const meta = diagram.meta || {};
  const rawComponents = asArray(diagram.components);
  const rawRelationships = asArray(diagram.relationships);
  const rawBoundaries = asArray(diagram.boundaries);

  const defaultW = 160;
  const defaultH = 54;
  const marginX = 60;

  // Group into High (1-3), Mid (4-6), Low (7-12)
  const tiers = {
    high: [], // Levels 1-3
    mid: [],  // Levels 4-6
    low: [],  // Levels 7-12
  };

  for (const c of rawComponents) {
    const lvl = c.leverage_level != null ? Number(c.leverage_level) : (
      c.semantic === 'leverage-high' ? 2 :
      c.semantic === 'leverage-mid' ? 5 :
      11
    );
    if (lvl <= 3) tiers.high.push({ ...c, leverage_level: lvl });
    else if (lvl <= 6) tiers.mid.push({ ...c, leverage_level: lvl });
    else tiers.low.push({ ...c, leverage_level: lvl });
  }

  // Sort within each tier by leverage level
  tiers.high.sort((a, b) => a.leverage_level - b.leverage_level);
  tiers.mid.sort((a, b) => a.leverage_level - b.leverage_level);
  tiers.low.sort((a, b) => a.leverage_level - b.leverage_level);

  const tierY = {
    high: 110,
    mid: 280,
    low: 460,
  };

  const components = new Map();

  for (const [tierKey, list] of Object.entries(tiers)) {
    const yBase = tierY[tierKey];
    const total = list.length;
    const spacingX = Math.max(190, 880 / (total + 1));
    const startX = Math.max(marginX + 40, (1040 - total * spacingX) / 2 + spacingX / 2);

    list.forEach((c, idx) => {
      const [w, h] = Array.isArray(c.size) ? c.size : [defaultW, defaultH];
      const x = c.pos ? c.pos[0] : Math.round(startX + idx * spacingX - w / 2);
      const y = c.pos ? c.pos[1] : yBase;

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

  // Boundaries: 3 tier frames
  const boundaries = [];
  const tierLabels = {
    high: '【高杠杆破局层 (Levels 1-3: 范式跃迁 · 系统目标重塑)】',
    mid: '【中杠杆重构层 (Levels 4-6: 信息流疏通 · 博弈规则重塑)】',
    low: '【低杠杆微调层 (Levels 7-12: 参数微调 · 补贴与数字游戏)】',
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
    for (const tierKey of ['high', 'mid', 'low']) {
      const members = tiers[tierKey].map((c) => components.get(c.id)).filter(Boolean);
      if (members.length > 0) {
        const minX = Math.min(marginX, ...members.map((m) => m.x - 30));
        const maxX = Math.max(980, ...members.map((m) => m.x + m.width + 30));
        const minY = tierY[tierKey] - 34;
        const maxY = tierY[tierKey] + defaultH + 24;
        boundaries.push({
          kind: 'leverage-tier',
          tier: tierKey,
          label: tierLabels[tierKey],
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          wraps: members.map((m) => m.id),
        });
      }
    }
  }

  // Route Relationships
  const relationships = [];
  for (let idx = 0; idx < rawRelationships.length; idx++) {
    const rel = rawRelationships[idx];
    const source = components.get(rel.from);
    const target = components.get(rel.to);
    if (!source || !target) continue;

    const startX = source.cx;
    const startY = source.y;
    const endX = target.cx;
    const endY = target.y + target.height;

    const midY = Math.round((startY + endY) / 2);
    const d = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
    const points = [[startX, startY], [startX, midY], [endX, midY], [endX, endY]];

    relationships.push({
      ...rel,
      index: idx,
      startX,
      startY,
      endX,
      endY,
      d,
      points,
      labelX: Math.round((startX + endX) / 2),
      labelY: midY,
    });
  }

  // ViewBox
  const allNodes = [...components.values()];
  const minX = Math.min(marginX, ...allNodes.map((n) => n.x), ...boundaries.map((b) => b.x));
  const minY = Math.min(marginX, ...allNodes.map((n) => n.y), ...boundaries.map((b) => b.y));
  const maxX = Math.max(1040, ...allNodes.map((n) => n.x + n.width), ...boundaries.map((b) => b.x + b.width)) + marginX;
  const maxY = Math.max(620, ...allNodes.map((n) => n.y + n.height), ...boundaries.map((b) => b.y + b.height)) + marginX + 40;

  const viewBox = meta.viewBox || [Math.max(1080, maxX), Math.max(650, maxY)];

  return {
    components,
    relationships,
    boundaries,
    loops: [],
    viewBox,
  };
}

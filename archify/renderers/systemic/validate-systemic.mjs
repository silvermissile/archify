/**
 * validate-systemic.mjs
 * Domain-specific semantic validation rules for systemic analysis diagrams.
 */

import { asArray } from '../shared/geometry.mjs';

export function validateSystemic(diagram) {
  const problems = [];
  const meta = diagram.meta || {};
  const subtype = meta.subtype;
  const components = asArray(diagram.components);
  const relationships = asArray(diagram.relationships);
  const boundaries = asArray(diagram.boundaries);
  const componentMap = new Map(components.map((c) => [c.id, c]));

  if (!subtype) {
    problems.push('meta.subtype is required for systemic diagrams (cld, ism, sna, sfd, evolution, leverage, wsr).');
    return problems;
  }

  // 1. Referential integrity: relationships must reference existing components
  for (const rel of relationships) {
    if (!componentMap.has(rel.from)) {
      problems.push(`Relationship from "${rel.from}" references unknown component.`);
    }
    if (!componentMap.has(rel.to)) {
      problems.push(`Relationship to "${rel.to}" references unknown component.`);
    }
  }

  // 2. Subtype-specific validation
  switch (subtype) {
    case 'cld': {
      // CLD: causal loop diagram
      for (const rel of relationships) {
        if (!rel.polarity) {
          problems.push(`CLD relationship "${rel.from}" -> "${rel.to}" must specify polarity ("+" or "-").`);
        }
      }

      // Check loops consistency if loops are declared
      if (Array.isArray(diagram.loops)) {
        for (const loop of diagram.loops) {
          if (!loop.id || !loop.type || !Array.isArray(loop.members) || loop.members.length < 2) {
            problems.push(`Loop "${loop.id || 'unnamed'}" must have id, type ("reinforcing"|"balancing"), and at least 2 members.`);
            continue;
          }
          for (const member of loop.members) {
            if (!componentMap.has(member)) {
              problems.push(`Loop "${loop.id}" references unknown member component "${member}".`);
            }
          }

          // Polarity cycle consistency check
          // Count negative polarities along the cycle
          let negativeCount = 0;
          let hasCompleteCycle = true;
          for (let i = 0; i < loop.members.length; i++) {
            const from = loop.members[i];
            const to = loop.members[(i + 1) % loop.members.length];
            const rel = relationships.find((r) => r.from === from && r.to === to);
            if (rel) {
              if (rel.polarity === '-') negativeCount++;
            } else {
              hasCompleteCycle = false;
            }
          }

          if (hasCompleteCycle) {
            if (loop.type === 'reinforcing' && negativeCount % 2 !== 0) {
              problems.push(`Loop "${loop.id}" is marked as "reinforcing" [R], but has an odd number (${negativeCount}) of negative "-" polarities. Reinforcing loops must have an even number of negative links.`);
            } else if (loop.type === 'balancing' && negativeCount % 2 !== 1) {
              problems.push(`Loop "${loop.id}" is marked as "balancing" [B], but has an even number (${negativeCount}) of negative "-" polarities. Balancing loops must have an odd number of negative links.`);
            }
          }
        }
      }
      break;
    }

    case 'ism': {
      // ISM: Interpretive Structural Modeling (hierarchy: root -> transmission -> surface)
      const layerOrder = { root: 0, transmission: 1, surface: 2 };
      for (const c of components) {
        if (!c.ism_layer) {
          problems.push(`ISM component "${c.id}" (${c.label}) must specify ism_layer ("root", "transmission", or "surface").`);
        }
      }
      // Check for upward causality (no reverse flow from surface to root)
      for (const rel of relationships) {
        const fromComp = componentMap.get(rel.from);
        const toComp = componentMap.get(rel.to);
        if (fromComp?.ism_layer && toComp?.ism_layer) {
          const fromLevel = layerOrder[fromComp.ism_layer];
          const toLevel = layerOrder[toComp.ism_layer];
          if (fromLevel > toLevel) {
            problems.push(`ISM relationship "${rel.from}" (${fromComp.ism_layer}) -> "${rel.to}" (${toComp.ism_layer}) drives backwards from top to bottom. ISM requires bottom-up root-to-surface causality.`);
          }
        }
      }
      break;
    }

    case 'sna': {
      // SNA: Stakeholder Network Analysis
      let hasHub = false;
      for (const c of components) {
        if (c.actor_role === 'hub' || c.semantic === 'actor-hub') {
          hasHub = true;
        }
      }
      if (!hasHub && components.length > 2) {
        problems.push('SNA network should have at least one central actor with actor_role: "hub" or semantic: "actor-hub".');
      }
      break;
    }

    case 'sfd': {
      // SFD: Stock and Flow Diagram
      let hasStock = false;
      for (const c of components) {
        if (c.semantic === 'stock') hasStock = true;
      }
      if (!hasStock) {
        problems.push('SFD diagram must contain at least one component with semantic: "stock".');
      }
      break;
    }

    case 'evolution': {
      // Evolution scenario branching
      const scenarios = components.filter((c) =>
        c.semantic?.startsWith('scenario-') || c.id.startsWith('scenario')
      );
      if (scenarios.length < 2) {
        problems.push('Evolution diagram should provide at least two scenario branches (e.g. baseline, critical bifurcation, or black swan).');
      }
      break;
    }

    case 'leverage': {
      // Meadows 12 leverage points
      for (const c of components) {
        if (c.leverage_level != null) {
          if (c.leverage_level < 1 || c.leverage_level > 12) {
            problems.push(`Component "${c.id}" has invalid leverage_level ${c.leverage_level}. Meadows leverage points must be 1 (highest) to 12 (lowest).`);
          }
        }
      }
      break;
    }

    case 'wsr': {
      // Wuli - Shili - Renli
      for (const c of components) {
        if (!c.wsr_dimension && !c.semantic?.startsWith('wsr-')) {
          problems.push(`WSR component "${c.id}" should specify wsr_dimension ("wuli", "shili", or "renli").`);
        }
      }
      break;
    }

    default:
      break;
  }

  return problems;
}

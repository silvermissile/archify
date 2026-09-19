/**
 * render-systemic.mjs
 * Main compiler and renderer entry point for systemic analysis diagrams.
 * Dispatches to subtype layout engines: CLD, ISM, SNA, SFD, Evolution, Leverage, WSR.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderDefinitions, renderSemanticSigil, textUnits } from '../shared/utils.mjs';
import {
  animateAttr,
  focusEdgeAttrs,
  focusNodeAttrs,
  focusNodeTitle,
  loadDiagramWithBrandMarks,
  writeDiagram,
  svgAccessibleText,
  svgRootAttrs,
} from '../shared/cli.mjs';
import { throwDiagnosticProblems } from '../shared/diagnostics.mjs';
import { resolveLegend, renderLegend as renderResolvedLegend } from '../shared/legend.mjs';
import { fittedNodeFontSize } from '../shared/text-fit.mjs';
import { translateMessage as i18nText } from '../shared/i18n.mjs';
import {
  asArray,
  componentFill,
  componentText,
  arrowClassMap,
  variantAccent,
} from '../shared/geometry.mjs';

import { validateSystemic } from './validate-systemic.mjs';
import { layoutCLD } from './layout-cld.mjs';
import { layoutISM } from './layout-ism.mjs';
import { layoutSNA } from './layout-sna.mjs';
import { layoutSFD } from './layout-sfd.mjs';
import { layoutEvolution } from './layout-evolution.mjs';
import { layoutLeverage } from './layout-leverage.mjs';
import { layoutWSR } from './layout-wsr.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const layoutJsonMode = process.argv.includes('--layout-json');
const cliArgs = process.argv.filter((arg) => arg !== '--layout-json');

const { diagram, template, outPath, sourceEvidence } = await loadDiagramWithBrandMarks({
  rendererDir: __dirname,
  diagramType: 'systemic',
  defaultExample: 'cld-inflation-spiral.systemic.json',
  argv: cliArgs,
});

// 1. Run domain semantic validations
const problems = validateSystemic(diagram);
if (problems.length > 0) {
  throwDiagnosticProblems(problems.map((msg) => ({
    code: 'systemic/domain-validation',
    severity: 'error',
    message: msg,
    subject: { subtype: diagram.meta?.subtype },
    supportedFixes: ['review and correct the systemic model structure'],
  })));
}

// 2. Dispatch to Subtype Layout Solver
const subtype = diagram.meta?.subtype || 'cld';
let layoutResult;
switch (subtype) {
  case 'cld':
    layoutResult = layoutCLD(diagram);
    break;
  case 'ism':
    layoutResult = layoutISM(diagram);
    break;
  case 'sna':
    layoutResult = layoutSNA(diagram);
    break;
  case 'sfd':
    layoutResult = layoutSFD(diagram);
    break;
  case 'evolution':
    layoutResult = layoutEvolution(diagram);
    break;
  case 'leverage':
    layoutResult = layoutLeverage(diagram);
    break;
  case 'wsr':
    layoutResult = layoutWSR(diagram);
    break;
  default:
    layoutResult = layoutCLD(diagram);
    break;
}

const { components, relationships, boundaries, loops, viewBox } = layoutResult;

// 3. Prepare Legend
const SYSTEMIC_LEGEND_TYPES = [
  'variable',
  'stock',
  'flow',
  'reinforcing-loop',
  'balancing-loop',
  'actor-hub',
  'actor-ally',
  'actor-rival',
  'leverage-high',
  'leverage-mid',
  'leverage-low',
  'scenario-base',
  'scenario-critical',
  'scenario-blackswan',
  'wsr-wuli',
  'wsr-shili',
  'wsr-renli',
  'root-cause',
  'transmission',
  'surface-symptom',
];

const legendCatalog = SYSTEMIC_LEGEND_TYPES.map((kind) => ({
  kind,
  label: i18nText(diagram.meta.locale, `legend.systemic.${kind}`),
}));

const activeTypes = new Set([...components.values()].map((c) => c.semantic || 'variable'));
const systemicLegendEntries = resolveLegend(
  diagram.meta?.legend,
  legendCatalog,
  activeTypes,
);

// 4. SVG Rendering Functions

function renderBoundaryFrame(b, index) {
  const cls = b.kind === 'ism-layer' ? 'c-security-group' :
              b.kind === 'wsr-dimension' ? 'c-region' :
              b.kind === 'leverage-tier' ? 'c-security-group' :
              'c-region';
  const rx = 10;
  return `        <rect data-graph-role="structural-frame" data-composition-frame-id="${index}" data-composition-frame-label="${esc(b.label)}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${rx}" class="${cls}" stroke-width="1.2" stroke-dasharray="${b.kind === 'ism-layer' ? '6 3' : 'none'}"/>`;
}

function renderBoundaryLabel(b, index) {
  const labelCls = 't-primary';
  const labelW = Math.max(40, textUnits(b.label) * 6 + 16);
  return `        <g data-graph-role="structural-frame-label" data-composition-frame-id="${index}">
          <rect x="${b.x + 14}" y="${b.y - 10}" width="${labelW}" height="18" rx="4" class="c-mask"/>
          <text x="${b.x + 22}" y="${b.y + 3}" class="${labelCls}" font-size="10" font-weight="600">${esc(b.label)}</text>
        </g>`;
}

function renderLoopCenter(loop, index) {
  const isReinforcing = loop.type === 'reinforcing';
  const fillCls = isReinforcing ? 'c-security' : 'c-backend';
  const textCls = isReinforcing ? 't-security' : 't-backend';
  const loopTag = isReinforcing ? 'R' : 'B';
  const displayLabel = loop.label || loop.id;

  return `        <!-- Loop Center ${esc(loop.id)} -->
        <g class="loop-center-group" data-loop-id="${esc(loop.id)}" data-loop-type="${esc(loop.type)}">
          <circle cx="${loop.cx}" cy="${loop.cy}" r="${loop.radius || 28}" class="${fillCls}" stroke-width="2" stroke-dasharray="4 2"/>
          <circle cx="${loop.cx}" cy="${loop.cy}" r="${(loop.radius || 28) - 6}" class="c-mask"/>
          <text x="${loop.cx}" y="${loop.cy - 4}" class="${textCls}" font-size="12" font-weight="700" text-anchor="middle">【${loopTag}】</text>
          <text x="${loop.cx}" y="${loop.cy + 11}" class="t-muted" font-size="8" text-anchor="middle">${esc(displayLabel)}</text>
        </g>`;
}

function renderRelationshipPath(rel, index) {
  const [cls, marker] = arrowClassMap[rel.variant || 'default'] || arrowClassMap.default;
  const strokeWidth = rel.width || (rel.variant === 'emphasis' ? 2 : 1.5);
  const strokeDash = rel.variant === 'dashed' || rel.relation_type === 'rivalry' ? 'stroke-dasharray="5 3"' : '';

  return `        <path ${focusEdgeAttrs(rel.from, rel.to, rel.label, index, rel.id)} data-polarity="${esc(rel.polarity || '')}" data-loop="${esc(rel.loop_id || '')}" d="${rel.d}" class="${cls}" stroke-width="${strokeWidth}" ${strokeDash} marker-end="url(#${marker})"/>`;
}

function renderRelationshipBadges(rel, index) {
  const parts = [];

  // Polarity badge (+ or -)
  if (rel.polarity) {
    const isPlus = rel.polarity === '+';
    const fillCls = isPlus ? 'c-security' : 'c-backend';
    const textCls = isPlus ? 't-security' : 't-backend';
    // Offset slightly from mid-point
    const px = rel.labelX - (rel.label ? 24 : 0);
    const py = rel.labelY;
    parts.push(`          <g class="polarity-badge" data-polarity="${rel.polarity}">
            <circle cx="${px}" cy="${py}" r="8" class="${fillCls}" stroke-width="1.2"/>
            <text x="${px}" y="${py + 4}" class="${textCls}" font-size="11" font-weight="700" text-anchor="middle">${rel.polarity}</text>
          </g>`);
  }

  // Delay marker (//)
  if (rel.delay || rel.delay_months) {
    const delayText = rel.delay || `${rel.delay_months}m`;
    const dx = rel.labelX + (rel.label ? 28 : (rel.polarity ? 18 : 0));
    const dy = rel.labelY;
    const w = Math.max(28, textUnits(delayText) * 5 + 10);
    parts.push(`          <g class="delay-badge" data-delay="${esc(delayText)}">
            <rect x="${dx - w / 2}" y="${dy - 8}" width="${w}" height="15" rx="3" class="c-mask" stroke="var(--arrow)" stroke-width="0.8"/>
            <text x="${dx}" y="${dy + 3}" class="t-muted" font-size="8" text-anchor="middle">// ${esc(delayText)}</text>
          </g>`);
  }

  // Text label
  if (rel.label) {
    const lx = rel.labelX;
    const ly = rel.labelY;
    const w = Math.max(30, textUnits(rel.label) * 5 + 12);
    parts.push(`          <rect x="${lx - w / 2}" y="${ly - 9}" width="${w}" height="16" rx="3" class="c-mask"/>
          <text x="${lx}" y="${ly + 3}" class="${variantAccent(rel.variant)}" font-size="8.5" text-anchor="middle">${esc(rel.label)}</text>`);
  }

  if (!parts.length) return '';
  return `        <g data-detail="context" ${focusEdgeAttrs(rel.from, rel.to, rel.label, index, rel.id)}>
${parts.join('\n')}
        </g>`;
}

function renderComponent(c, index) {
  const semantic = c.semantic || 'variable';
  const fill = componentFill[semantic] || 'c-external';
  const accent = componentText[semantic] || 't-muted';
  const cx = c.cx;
  const hasSub = Boolean(c.sublabel);
  const labelY = hasSub ? c.y + c.height / 2 - 3 : c.y + c.height / 2 + 4;
  const labelFontSize = fittedNodeFontSize(c.label, c.width - 24, 11, 8);

  const sub = hasSub
    ? `\n        <text data-detail="context" x="${cx}" y="${c.y + c.height / 2 + 13}" class="t-muted" font-size="7.5" text-anchor="middle">${esc(c.sublabel)}</text>`
    : '';

  const tagText = c.tag || (
    c.stock_initial != null ? `存量: ${c.stock_initial} ${c.stock_unit || ''}` :
    c.actor_role ? `主体: ${c.actor_role}` :
    c.ism_layer ? `层级: ${c.ism_layer}` :
    ''
  );

  const tag = tagText
    ? `\n        <text data-detail="fine" x="${cx}" y="${c.y + c.height - 7}" class="${accent}" font-size="7" text-anchor="middle">${esc(tagText)}</text>`
    : '';

  // Leverage Badge (if present)
  let leverageBadge = '';
  if (c.leverage_level != null) {
    const lvl = c.leverage_level;
    const badgeColor = lvl <= 3 ? 'c-security' : lvl <= 6 ? 'c-cloud' : 'c-external';
    const textColor = lvl <= 3 ? 't-security' : lvl <= 6 ? 't-cloud' : 't-muted';
    leverageBadge = `\n        <g class="leverage-badge" data-leverage="${lvl}">
          <circle cx="${c.x + c.width - 10}" cy="${c.y + 10}" r="8" class="${badgeColor}" stroke-width="1"/>
          <text x="${c.x + c.width - 10}" y="${c.y + 13}" class="${textColor}" font-size="7.5" font-weight="700" text-anchor="middle">L${lvl}</text>
        </g>`;
  }

  const passport = {
    kind: semantic,
    sublabel: c.sublabel,
    tag: tagText,
    leverage: c.leverage_level,
    layer: c.ism_layer,
    actor: c.actor_role,
  };

  const isStock = semantic === 'stock';
  const rx = isStock ? 3 : 6;

  return `        <g ${focusNodeAttrs(c.id, c.label, passport, diagram.meta.locale)} data-semantic="${esc(semantic)}" data-loops="${esc((c.loop_ids || []).join(','))}">
          ${focusNodeTitle(c.label, passport)}
          <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${rx}" class="c-mask"/>
          <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${rx}" class="${fill}" stroke-width="${isStock ? 2.5 : 1.5}"/>
          ${isStock ? `<rect x="${c.x + 3}" y="${c.y + 3}" width="${c.width - 6}" height="${c.height - 6}" rx="${rx - 1}" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>` : ''}
          ${renderSemanticSigil(semantic, { x: c.x + 6, y: c.y + 6 })}${leverageBadge}
          <text data-node-label="" x="${cx}" y="${labelY}" class="t-primary" font-size="${labelFontSize}" font-weight="600" text-anchor="middle">${esc(c.label)}</text>${sub}${tag}
        </g>`;
}

function renderLegend() {
  const contentBottom = Math.max(
    0,
    ...[...components.values()].map((c) => c.y + c.height),
    ...boundaries.map((b) => b.y + b.height),
  );

  return renderResolvedLegend({
    entries: systemicLegendEntries,
    locale: diagram.meta.locale,
    layout: {
      x: 50,
      baselineY: viewBox[1] - 30,
      width: viewBox[0] - 100,
      minTitleY: contentBottom + 8,
      unfit: 'hide',
      diagramType: 'systemic',
    },
    renderSwatch: (entry) => `<rect x="${entry.x}" y="${entry.baseline - 9}" width="16" height="10" rx="2.5" class="${componentFill[entry.kind] || 'c-external'}" stroke-width="1"/>`,
  });
}

function renderSvg() {
  return `      <svg viewBox="0 0 ${viewBox[0]} ${viewBox[1]}" ${svgRootAttrs(diagram.meta)}>
${svgAccessibleText(diagram.meta, 'systemic')}
${renderDefinitions()}

        <!-- Background Grid -->
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- Boundaries & Containers -->
${boundaries.map(renderBoundaryFrame).join('\n\n')}

        <!-- Feedback Loop Centers (CLD) -->
${loops.map(renderLoopCenter).join('\n\n')}

        <!-- Relationship Lines -->
${relationships.map(renderRelationshipPath).join('\n')}

        <!-- Components & Elements -->
${[...components.values()].map(renderComponent).join('\n\n')}

        <!-- Relationship Badges (Polarity, Delay & Labels) -->
${relationships.map(renderRelationshipBadges).join('\n')}

        <!-- Boundary Titles -->
${boundaries.map(renderBoundaryLabel).join('\n\n')}

        <!-- Legend -->
${renderLegend()}
      </svg>`;
}

// 5. Output Handling
if (layoutJsonMode) {
  const report = {
    viewBox,
    subtype,
    components: [...components.values()],
    relationships,
    boundaries,
    loops,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

writeDiagram({
  outPath,
  template,
  diagramType: 'systemic',
  meta: diagram.meta,
  svg: renderSvg(),
  cards: diagram.cards,
  sourceEvidence,
});

/**
 * DXF file analyzer for drawing quality assessment.
 * Parses DXF files to extract layers, scales, text styles, blocks,
 * and other CAD metadata relevant to Portuguese building regulation compliance.
 *
 * Uses manual DXF parsing (no external dependency needed for basic analysis).
 */

export interface DxfAnalysisResult {
  layers: DxfLayer[];
  textStyles: DxfTextStyle[];
  blocks: string[];
  dimensions: { count: number; hasAssociative: boolean };
  titleBlock: { found: boolean; blockName?: string };
  northArrow: { found: boolean };
  scaleBar: { found: boolean };
  legends: { found: boolean; count: number };
  viewport: { scale?: string; paperSize?: string };
  entityCounts: Record<string, number>;
  qualityScore: number;
  warnings: string[];
  suggestions: string[];
}

export interface DxfLayer {
  name: string;
  color: number;
  lineType: string;
  frozen: boolean;
  off: boolean;
}

export interface DxfTextStyle {
  name: string;
  font: string;
  height: number;
}

/**
 * Parse a DXF file from text content and analyze drawing quality.
 */
export function analyzeDxf(content: string): DxfAnalysisResult {
  const lines = content.split("\n").map(l => l.trim());
  const layers = parseLayers(lines);
  const textStyles = parseTextStyles(lines);
  const blocks = parseBlocks(lines);
  const entityCounts = countEntities(lines);
  const dimensions = analyzeDimensions(lines, entityCounts);

  const titleBlock = detectTitleBlock(blocks);
  const northArrow = detectNorthArrow(blocks, content);
  const scaleBar = detectScaleBar(blocks, content);
  const legends = detectLegends(blocks, content);
  const viewport = parseViewport(lines);

  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Quality checks
  if (layers.length === 0) {
    warnings.push("Nenhuma layer definida no ficheiro DXF.");
  }
  if (layers.length < 5) {
    suggestions.push("Número reduzido de layers. Considere organizar o desenho com layers separadas para paredes, cotagens, texto, mobiliário, etc.");
  }

  const frozenLayers = layers.filter(l => l.frozen);
  if (frozenLayers.length > layers.length * 0.5) {
    warnings.push(`Muitas layers congeladas (${frozenLayers.length}/${layers.length}). Verifique se toda a informação necessária está visível.`);
  }

  if (!titleBlock.found) {
    warnings.push("Carimbo/legenda não identificado. Deve existir em todas as folhas (Portaria 701-H/2008).");
  }

  if (!northArrow.found) {
    warnings.push("Seta de Norte não identificada nas peças desenhadas.");
  }

  if (!dimensions.hasAssociative) {
    suggestions.push("Considere usar cotagens associativas para manter consistência quando o desenho é alterado.");
  }

  if (dimensions.count === 0) {
    warnings.push("Nenhuma cotagem encontrada. Todas as peças desenhadas devem estar cotadas.");
  }

  const textHeights = textStyles.filter(t => t.height > 0).map(t => t.height);
  if (textHeights.length > 0) {
    const minHeight = Math.min(...textHeights);
    if (minHeight < 1.8) {
      warnings.push(`Textos com altura mínima de ${minHeight}mm. Para escalas de impressão típicas, o mínimo recomendado é 1.8mm (ISO 3098).`);
    }
  }

  // Check for standard layer naming conventions
  const hasStandardLayers = layers.some(l =>
    /^(A-|S-|E-|M-|P-|F-|I-|T-|G-|W-)/i.test(l.name),
  );
  if (!hasStandardLayers && layers.length > 3) {
    suggestions.push("Considere usar nomenclatura de layers normalizada (ex: A-WALL, S-BEAM, E-LIGHT) para melhor organização.");
  }

  // Score calculation
  let score = 100;
  if (!titleBlock.found) score -= 15;
  if (!northArrow.found) score -= 10;
  if (!scaleBar.found) score -= 5;
  if (!legends.found) score -= 10;
  if (dimensions.count === 0) score -= 20;
  if (layers.length < 3) score -= 10;
  if (textHeights.some(h => h < 1.8)) score -= 10;
  if (!hasStandardLayers && layers.length > 3) score -= 5;
  score = Math.max(0, Math.min(100, score));

  return {
    layers,
    textStyles,
    blocks,
    dimensions,
    titleBlock,
    northArrow,
    scaleBar,
    legends,
    viewport,
    entityCounts,
    qualityScore: score,
    warnings,
    suggestions,
  };
}

function parseLayers(lines: string[]): DxfLayer[] {
  const layers: DxfLayer[] = [];
  let inLayerTable = false;
  let current: Partial<DxfLayer> = {};

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "LAYER" && lines[i - 1] === "2" && inLayerTable) {
      // Not a layer entry, skip
    }
    if (lines[i] === "AcDbLayerTableRecord") {
      inLayerTable = true;
      current = {};
      continue;
    }
    if (inLayerTable) {
      if (lines[i] === "2" && i + 1 < lines.length) {
        current.name = lines[i + 1];
      }
      if (lines[i] === "62" && i + 1 < lines.length) {
        current.color = parseInt(lines[i + 1]) || 7;
      }
      if (lines[i] === "6" && i + 1 < lines.length) {
        current.lineType = lines[i + 1];
      }
      if (lines[i] === "70" && i + 1 < lines.length) {
        const flags = parseInt(lines[i + 1]) || 0;
        current.frozen = (flags & 1) !== 0;
      }
      if (lines[i] === "0" && lines[i + 1] !== "LAYER" && current.name) {
        layers.push({
          name: current.name,
          color: current.color ?? 7,
          lineType: current.lineType ?? "Continuous",
          frozen: current.frozen ?? false,
          off: (current.color ?? 0) < 0,
        });
        current = {};
        inLayerTable = false;
      }
    }
  }
  return layers;
}

function parseTextStyles(lines: string[]): DxfTextStyle[] {
  const styles: DxfTextStyle[] = [];
  let inStyle = false;
  let current: Partial<DxfTextStyle> = {};

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "AcDbTextStyleTableRecord") {
      inStyle = true;
      current = {};
      continue;
    }
    if (inStyle) {
      if (lines[i] === "2" && i + 1 < lines.length) {
        current.name = lines[i + 1];
      }
      if (lines[i] === "40" && i + 1 < lines.length) {
        current.height = parseFloat(lines[i + 1]) || 0;
      }
      if (lines[i] === "3" && i + 1 < lines.length) {
        current.font = lines[i + 1];
      }
      if (lines[i] === "0" && current.name) {
        styles.push({
          name: current.name,
          font: current.font ?? "txt",
          height: current.height ?? 0,
        });
        current = {};
        inStyle = false;
      }
    }
  }
  return styles;
}

function parseBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "0" && lines[i + 1] === "BLOCK" && i + 3 < lines.length) {
      // Find block name (group code 2)
      for (let j = i + 2; j < Math.min(i + 20, lines.length); j++) {
        if (lines[j] === "2" && j + 1 < lines.length) {
          const name = lines[j + 1];
          if (!name.startsWith("*")) {
            blocks.push(name);
          }
          break;
        }
      }
    }
  }
  return blocks;
}

function countEntities(lines: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  let inEntities = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "ENTITIES") inEntities = true;
    if (lines[i] === "ENDSEC" && inEntities) break;
    if (inEntities && lines[i] === "0" && i + 1 < lines.length) {
      const type = lines[i + 1];
      if (type && type !== "ENDSEC" && type !== "SECTION") {
        counts[type] = (counts[type] || 0) + 1;
      }
    }
  }
  return counts;
}

function analyzeDimensions(lines: string[], entityCounts: Record<string, number>): { count: number; hasAssociative: boolean } {
  const count = (entityCounts["DIMENSION"] || 0) +
    (entityCounts["LEADER"] || 0) +
    (entityCounts["MLEADER"] || 0);
  const hasAssociative = lines.some(l => l === "ACAD_REACTORS");
  return { count, hasAssociative };
}

function detectTitleBlock(blocks: string[]): { found: boolean; blockName?: string } {
  const patterns = [
    /carimbo/i, /legenda/i, /title.?block/i, /seal/i,
    /quadro/i, /border/i, /moldura/i,
  ];
  for (const block of blocks) {
    if (patterns.some(p => p.test(block))) {
      return { found: true, blockName: block };
    }
  }
  return { found: blocks.length > 0 && blocks.some(b => /^[A-Z]_/i.test(b)) };
}

function detectNorthArrow(blocks: string[], content: string): { found: boolean } {
  const patterns = [/norte/i, /north/i, /compass/i, /rosa.?dos.?ventos/i];
  const found = blocks.some(b => patterns.some(p => p.test(b))) ||
    patterns.some(p => p.test(content.slice(0, 50000)));
  return { found };
}

function detectScaleBar(blocks: string[], content: string): { found: boolean } {
  const patterns = [/escala.?gr[áa]fica/i, /scale.?bar/i, /barra.?escala/i];
  return {
    found: blocks.some(b => patterns.some(p => p.test(b))) ||
      patterns.some(p => p.test(content.slice(0, 50000))),
  };
}

function detectLegends(blocks: string[], content: string): { found: boolean; count: number } {
  const patterns = [/legenda/i, /legend/i, /simbologia/i, /key/i];
  const found = blocks.filter(b => patterns.some(p => p.test(b)));
  return {
    found: found.length > 0 || patterns.some(p => p.test(content.slice(0, 50000))),
    count: Math.max(found.length, content.match(/legenda/gi)?.length ?? 0),
  };
}

function parseViewport(lines: string[]): { scale?: string; paperSize?: string } {
  let scale: string | undefined;
  let paperSize: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    // Viewport scale
    if (lines[i] === "41" && i > 0 && lines[i - 2] === "VIEWPORT") {
      const val = parseFloat(lines[i + 1]);
      if (val > 0) {
        const ratio = Math.round(1 / val);
        if ([20, 50, 100, 200, 500, 1000, 2000].includes(ratio)) {
          scale = `1:${ratio}`;
        }
      }
    }
    // Paper size from layout
    if (lines[i] === "AcDbLayout" || lines[i] === "AcDbPlotSettings") {
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        if (lines[j] === "44" && j + 1 < lines.length) {
          const width = parseFloat(lines[j + 1]);
          if (width > 800 && width < 900) paperSize = "A1";
          else if (width > 550 && width < 650) paperSize = "A2";
          else if (width > 380 && width < 430) paperSize = "A3";
          else if (width > 250 && width < 300) paperSize = "A4";
          break;
        }
      }
    }
  }
  return { scale, paperSize };
}

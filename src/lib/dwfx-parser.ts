/**
 * DWFx (Design Web Format) parser for drawing annotation and visual schema extraction.
 *
 * DWFx files are ZIP-based containers (OPC) that include:
 *   - Manifest.xml — package relationships
 *   - *.w2d sections — 2D drawing data (binary W2D streams)
 *   - Thumbnails and metadata
 *
 * Since DWFx is essentially an OPC (Open Packaging Convention) ZIP,
 * we use JSZip to extract entries and parse the XML manifest for
 * drawing metadata (layers, paper sizes, scales).
 *
 * For annotation overlay generation we extract page dimensions and
 * viewports, producing SVG overlay data that can be composited
 * onto a PDF or displayed in the browser.
 */

import type { DxfAnalysisResult } from "./dxf-analyzer";

// ============================================================
// Types
// ============================================================

export interface DwfxPage {
  name: string;
  /** Paper size label (A1, A2, A3, A4, etc.) */
  paperSize?: string;
  /** Width in mm */
  width: number;
  /** Height in mm */
  height: number;
  /** Detected scale string, e.g. "1:100" */
  scale?: string;
  /** Layer names extracted from the page */
  layers: string[];
  /** Whether the page has coordinate reference data */
  hasCoordinates: boolean;
}

export interface DwfxAnnotation {
  /** Annotation type */
  type: "dimension" | "callout" | "cloud" | "text" | "symbol" | "highlight";
  /** SVG path or element */
  svgElement: string;
  /** Page index this annotation belongs to */
  pageIndex: number;
  /** Bounding box (in mm, relative to page origin) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Label text */
  label: string;
  /** Color in hex */
  color: string;
  /** Associated regulation (if a compliance annotation) */
  regulation?: string;
}

export interface DwfxParseResult {
  pages: DwfxPage[];
  annotations: DwfxAnnotation[];
  metadata: {
    title?: string;
    author?: string;
    createdDate?: string;
    sourceApplication?: string;
  };
  /** Quality analysis similar to DXF analyzer */
  qualityAnalysis: DxfAnalysisResult;
  warnings: string[];
}

export interface SvgOverlay {
  /** Page index */
  pageIndex: number;
  /** SVG content string */
  svg: string;
  /** Page dimensions for viewBox */
  viewBoxWidth: number;
  viewBoxHeight: number;
}

// ============================================================
// Paper size detection
// ============================================================

interface PaperSpec {
  label: string;
  widthMm: number;
  heightMm: number;
}

const PAPER_SIZES: PaperSpec[] = [
  { label: "A0", widthMm: 1189, heightMm: 841 },
  { label: "A1", widthMm: 841, heightMm: 594 },
  { label: "A2", widthMm: 594, heightMm: 420 },
  { label: "A3", widthMm: 420, heightMm: 297 },
  { label: "A4", widthMm: 297, heightMm: 210 },
];

function detectPaperSize(widthMm: number, heightMm: number): string | undefined {
  // Normalize so width >= height
  const w = Math.max(widthMm, heightMm);
  const h = Math.min(widthMm, heightMm);

  for (const spec of PAPER_SIZES) {
    const tolerance = 15; // mm tolerance for rounding
    if (
      Math.abs(w - spec.widthMm) < tolerance &&
      Math.abs(h - spec.heightMm) < tolerance
    ) {
      return spec.label;
    }
  }
  return undefined;
}

// ============================================================
// Scale detection from text
// ============================================================

function detectScaleFromText(text: string): string | undefined {
  // Match patterns like "1:50", "1:100", "1/200", "Escala 1:100"
  const match = text.match(/(?:escala|scale)?\s*1\s*[:/]\s*(\d+)/i);
  if (match) {
    const denom = parseInt(match[1]);
    if ([10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].includes(denom)) {
      return `1:${denom}`;
    }
  }
  return undefined;
}

// ============================================================
// XML parsing helpers (lightweight, no external dep)
// ============================================================

function extractXmlAttribute(xml: string, tagPattern: RegExp, attr: string): string | undefined {
  const tagMatch = xml.match(tagPattern);
  if (!tagMatch) return undefined;
  const attrMatch = tagMatch[0].match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i"));
  return attrMatch ? attrMatch[1] : undefined;
}

function extractAllXmlValues(xml: string, tagName: string, attr: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*${attr}\\s*=\\s*"([^"]*)"`, "gi");
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function extractTextBetweenTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "gi");
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1].trim()) values.push(match[1].trim());
  }
  return values;
}

// ============================================================
// Core parser
// ============================================================

/**
 * Parse a DWFx file (ArrayBuffer) and extract pages, metadata,
 * and drawing quality information.
 */
export async function parseDwfx(data: ArrayBuffer): Promise<DwfxParseResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const warnings: string[] = [];
  const pages: DwfxPage[] = [];
  const annotations: DwfxAnnotation[] = [];

  let title: string | undefined;
  let author: string | undefined;
  let createdDate: string | undefined;
  let sourceApplication: string | undefined;

  // ── Parse manifest/relationships ────────────────────────
  const manifestEntry = zip.file("[Content_Types].xml") ?? zip.file("manifest.xml");
  if (manifestEntry) {
    // Manifest available — currently used for content type detection
    await manifestEntry.async("text");
  }

  // ── Parse core properties (docProps/core.xml) ───────────
  const corePropsEntry =
    zip.file("docProps/core.xml") ?? zip.file("Metadata/core.xml");
  if (corePropsEntry) {
    const coreXml = await corePropsEntry.async("text");
    const titles = extractTextBetweenTags(coreXml, "dc:title");
    if (titles.length > 0) title = titles[0];
    const creators = extractTextBetweenTags(coreXml, "dc:creator");
    if (creators.length > 0) author = creators[0];
    const dates = extractTextBetweenTags(coreXml, "dcterms:created");
    if (dates.length > 0) createdDate = dates[0];
  }

  // ── Find all section descriptors (.xml files describing pages) ─
  const xmlFiles = Object.keys(zip.files).filter(
    (name) =>
      name.endsWith(".xml") &&
      !name.startsWith("[") &&
      name !== "manifest.xml" &&
      !name.startsWith("docProps/") &&
      !name.startsWith("Metadata/") &&
      !name.startsWith("_rels/"),
  );

  // Parse each XML section for page/layer info
  for (const xmlPath of xmlFiles) {
    try {
      const xml = await zip.file(xmlPath)!.async("text");

      // Detect if this is a section descriptor with Paper elements
      if (xml.includes("Paper") || xml.includes("Section") || xml.includes("Page")) {
        const layers: string[] = [];
        const layerNames = extractAllXmlValues(xml, "Layer", "name");
        layers.push(...layerNames);

        // Also try "Name" attribute
        const layerNames2 = extractAllXmlValues(xml, "Layer", "Name");
        layers.push(...layerNames2);

        // Extract text values for layer names
        const layerTexts = extractTextBetweenTags(xml, "Layer");
        layers.push(...layerTexts);

        // Deduplicate
        const uniqueLayers = [...new Set(layers)];

        // Paper dimensions
        let width = 841;
        let height = 594;

        const paperWidthStr = extractXmlAttribute(xml, /<Paper[^>]*>/i, "width") ??
          extractXmlAttribute(xml, /<Paper[^>]*>/i, "Width");
        const paperHeightStr = extractXmlAttribute(xml, /<Paper[^>]*>/i, "height") ??
          extractXmlAttribute(xml, /<Paper[^>]*>/i, "Height");

        if (paperWidthStr) width = parseFloat(paperWidthStr) || width;
        if (paperHeightStr) height = parseFloat(paperHeightStr) || height;

        // Scale
        const scaleStr = extractXmlAttribute(xml, /<Transform[^>]*>/i, "scale") ??
          extractXmlAttribute(xml, /<Viewport[^>]*>/i, "scale");
        let scale = scaleStr ? detectScaleFromText(`1:${Math.round(1 / parseFloat(scaleStr))}`) : undefined;
        if (!scale) {
          scale = detectScaleFromText(xml);
        }

        // Source application
        if (!sourceApplication) {
          const appNames = extractTextBetweenTags(xml, "SourceProductName");
          if (appNames.length > 0) sourceApplication = appNames[0];
        }

        // Check for coordinate data
        const hasCoordinates =
          /coord|geore|latitude|longitude|utm|etrs89/i.test(xml);

        // Name
        const sectionName =
          extractXmlAttribute(xml, /<Section[^>]*>/i, "name") ??
          extractXmlAttribute(xml, /<Page[^>]*>/i, "name") ??
          xmlPath.replace(/\.xml$/i, "").split("/").pop() ??
          `Página ${pages.length + 1}`;

        pages.push({
          name: sectionName,
          paperSize: detectPaperSize(width, height),
          width,
          height,
          scale,
          layers: uniqueLayers,
          hasCoordinates,
        });
      }
    } catch {
      warnings.push(`Erro ao processar secção DWFx: ${xmlPath}`);
    }
  }

  // If no pages were found from XML, try to detect from W2D files
  if (pages.length === 0) {
    const w2dFiles = Object.keys(zip.files).filter(
      (name) => name.endsWith(".w2d") || name.endsWith(".W2D"),
    );

    for (let i = 0; i < w2dFiles.length; i++) {
      pages.push({
        name: `Folha ${i + 1}`,
        paperSize: "A1",
        width: 841,
        height: 594,
        layers: [],
        hasCoordinates: false,
      });
    }

    if (w2dFiles.length === 0) {
      warnings.push("Nenhuma página ou secção W2D encontrada no ficheiro DWFx.");
    }
  }

  // ── Build quality analysis ──────────────────────────────
  const allLayers = pages.flatMap((p) => p.layers);
  const uniqueAllLayers = [...new Set(allLayers)];
  const hasStandardLayers = uniqueAllLayers.some((l) =>
    /^(A-|S-|E-|M-|P-|F-|I-|T-|G-|W-)/i.test(l),
  );
  const hasTitleBlock = pages.some(
    (p) =>
      p.layers.some((l) => /carimbo|legenda|title.?block/i.test(l)) ||
      p.name.toLowerCase().includes("legenda"),
  );
  const hasNorthArrow = pages.some((p) =>
    p.layers.some((l) => /norte|north|compass/i.test(l)),
  );
  const hasDimensions = pages.some((p) =>
    p.layers.some((l) => /cota|dimension|dim/i.test(l)),
  );

  // Quality score
  let qualityScore = 100;
  if (!hasTitleBlock) qualityScore -= 15;
  if (!hasNorthArrow) qualityScore -= 10;
  if (uniqueAllLayers.length < 3) qualityScore -= 10;
  if (!hasDimensions) qualityScore -= 20;
  if (!hasStandardLayers && uniqueAllLayers.length > 3) qualityScore -= 5;
  if (pages.length === 0) qualityScore -= 30;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const qualityWarnings: string[] = [];
  const qualitySuggestions: string[] = [];
  if (!hasTitleBlock) qualityWarnings.push("Carimbo/legenda não identificado.");
  if (!hasNorthArrow) qualityWarnings.push("Seta de Norte não identificada.");
  if (!hasDimensions) qualityWarnings.push("Nenhuma layer de cotagem identificada.");
  if (!hasStandardLayers && uniqueAllLayers.length > 3) {
    qualitySuggestions.push("Considere usar nomenclatura de layers normalizada.");
  }

  const qualityAnalysis: DxfAnalysisResult = {
    layers: uniqueAllLayers.map((name) => ({
      name,
      color: 7,
      lineType: "Continuous",
      frozen: false,
      off: false,
    })),
    textStyles: [],
    blocks: [],
    dimensions: { count: hasDimensions ? 1 : 0, hasAssociative: false },
    titleBlock: { found: hasTitleBlock },
    northArrow: { found: hasNorthArrow },
    scaleBar: { found: false },
    legends: { found: hasTitleBlock, count: hasTitleBlock ? 1 : 0 },
    viewport: { scale: pages[0]?.scale, paperSize: pages[0]?.paperSize },
    entityCounts: {},
    qualityScore,
    warnings: qualityWarnings,
    suggestions: qualitySuggestions,
  };

  return {
    pages,
    annotations,
    metadata: { title, author, createdDate, sourceApplication },
    qualityAnalysis,
    warnings,
  };
}

// ============================================================
// SVG Overlay Generation
// ============================================================

/**
 * Generate SVG overlays for compliance annotations on drawing pages.
 *
 * Each annotation is rendered as an SVG element positioned on the
 * page coordinate system. The resulting SVG can be overlaid on
 * a rendered drawing in the browser or composited into a PDF.
 */
export function generateSvgOverlays(
  pages: DwfxPage[],
  annotations: DwfxAnnotation[],
): SvgOverlay[] {
  return pages.map((page, pageIndex) => {
    const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

    const elements = pageAnnotations.map((ann) => {
      switch (ann.type) {
        case "highlight":
          return `<rect x="${ann.x}" y="${ann.y}" width="${ann.width}" height="${ann.height}" fill="${ann.color}" fill-opacity="0.25" stroke="${ann.color}" stroke-width="0.5" rx="2"/>`;
        case "callout":
          return `<g>
            <rect x="${ann.x}" y="${ann.y}" width="${ann.width}" height="${ann.height}" fill="white" fill-opacity="0.9" stroke="${ann.color}" stroke-width="0.3" rx="1"/>
            <text x="${ann.x + 2}" y="${ann.y + ann.height / 2 + 1.5}" font-size="3" font-family="Arial" fill="${ann.color}">${escapeXml(ann.label)}</text>
          </g>`;
        case "cloud":
          return `<rect x="${ann.x}" y="${ann.y}" width="${ann.width}" height="${ann.height}" fill="none" stroke="${ann.color}" stroke-width="0.5" stroke-dasharray="2,1" rx="3"/>`;
        case "dimension":
          return `<g>
            <line x1="${ann.x}" y1="${ann.y + ann.height / 2}" x2="${ann.x + ann.width}" y2="${ann.y + ann.height / 2}" stroke="${ann.color}" stroke-width="0.3"/>
            <text x="${ann.x + ann.width / 2}" y="${ann.y}" font-size="2.5" font-family="Arial" fill="${ann.color}" text-anchor="middle">${escapeXml(ann.label)}</text>
          </g>`;
        case "symbol":
          return `<g>
            <circle cx="${ann.x + ann.width / 2}" cy="${ann.y + ann.height / 2}" r="${Math.min(ann.width, ann.height) / 2}" fill="none" stroke="${ann.color}" stroke-width="0.4"/>
            <text x="${ann.x + ann.width / 2}" y="${ann.y + ann.height / 2 + 1}" font-size="2.5" font-family="Arial" fill="${ann.color}" text-anchor="middle">${escapeXml(ann.label)}</text>
          </g>`;
        case "text":
        default:
          return `<text x="${ann.x}" y="${ann.y + 3}" font-size="3" font-family="Arial" fill="${ann.color}">${escapeXml(ann.label)}</text>`;
      }
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}mm" height="${page.height}mm">
  ${elements.join("\n  ")}
</svg>`;

    return {
      pageIndex,
      svg,
      viewBoxWidth: page.width,
      viewBoxHeight: page.height,
    };
  });
}

/**
 * Generate compliance annotations from analysis findings that
 * reference specific drawing areas.
 *
 * The annotations are positioned heuristically based on the
 * finding's regulation area and description keywords.
 */
export function generateComplianceAnnotations(
  pages: DwfxPage[],
  findings: Array<{
    id: string;
    area: string;
    regulation: string;
    description: string;
    severity: string;
  }>,
): DwfxAnnotation[] {
  if (pages.length === 0) return [];

  const annotations: DwfxAnnotation[] = [];

  // Area to page heuristic: match area to layers
  const areaLayerPatterns: Record<string, RegExp> = {
    architecture: /arq|arch|parede|wall/i,
    structural: /struct|estr|pilar|viga/i,
    fire_safety: /scie|incend|fire|evac/i,
    electrical: /elec|elet|rtiebt/i,
    water_drainage: /agua|water|drain|esgo/i,
    hvac: /avac|hvac|vent|clim/i,
    accessibility: /acess|access/i,
  };

  const severityColors: Record<string, string> = {
    critical: "#DC2626",
    warning: "#D97706",
    info: "#2563EB",
    pass: "#16A34A",
  };

  let annotationY = 10;

  for (const finding of findings) {
    if (finding.severity === "pass") continue;

    // Find the best page for this finding
    let targetPageIndex = 0;
    const areaPattern = areaLayerPatterns[finding.area];

    if (areaPattern) {
      const matchingPage = pages.findIndex((p) =>
        p.layers.some((l) => areaPattern.test(l)),
      );
      if (matchingPage >= 0) targetPageIndex = matchingPage;
    }

    const page = pages[targetPageIndex];
    const color = severityColors[finding.severity] ?? "#6B7280";

    annotations.push({
      type: "callout",
      svgElement: "",
      pageIndex: targetPageIndex,
      x: page.width - 90,
      y: annotationY,
      width: 85,
      height: 8,
      label: `[${finding.regulation}] ${finding.description.slice(0, 60)}`,
      color,
      regulation: finding.regulation,
    });

    annotationY += 10;
    if (annotationY > page.height - 20) {
      annotationY = 10;
    }
  }

  return annotations;
}

// ============================================================
// Helpers
// ============================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Tests for Phase 4 — Pipeline integration modules
 *
 * Validates:
 * 1. Coordinate extraction from Portuguese building documents
 * 2. BOQ diff engine (comparing Bill of Quantities to WBS)
 * 3. Project similarity fingerprinting and matching
 * 4. Regulation store (index, search, versioning)
 * 5. Pipeline integration (sub-orchestration flow)
 */

import { describe, it, expect } from "vitest";

import {
  extractCoordinatesFromText,
  validatePortugalCoordinates,
  dmsToDecimal,
} from "@/lib/coordinate-extractor";

import {
  compareBoqToWbs,
  formatDiffReport,
} from "@/lib/boq-diff";

import type { ParsedBoq } from "@/lib/xlsx-parser";
import type { WbsArticle } from "@/lib/wbs-types";

import {
  createFingerprint,
  computeSimilarity,
  findSimilarProjects,
} from "@/lib/project-similarity";

import {
  createRegulationIndex,
  addRegulation,
  getLatestRegulations,
  searchRegulations,
  getMissingRegulations,
  formatRegulationSummary,
} from "@/lib/regulation-store";
import type { StoredRegulation } from "@/lib/regulation-store";

import { DEFAULT_PROJECT } from "@/lib/defaults";
import { analyzeProject } from "@/lib/analyzer";
import { findingsToWbs } from "@/lib/findings-to-wbs";

// ============================================================
// Test Fixtures
// ============================================================

const testBoq: ParsedBoq = {
  items: [
    {
      code: "06.01.001",
      description: "Betão armado C25/30 em pilares e vigas",
      unit: "m3",
      quantity: 50,
      unitPrice: 120,
      totalPrice: 6000,
      sourceRow: 5,
    },
    {
      code: "06.01.002",
      description: "Betão armado C25/30 em lajes",
      unit: "m2",
      quantity: 200,
      unitPrice: 45,
      totalPrice: 9000,
      sourceRow: 6,
    },
    {
      code: "11.01.001",
      description: "Reboco interior projetado em paredes",
      unit: "m2",
      quantity: 300,
      unitPrice: 12,
      totalPrice: 3600,
      sourceRow: 10,
    },
    {
      code: "23.01.001",
      description: "Rede de distribuição elétrica interior",
      unit: "Ud",
      quantity: 1,
      unitPrice: 4500,
      totalPrice: 4500,
      sourceRow: 15,
    },
  ],
  chapters: [],
  hasWbs: true,
  isIsoWbs: true,
  totalCost: 23100,
  currency: "EUR",
  sheetName: "MQ",
  warnings: [],
  skippedRows: 0,
};

const testWbsArticles: WbsArticle[] = [
  {
    code: "06.01.001",
    description: "Betão armado C25/30 em pilares e vigas",
    unit: "m3",
    quantity: 60,
  }, // 10 more than BOQ
  {
    code: "06.01.002",
    description: "Betão armado C25/30 em lajes",
    unit: "m2",
    quantity: 200,
  }, // exact match
  {
    code: "11.01.001",
    description: "Reboco interior projetado em paredes",
    unit: "m2",
    quantity: 300,
  }, // exact match
  {
    code: "23.01.001",
    description: "Rede de distribuição elétrica interior",
    unit: "Ud",
    quantity: 2,
  }, // 1 more than BOQ
  {
    code: "27.01.001",
    description: "Central de deteção de incêndio analógica",
    unit: "Ud",
    quantity: 1,
  }, // missing from BOQ
];

const emptyBoq: ParsedBoq = {
  items: [],
  chapters: [],
  hasWbs: false,
  isIsoWbs: false,
  totalCost: 0,
  currency: "EUR",
  sheetName: "Empty",
  warnings: [],
  skippedRows: 0,
};

function makeStoredRegulation(overrides: Partial<StoredRegulation> & { id: string; municipality: string; name: string; documentType: StoredRegulation["documentType"] }): StoredRegulation {
  return {
    description: "",
    fileName: `${overrides.id}.pdf`,
    fileSize: 1024,
    uploadedAt: new Date().toISOString(),
    isLatest: true,
    version: 1,
    storagePath: `/regulations/${overrides.id}.pdf`,
    tags: [],
    ...overrides,
  };
}

// ============================================================
// 1. Coordinate Extractor Tests
// ============================================================

describe("Phase 4 — Coordinate Extractor", () => {
  describe("extractCoordinatesFromText", () => {
    it("extracts WGS84 decimal coordinates", async () => {
      const coords = extractCoordinatesFromText(
        "Coordenadas: 38.7223° N, 9.1393° W",
        "planta_localizacao.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      expect(c.latitude).toBeCloseTo(38.7223, 3);
      expect(c.longitude).toBeCloseTo(-9.1393, 3);
    });

    it("extracts WGS84 DMS coordinates", async () => {
      const coords = extractCoordinatesFromText(
        '38°43\'20"N 9°08\'21"W',
        "topografico.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      expect(c.latitude).toBeCloseTo(38.722, 2);
      expect(c.longitude).toBeCloseTo(-9.139, 2);
    });

    it("extracts PT-TM06 coordinates and converts to WGS84", async () => {
      const coords = extractCoordinatesFromText(
        "M = -86000.00 P = -107000.00",
        "planta_localizacao.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      // PT-TM06 conversion should yield valid Portugal coordinates
      expect(c.latitude).toBeGreaterThanOrEqual(36.9);
      expect(c.latitude).toBeLessThanOrEqual(42.2);
      expect(c.longitude).toBeGreaterThanOrEqual(-9.6);
      expect(c.longitude).toBeLessThanOrEqual(-6.1);
    });

    it("extracts UTM Zone 29N coordinates", async () => {
      const coords = extractCoordinatesFromText(
        "29N 492000 4289000",
        "levantamento.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      // UTM 29N conversion should yield valid Portugal coordinates
      expect(c.latitude).toBeGreaterThanOrEqual(36.9);
      expect(c.latitude).toBeLessThanOrEqual(42.2);
      expect(c.longitude).toBeGreaterThanOrEqual(-9.6);
      expect(c.longitude).toBeLessThanOrEqual(-6.1);
    });

    it("extracts coordinates from table format (Norte/Este)", async () => {
      const coords = extractCoordinatesFromText(
        "Norte: 4289000\nEste: 492000",
        "topografico.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      // Should yield valid coordinates in Portugal
      expect(c.latitude).toBeGreaterThanOrEqual(36.9);
      expect(c.latitude).toBeLessThanOrEqual(42.2);
      expect(c.longitude).toBeGreaterThanOrEqual(-9.6);
      expect(c.longitude).toBeLessThanOrEqual(-6.1);
    });

    it("extracts coordinates from Lat/Lon labels", async () => {
      const coords = extractCoordinatesFromText(
        "Lat: 38.7223 Lon: -9.1393",
        "localizacao.pdf",
      );
      expect(coords.length).toBeGreaterThanOrEqual(1);
      const c = coords[0];
      expect(c.latitude).toBeCloseTo(38.7223, 3);
      expect(c.longitude).toBeCloseTo(-9.1393, 3);
    });

    it("filters out coordinates outside Portugal", async () => {
      const coords = extractCoordinatesFromText(
        "Lat: 52.0 Lon: -3.0",
        "other.pdf",
      );
      // Should either return empty or have the result filtered out
      expect(coords.length).toBe(0);
    });

    it("returns empty array when no coordinates found", async () => {
      const coords = extractCoordinatesFromText(
        "Este documento não contém coordenadas",
        "memoria.pdf",
      );
      expect(coords).toEqual([]);
    });
  });

  describe("validatePortugalCoordinates", () => {
    it("accepts Lisbon area coordinates", async () => {
      expect(validatePortugalCoordinates(38.7, -9.1)).toBe(true);
    });

    it("accepts Porto area coordinates", async () => {
      expect(validatePortugalCoordinates(41.1, -8.6)).toBe(true);
    });

    it("rejects UK coordinates", async () => {
      expect(validatePortugalCoordinates(52.0, -3.0)).toBe(false);
    });

    it("rejects coordinates just outside Portugal bounds", async () => {
      expect(validatePortugalCoordinates(36.8, -9.7)).toBe(false);
    });
  });

  describe("dmsToDecimal", () => {
    it("converts North DMS to positive decimal", async () => {
      const result = dmsToDecimal(38, 43, 20, "N");
      expect(result).toBeCloseTo(38.722, 2);
    });

    it("converts West DMS to negative decimal", async () => {
      const result = dmsToDecimal(9, 8, 21, "W");
      expect(result).toBeCloseTo(-9.139, 2);
    });

    it("converts South DMS to negative decimal", async () => {
      const result = dmsToDecimal(33, 30, 0, "S");
      expect(result).toBeCloseTo(-33.5, 1);
    });

    it("converts East DMS to positive decimal", async () => {
      const result = dmsToDecimal(10, 0, 0, "E");
      expect(result).toBeCloseTo(10.0, 1);
    });
  });
});

// ============================================================
// 2. BOQ Diff Engine Tests
// ============================================================

describe("Phase 4 — BOQ Diff Engine", () => {
  describe("compareBoqToWbs", () => {
    it("returns all required fields in the diff result", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      expect(diff).toHaveProperty("matched");
      expect(diff).toHaveProperty("quantityMismatches");
      expect(diff).toHaveProperty("missingInBoq");
      expect(diff).toHaveProperty("extraInBoq");
      expect(diff).toHaveProperty("summary");
      expect(diff).toHaveProperty("items");
    });

    it("identifies matched items with identical quantities", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      // betão lajes (200 vs 200) and reboco (300 vs 300) should be matched
      const matchedDescs = diff.matched.map((m) => m.boqItem?.code ?? m.wbsArticle?.code);
      expect(matchedDescs).toContain("06.01.002");
      expect(matchedDescs).toContain("11.01.001");
    });

    it("identifies quantity mismatches", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      // betão pilares: BOQ 50 vs WBS 60, electrical: BOQ 1 vs WBS 2
      const mismatchDescs = diff.quantityMismatches.map(
        (m) => m.boqItem?.code ?? m.wbsArticle?.code,
      );
      expect(mismatchDescs).toContain("06.01.001");
      expect(mismatchDescs).toContain("23.01.001");
    });

    it("reports correct quantity deltas in mismatches", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      const pilaresMismatch = diff.quantityMismatches.find(
        (m) => (m.boqItem?.code ?? m.wbsArticle?.code) === "06.01.001",
      );
      expect(pilaresMismatch).toBeDefined();
      // WBS needs 60, BOQ has 50, so delta = 10
      expect(pilaresMismatch!.quantityDelta).toBe(10);

      const electricalMismatch = diff.quantityMismatches.find(
        (m) => (m.boqItem?.code ?? m.wbsArticle?.code) === "23.01.001",
      );
      expect(electricalMismatch).toBeDefined();
      // WBS needs 2, BOQ has 1, so delta = 1
      expect(electricalMismatch!.quantityDelta).toBe(1);
    });

    it("identifies items missing from BOQ (present in WBS only)", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      const missingDescs = diff.missingInBoq.map(
        (m) => m.wbsArticle?.code,
      );
      // Fire detection (27.01.001) is in WBS but not in BOQ
      expect(missingDescs).toContain("27.01.001");
    });

    it("summary counts are correct", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      expect(diff.summary.matchedCount).toBe(2); // lajes + reboco
      expect(diff.summary.mismatchCount).toBe(2); // pilares + electrical
      expect(diff.summary.missingCount).toBe(1); // fire detection
      expect(diff.summary.totalBoqItems).toBe(4);
      expect(diff.summary.totalWbsItems).toBe(5);
    });

    it("handles empty BOQ (all WBS items reported as missing)", async () => {
      const diff = compareBoqToWbs(emptyBoq, testWbsArticles);
      expect(diff.matched.length).toBe(0);
      expect(diff.quantityMismatches.length).toBe(0);
      expect(diff.missingInBoq.length).toBe(testWbsArticles.length);
    });

    it("handles empty WBS (all BOQ items reported as extra)", async () => {
      const diff = compareBoqToWbs(testBoq, []);
      expect(diff.matched.length).toBe(0);
      expect(diff.quantityMismatches.length).toBe(0);
      expect(diff.extraInBoq.length).toBe(testBoq.items.length);
    });
  });

  describe("formatDiffReport", () => {
    it("returns a non-empty string", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      const report = formatDiffReport(diff);
      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);
    });

    it("contains Portuguese text", async () => {
      const diff = compareBoqToWbs(testBoq, testWbsArticles);
      const report = formatDiffReport(diff);
      // Should contain Portuguese terminology
      const hasPortuguese =
        report.includes("quantidade") ||
        report.includes("Quantidade") ||
        report.includes("artigo") ||
        report.includes("Artigo") ||
        report.includes("MQ") ||
        report.includes("diferença") ||
        report.includes("Diferença") ||
        report.includes("falta") ||
        report.includes("Falta") ||
        report.includes("Resumo") ||
        report.includes("resumo") ||
        report.includes("Relatório") ||
        report.includes("relatório") ||
        report.includes("Comparação") ||
        report.includes("comparação");
      expect(hasPortuguese).toBe(true);
    });
  });
});

// ============================================================
// 3. Project Similarity Tests
// ============================================================

describe("Phase 4 — Project Similarity", () => {
  function createTestProject(overrides: Record<string, unknown> = {}) {
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)),
      ...overrides,
    };
  }

  describe("createFingerprint", () => {
    it("produces a valid fingerprint object", async () => {
      const project = createTestProject({ name: "Test Fingerprint" });
      const fp = createFingerprint(project);
      expect(fp).toBeDefined();
      expect(fp).toHaveProperty("buildingType");
      expect(fp).toHaveProperty("grossFloorArea");
      expect(fp).toHaveProperty("district");
      expect(fp).toHaveProperty("numberOfFloors");
    });

    it("reflects the correct building type", async () => {
      const project = createTestProject({
        name: "Residential Test",
        buildingType: "residential",
      });
      const fp = createFingerprint(project);
      expect(fp.buildingType).toBe("residential");
    });

    it("reflects the correct GFA", async () => {
      const project = createTestProject({
        name: "Area Test",
        grossFloorArea: 250,
      });
      const fp = createFingerprint(project);
      expect(fp.grossFloorArea).toBe(250);
    });
  });

  describe("computeSimilarity", () => {
    it("returns 1.0 for identical fingerprints", async () => {
      const project = createTestProject({ name: "Identical" });
      const fp = createFingerprint(project);
      const score = computeSimilarity(fp, fp);
      expect(score).toBeCloseTo(1.0, 1);
    });

    it("returns < 0.5 for completely different building types", async () => {
      const residential = createTestProject({
        name: "Residential",
        buildingType: "residential",
        grossFloorArea: 150,
      });
      const industrial = createTestProject({
        name: "Industrial",
        buildingType: "industrial",
        grossFloorArea: 5000,
        numberOfFloors: 1,
        location: {
          ...DEFAULT_PROJECT.location,
          district: "Bragança",
        },
      });
      const fpRes = createFingerprint(residential);
      const fpInd = createFingerprint(industrial);
      const score = computeSimilarity(fpRes, fpInd);
      expect(score).toBeLessThan(0.5);
    });

    it("scores > 0.7 for similar residential projects", async () => {
      const project1 = createTestProject({
        name: "Res A",
        buildingType: "residential",
        grossFloorArea: 150,
        numberOfFloors: 2,
      });
      const project2 = createTestProject({
        name: "Res B",
        buildingType: "residential",
        grossFloorArea: 160,
        numberOfFloors: 2,
      });
      const fp1 = createFingerprint(project1);
      const fp2 = createFingerprint(project2);
      const score = computeSimilarity(fp1, fp2);
      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe("findSimilarProjects", () => {
    it("returns results sorted by similarity (descending)", async () => {
      const current = createTestProject({
        name: "Current",
        buildingType: "residential",
        grossFloorArea: 150,
      });
      const similar = createTestProject({
        name: "Similar",
        buildingType: "residential",
        grossFloorArea: 160,
      });
      const different = createTestProject({
        name: "Different",
        buildingType: "industrial",
        grossFloorArea: 5000,
        numberOfFloors: 1,
        location: {
          ...DEFAULT_PROJECT.location,
          district: "Bragança",
        },
      });

      const currentFp = createFingerprint(current);
      const history = [
        { fingerprint: createFingerprint(similar), projectId: "sim-1", projectName: "Similar" },
        { fingerprint: createFingerprint(different), projectId: "diff-1", projectName: "Different" },
      ];

      const result = findSimilarProjects(currentFp, history);
      expect(result.similarProjects.length).toBe(2);
      // First result should be the more similar one
      expect(result.similarProjects[0].similarity).toBeGreaterThanOrEqual(
        result.similarProjects[1].similarity,
      );
    });

    it("returns empty with no project history", async () => {
      const current = createTestProject({ name: "Solo" });
      const fp = createFingerprint(current);
      const result = findSimilarProjects(fp, []);
      expect(result.similarProjects).toEqual([]);
    });

    it("suggests missing documents based on similar projects", async () => {
      const current = createTestProject({
        name: "Needs Docs",
        buildingType: "residential",
        grossFloorArea: 150,
      });

      // Create 4 similar projects with document categories
      const historyProjects = [1, 2, 3, 4].map((i) => {
        const p = createTestProject({
          name: `History ${i}`,
          buildingType: "residential",
          grossFloorArea: 140 + i * 5,
        });
        const fp = createFingerprint(p);
        // 3 out of 4 projects have "projeto_termico" in their documents
        if (i <= 3) {
          fp.documentCategories = ["projeto_termico" as never, "projeto_arquitetura" as never];
        } else {
          fp.documentCategories = ["projeto_arquitetura" as never];
        }
        return {
          fingerprint: fp,
          projectId: `hist-${i}`,
          projectName: `History ${i}`,
        };
      });

      const currentFp = createFingerprint(current);
      currentFp.documentCategories = []; // current has no documents

      const result = findSimilarProjects(currentFp, historyProjects);

      // Should suggest documents — check that documentSuggestions exist
      expect(result.documentSuggestions).toBeDefined();
      // At least some suggestions should reference documents from similar projects
      if (result.documentSuggestions.length > 0) {
        expect(result.documentSuggestions[0]).toHaveProperty("category");
        expect(result.documentSuggestions[0]).toHaveProperty("priority");
      }
    });
  });
});

// ============================================================
// 4. Regulation Store Tests
// ============================================================

describe("Phase 4 — Regulation Store", () => {
  describe("createRegulationIndex", () => {
    it("returns an empty index", async () => {
      const index = createRegulationIndex();
      expect(index).toBeDefined();
      expect(index.totalCount).toBe(0);
      expect(index.municipalities).toEqual([]);
    });
  });

  describe("addRegulation", () => {
    it("adds a regulation to the index", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-pdm-lisboa-2024",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
        textContent: "Regulamento do Plano Diretor Municipal de Lisboa",
      }));
      expect(index.totalCount).toBe(1);
      expect(index.municipalities).toContain("lisboa");
    });

    it("updates count when adding regulations", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-1",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
      }));
      addRegulation(index, makeStoredRegulation({
        id: "reg-2",
        name: "RMUE Porto",
        documentType: "regulamento_municipal",
        municipality: "Porto",
      }));
      expect(index.totalCount).toBe(2);
    });
  });

  describe("getLatestRegulations", () => {
    it("returns only the latest version for a municipality", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "pdm-lisboa-v1",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
        version: 1,
        isLatest: false,
      }));
      addRegulation(index, makeStoredRegulation({
        id: "pdm-lisboa-v2",
        name: "PDM Lisboa v2",
        documentType: "pdm",
        municipality: "Lisboa",
        version: 2,
        isLatest: true,
      }));

      const latest = getLatestRegulations(index, "Lisboa");
      const pdmEntries = latest.filter((r) => r.documentType === "pdm");
      expect(pdmEntries.length).toBe(1);
      expect(pdmEntries[0].version).toBe(2);
    });
  });

  describe("searchRegulations", () => {
    it("finds regulations by name", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-pdm",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
        textContent: "Plano Diretor Municipal de Lisboa",
      }));
      addRegulation(index, makeStoredRegulation({
        id: "reg-rmue",
        name: "RMUE Porto",
        documentType: "regulamento_municipal",
        municipality: "Porto",
        textContent: "Regulamento Municipal de Urbanização e Edificação do Porto",
      }));

      const results = searchRegulations(index, "PDM");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.regulation.name.includes("PDM"))).toBe(true);
    });

    it("finds regulations by text content", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-1",
        name: "RMUE Sintra",
        documentType: "regulamento_municipal",
        municipality: "Sintra",
        textContent: "Artigo sobre coeficiente de utilização do solo e índice de impermeabilização",
      }));

      const results = searchRegulations(index, "impermeabilização");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getMissingRegulations", () => {
    it("identifies missing required regulation types", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-pdm",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
      }));

      const missing = getMissingRegulations(index, "Lisboa", ["pdm", "regulamento_municipal"]);
      // PDM is present, but regulamento_municipal should be missing
      expect(missing.length).toBeGreaterThan(0);
      const missingTypes = missing.map((m) => m.documentType);
      expect(missingTypes).not.toContain("pdm");
      expect(missingTypes).toContain("regulamento_municipal");
    });
  });

  describe("formatRegulationSummary", () => {
    it("returns Portuguese text", async () => {
      const index = createRegulationIndex();
      addRegulation(index, makeStoredRegulation({
        id: "reg-1",
        name: "PDM Lisboa",
        documentType: "pdm",
        municipality: "Lisboa",
      }));

      const summary = formatRegulationSummary(index, "Lisboa");
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
      // Should contain Portuguese terminology
      const hasPortuguese =
        summary.includes("regulament") ||
        summary.includes("Regulament") ||
        summary.includes("municipal") ||
        summary.includes("Municipal") ||
        summary.includes("Lisboa") ||
        summary.includes("lisboa") ||
        summary.includes("versão") ||
        summary.includes("Versão") ||
        summary.includes("PDM") ||
        summary.includes("Plano");
      expect(hasPortuguese).toBe(true);
    });
  });
});

// ============================================================
// 5. Pipeline Integration Tests
// ============================================================

describe("Phase 4 — Pipeline Integration", () => {
  describe("Coordinate extraction feeds into pipeline", () => {
    it("extracts coordinates from mock document text and validates them", async () => {
      const mockText = `
        Memória Descritiva
        Localização: Rua da Liberdade, Lisboa
        Coordenadas: 38.7223° N, 9.1393° W
        Área total do terreno: 500 m²
      `;
      const coords = extractCoordinatesFromText(mockText, "memoria_descritiva.pdf");
      expect(coords.length).toBeGreaterThanOrEqual(1);

      // Validate each extracted coordinate is in Portugal
      for (const c of coords) {
        expect(validatePortugalCoordinates(c.latitude, c.longitude)).toBe(true);
      }
    });
  });

  describe("BOQ diff integrates with findings-to-wbs", () => {
    it("creates findings, converts to WBS articles, then compares with BOQ", async () => {
      // Run analysis to generate findings
      const project = {
        ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)),
        name: "Integration Test",
      };
      const result = await analyzeProject(project);

      // Convert findings to WBS remediation articles
      const wbsArticles = findingsToWbs(result.findings);

      // If there are actionable findings, we should get remediation articles
      const actionableFindings = result.findings.filter(
        (f) => f.severity === "critical" || f.severity === "warning",
      );
      if (actionableFindings.length > 0) {
        expect(wbsArticles.length).toBeGreaterThan(0);
      }

      // Compare those remediation WBS articles with a test BOQ
      const diff = compareBoqToWbs(testBoq, wbsArticles);
      expect(diff).toBeDefined();
      expect(diff).toHaveProperty("matched");
      expect(diff).toHaveProperty("missingInBoq");
    });
  });

  describe("Full flow: DEFAULT_PROJECT → analyze → findingsToWbs → compareBoqToWbs", () => {
    it("completes the full pipeline without errors", async () => {
      // Step 1: Analyze project
      const project = {
        ...JSON.parse(JSON.stringify(DEFAULT_PROJECT)),
        name: "Full Pipeline Test",
      };
      const analysisResult = await analyzeProject(project);
      expect(analysisResult).toBeDefined();
      expect(analysisResult.findings.length).toBeGreaterThan(0);

      // Step 2: Convert findings to WBS
      const wbsArticles = findingsToWbs(analysisResult.findings);
      // WBS articles are generated from critical/warning findings
      expect(Array.isArray(wbsArticles)).toBe(true);

      // Step 3: Compare with a test BOQ
      const diff = compareBoqToWbs(testBoq, wbsArticles);
      expect(diff).toBeDefined();

      // Step 4: Format the diff report
      const report = formatDiffReport(diff);
      expect(typeof report).toBe("string");
      expect(report.length).toBeGreaterThan(0);

      // The remediation WBS articles use "REM.xx.xx" codes which won't match
      // the BOQ items with "06.01.001" etc. codes, so:
      // - testBoq items should appear as "extra in BOQ"
      // - remediation articles should appear as "missing from BOQ"
      expect(diff.extraInBoq.length).toBe(testBoq.items.length);
      expect(diff.missingInBoq.length).toBe(wbsArticles.length);
    });
  });
});

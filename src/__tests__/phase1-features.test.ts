/**
 * Tests for Phase 1 features:
 * 1. Auth guard (email domain + MFA helpers)
 * 2. Document checklist (RJUE)
 * 3. XLS parser (BOQ detection)
 * 4. ZIP processor (classification heuristics)
 */

import { describe, it, expect } from "vitest";
import { isAllowedEmail } from "@/lib/auth-guard";
import {
  evaluateChecklist,
  contextFromProject,
  getAllDocumentDefinitions,
  type ChecklistContext,
} from "@/lib/document-checklist";
import type { DocumentCategory } from "@/lib/zip-processor";

// ============================================================
// 1. Auth Guard
// ============================================================

describe("Auth Guard - isAllowedEmail", () => {
  it("allows @wallnut.pt emails", () => {
    expect(isAllowedEmail("user@wallnut.pt")).toBe(true);
    expect(isAllowedEmail("admin@wallnut.pt")).toBe(true);
    expect(isAllowedEmail("UPPER@WALLNUT.PT")).toBe(true);
  });

  it("rejects non-wallnut emails", () => {
    expect(isAllowedEmail("user@gmail.com")).toBe(false);
    expect(isAllowedEmail("user@wallnut.com")).toBe(false);
    expect(isAllowedEmail("user@notwallnut.pt")).toBe(false);
    expect(isAllowedEmail("@wallnut.pt")).toBe(false);
  });

  it("rejects empty or invalid emails", () => {
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail("not-an-email")).toBe(false);
  });
});

// ============================================================
// 2. Document Checklist
// ============================================================

describe("Document Checklist - RJUE", () => {
  const baseContext: ChecklistContext = {
    projectPhase: "licensing",
    buildingType: "residential",
    grossFloorArea: 200,
    numberOfFloors: 2,
    numberOfDwellings: 1,
    isRehabilitation: false,
    isInARU: false,
    isProtectedArea: false,
    buildingHeight: 7,
    hasElevator: false,
    hasGasInstallation: false,
    isUrbanization: false,
  };

  it("returns all document definitions", () => {
    const docs = getAllDocumentDefinitions();
    expect(docs.length).toBeGreaterThan(15);
  });

  it("identifies mandatory documents for licensing phase", () => {
    const result = evaluateChecklist(baseContext, []);
    const mandatory = result.items.filter(
      i => i.isRequired && i.document.requirement === "mandatory",
    );
    expect(mandatory.length).toBeGreaterThan(5);
    // All should be missing since no files were uploaded
    expect(result.summary.present).toBe(0);
    expect(result.summary.completenessPercent).toBe(0);
  });

  it("marks present documents correctly", () => {
    const uploadedCategories: DocumentCategory[] = [
      "caderneta_predial",
      "certidao_registo",
      "memoria_descritiva",
      "planta_localizacao",
      "plantas_arquitetura",
      "alcados",
      "cortes",
    ];
    const result = evaluateChecklist(baseContext, uploadedCategories);
    expect(result.summary.present).toBeGreaterThan(0);
    expect(result.summary.completenessPercent).toBeGreaterThan(0);
  });

  it("has 100% completeness when all documents are present", () => {
    // Get all required categories
    const result = evaluateChecklist(baseContext, []);
    const requiredCategories = result.items
      .filter(i => i.isRequired)
      .flatMap(i => i.document.matchCategories);

    const fullResult = evaluateChecklist(baseContext, requiredCategories);
    expect(fullResult.summary.completenessPercent).toBe(100);
    expect(fullResult.missingMandatory.length).toBe(0);
  });

  it("PIP phase requires fewer documents", () => {
    const pipContext: ChecklistContext = { ...baseContext, projectPhase: "pip" };
    const resultPip = evaluateChecklist(pipContext, []);
    const resultLicensing = evaluateChecklist(baseContext, []);

    expect(resultPip.summary.totalRequired).toBeLessThan(resultLicensing.summary.totalRequired);
  });

  it("gas project is conditional on hasGasInstallation", () => {
    const withoutGas = evaluateChecklist(baseContext, []);
    const gasDoc = withoutGas.items.find(i => i.document.id === "projeto_gas");
    expect(gasDoc?.isRequired).toBe(false);

    const withGas = evaluateChecklist({ ...baseContext, hasGasInstallation: true }, []);
    const gasDocRequired = withGas.items.find(i => i.document.id === "projeto_gas");
    expect(gasDocRequired?.isRequired).toBe(true);
  });

  it("acoustic project is conditional on multi-dwelling", () => {
    const singleDwelling = evaluateChecklist(baseContext, []);
    const acousticSingle = singleDwelling.items.find(i => i.document.id === "projeto_acustico");
    expect(acousticSingle?.isRequired).toBe(false);

    const multiDwelling = evaluateChecklist({ ...baseContext, numberOfDwellings: 4 }, []);
    const acousticMulti = multiDwelling.items.find(i => i.document.id === "projeto_acustico");
    expect(acousticMulti?.isRequired).toBe(true);
  });

  it("rehabilitation requires photographs", () => {
    const noRehab = evaluateChecklist(baseContext, []);
    const photosNoRehab = noRehab.items.find(i => i.document.id === "fotografias");
    expect(photosNoRehab?.isRequired).toBe(false);

    const rehab = evaluateChecklist({ ...baseContext, isRehabilitation: true }, []);
    const photosRehab = rehab.items.find(i => i.document.id === "fotografias");
    expect(photosRehab?.isRequired).toBe(true);
  });
});

describe("Document Checklist - contextFromProject", () => {
  it("builds context from a minimal project", () => {
    const ctx = contextFromProject({
      buildingType: "residential",
      grossFloorArea: 150,
      numberOfFloors: 1,
      buildingHeight: 3,
      isRehabilitation: false,
    });

    expect(ctx.projectPhase).toBe("licensing");
    expect(ctx.buildingType).toBe("residential");
    expect(ctx.numberOfDwellings).toBe(1);
    expect(ctx.hasGasInstallation).toBe(false);
  });

  it("maps project phases correctly", () => {
    const ctx = contextFromProject({
      buildingType: "commercial",
      grossFloorArea: 500,
      numberOfFloors: 3,
      buildingHeight: 12,
      isRehabilitation: false,
      licensing: { projectPhase: "communication" },
    });

    expect(ctx.projectPhase).toBe("communication");
    expect(ctx.buildingType).toBe("commercial");
  });
});

import { test, expect } from "@playwright/test";

// Valid project payload with all required fields (schema requires all sub-objects)
const VALID_PROJECT = {
  name: "E2E Full Test",
  buildingType: "residential",
  isRehabilitation: false,
  grossFloorArea: 200,
  usableFloorArea: 160,
  numberOfFloors: 2,
  buildingHeight: 7,
  numberOfDwellings: 1,
  location: {
    district: "Lisboa",
    municipality: "Lisboa",
    altitude: 50,
    distanceToCoast: 5,
    climateZoneWinter: "I1",
    climateZoneSummer: "V2",
  },
  architecture: { ceilingHeight: 2.7, hasNaturalLight: true, hasCrossVentilation: true },
  structural: { structuralSystem: "reinforced_concrete", seismicZone: "1.3", soilType: "B", importanceClass: "II", hasStructuralProject: true },
  fireSafety: { utilizationType: "I", riskCategory: "1", hasFireDetection: true },
  avac: {},
  waterDrainage: {},
  gas: {},
  electrical: {},
  telecommunications: {},
  envelope: {},
  systems: {},
  acoustic: {},
  accessibility: {},
  elevators: {},
  licensing: {},
  waste: {},
  localRegulations: {},
  drawingQuality: {},
  projectContext: {},
};

test.describe("API Endpoints", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  test("POST /api/analyze returns valid analysis for full project", async ({ request }) => {
    const response = await request.post("/api/analyze", {
      data: VALID_PROJECT,
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Result structure
    expect(body.result).toBeDefined();
    expect(body.result.overallScore).toBeGreaterThanOrEqual(0);
    expect(body.result.overallScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.result.findings)).toBeTruthy();
    expect(body.result.findings.length).toBeGreaterThan(0);

    // Calculations structure
    expect(body.calculations).toBeDefined();
  });

  test("POST /api/analyze rejects incomplete data with 400", async ({ request }) => {
    const response = await request.post("/api/analyze", {
      data: {
        name: "Incomplete",
        buildingType: "residential",
        // Missing required fields
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("GET /api/pricing/search returns results for 'pilar'", async ({ request }) => {
    const response = await request.get("/api/pricing/search?q=pilar&limit=5");

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBeTruthy();
    expect(body.results.length).toBeGreaterThan(0);

    // Each result has { item: PriceWorkItem, score: number }
    const first = body.results[0];
    expect(first.item).toBeDefined();
    expect(first.item.code).toBeDefined();
    expect(first.item.description).toBeDefined();
    expect(first.score).toBeGreaterThan(0);
  });

  test("POST /api/pricing/match returns cost estimation", async ({ request }) => {
    const response = await request.post("/api/pricing/match", {
      data: {
        id: "e2e-test",
        name: "E2E Cost Test",
        classification: "custom",
        startDate: "2026-03-01",
        district: "Lisboa",
        buildingType: "residential",
        grossFloorArea: 200,
        chapters: [
          {
            code: "06",
            name: "Estruturas de betão armado",
            subChapters: [
              {
                code: "06.01",
                name: "Pilares",
                articles: [
                  {
                    code: "06.01.001",
                    description: "Pilar de betão armado C25/30, secção rectangular 30×30cm",
                    unit: "m",
                    quantity: 50,
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.matches).toBeDefined();
    expect(Array.isArray(body.matches)).toBeTruthy();
    expect(body.stats).toBeDefined();
    expect(body.stats.totalEstimatedCost).toBeGreaterThan(0);
  });
});

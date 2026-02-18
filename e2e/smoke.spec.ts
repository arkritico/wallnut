import { test, expect } from "@playwright/test";

test.describe("Wallnut Smoke Tests", () => {
  test("landing page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Wallnut/);
    // Hero headline is "Do projeto à obra." (PT) or "From project to site." (EN)
    await expect(page.locator("h1")).toContainText(/Do projeto à obra|From project to site/);
  });

  test("landing page shows regulation badges", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("RGEU", { exact: true })).toBeVisible();
    await expect(page.getByText("SCIE + NT01-NT22")).toBeVisible();
    await expect(page.getByText("REH", { exact: true })).toBeVisible();
  });

  test("can start new project wizard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();
    // Wizard start step shows "Como deseja começar?" / "How would you like to start?"
    await expect(page.getByText(/Como deseja começar|How would you like to start/)).toBeVisible();
  });

  test("can toggle language", async ({ page }) => {
    await page.goto("/");
    // Default is Portuguese — hero text
    await expect(page.getByText("Do projeto à obra.")).toBeVisible();
    // Switch to English — click the language toggle button specifically
    await page.locator("nav button", { hasText: "EN" }).click();
    await expect(page.getByText("From project to site.")).toBeVisible();
  });

  test("can toggle dark mode", async ({ page }) => {
    await page.goto("/");
    // Click moon icon for dark mode
    await page.locator("button[title='Modo escuro']").click();
    // HTML should have dark class
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("wizard shows template and blank options", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();

    // Should show start options
    await expect(page.getByText(/Usar Modelo|Use Template/)).toBeVisible();
    await expect(page.getByText(/Começar do Zero|Start from Scratch/)).toBeVisible();
    await expect(page.getByText(/Carregar Ficheiros|Upload Files/)).toBeVisible();
  });

  test("API analyze endpoint returns valid response", async ({ request }) => {
    const response = await request.post("/api/analyze", {
      data: {
        name: "E2E Test Project",
        buildingType: "residential",
        isRehabilitation: false,
        location: {
          municipality: "Lisboa",
          district: "Lisboa",
          altitude: 50,
          distanceToCoast: 5,
          climateZoneWinter: "I1",
          climateZoneSummer: "V1",
        },
        grossFloorArea: 150,
        usableFloorArea: 120,
        numberOfFloors: 2,
        buildingHeight: 7,
        architecture: {}, structural: {}, fireSafety: {},
        avac: {}, waterDrainage: {}, gas: {}, electrical: {},
        telecommunications: {}, envelope: {}, systems: {},
        acoustic: {}, accessibility: {}, elevators: {},
        licensing: {}, waste: {}, localRegulations: {},
        drawingQuality: {}, projectContext: {},
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.result).toBeDefined();
    expect(body.result.overallScore).toBeGreaterThanOrEqual(0);
    expect(body.result.overallScore).toBeLessThanOrEqual(100);
    expect(body.result.findings).toBeDefined();
    expect(Array.isArray(body.result.findings)).toBeTruthy();
  });
});

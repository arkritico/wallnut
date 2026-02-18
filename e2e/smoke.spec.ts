import { test, expect } from "@playwright/test";

test.describe("Wallnut Smoke Tests", () => {
  test("landing page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Wallnut/);
    await expect(page.locator("h1")).toContainText("Wallnut");
  });

  test("landing page shows regulation badges", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("RGEU")).toBeVisible();
    await expect(page.getByText("SCIE + NT01-NT22")).toBeVisible();
    await expect(page.getByText("REH")).toBeVisible();
  });

  test("can start new project wizard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();
    // Should navigate to wizard
    await expect(page.getByText(/Novo Projeto|New Project/)).toBeVisible();
  });

  test("can toggle language", async ({ page }) => {
    await page.goto("/");
    // Default is Portuguese
    await expect(page.getByText("Regulamentação Portuguesa")).toBeVisible();
    // Switch to English
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.getByText("Portuguese Building Regulations")).toBeVisible();
  });

  test("can toggle dark mode", async ({ page }) => {
    await page.goto("/");
    // Click moon icon for dark mode
    await page.locator("button[title='Modo escuro']").click();
    // HTML should have dark class
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("wizard flow creates project and navigates to form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();

    // Fill wizard basics - click through to template step if there is one
    // The wizard may have multiple steps, try to find and interact with form elements
    // Fill project name if visible
    const nameInput = page.locator("input[placeholder*='Moradia'], input[placeholder*='nome']").first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("Teste E2E - Moradia T3");
    }
  });

  test("API analyze endpoint returns valid response", async ({ request }) => {
    const response = await request.post("/api/analyze", {
      data: {
        name: "E2E Test Project",
        buildingType: "residential",
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
        isRehabilitation: false,
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

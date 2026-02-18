import { test, expect } from "@playwright/test";

// Helper: navigate through the template wizard until the form is ready
async function completeWizardWithTemplate(page: import("@playwright/test").Page) {
  await page.goto("/");

  // Landing → click "Iniciar Análise" (Start Analysis)
  await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();

  // Wizard start step — click "Usar Modelo" (Use Template)
  await expect(page.getByText(/Como deseja começar|How would you like to start/)).toBeVisible();
  await page.getByText(/Usar Modelo|Use Template/).click();

  // Template step — click "Moradia T3"
  await expect(page.getByText(/Escolha um modelo|Choose a template/)).toBeVisible();
  await page.getByText("Moradia T3").click();

  // Basics step — should auto-fill with template data
  await expect(page.getByText(/Dados Básicos|Basic Data/)).toBeVisible();
  // Verify template pre-filled the name
  const nameInput = page.locator("input").first();
  await expect(nameInput).toHaveValue("Moradia T3");
  await page.getByRole("button", { name: /Continuar|Continue/ }).click();

  // Location step
  await expect(page.getByText(/Localização|Location/)).toBeVisible();
  await page.getByRole("button", { name: /Continuar|Continue/ }).click();

  // Review step
  await expect(page.getByText(/Revisão|Review/)).toBeVisible();
  await expect(page.getByText("Moradia T3", { exact: true })).toBeVisible();
}

test.describe("Wizard → Form → Analyze → Results", () => {
  test("template wizard completes all steps to review", async ({ page }) => {
    await completeWizardWithTemplate(page);

    // Review step should show the template data summary
    await expect(page.getByText("200 m²")).toBeVisible();
    await expect(page.getByText(/Residencial|residential/i)).toBeVisible();
  });

  test("wizard review leads to form with template data", async ({ page }) => {
    await completeWizardWithTemplate(page);

    // Click through review to form
    await page.getByRole("button", { name: /Continuar para Formulário|Continue to Full Form/ }).click();

    // Form should be visible with project data heading
    await expect(page.getByText(/Dados do Projeto|Project Data/)).toBeVisible();

    // Submit button should be present
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("form submission triggers analysis and shows results", async ({ page }) => {
    await completeWizardWithTemplate(page);

    // Go to form
    await page.getByRole("button", { name: /Continuar para Formulário|Continue to Full Form/ }).click();
    await expect(page.locator("button[type='submit']")).toBeVisible();

    // Submit the form and wait for the analysis API response
    const [response] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/analyze") && resp.status() === 200),
      page.locator("button[type='submit']").click(),
    ]);

    expect(response.ok()).toBeTruthy();

    // Results should show score (the ScoreCircle renders a div with "/100")
    // Wait for results view to appear
    await expect(page.getByText("/100")).toBeVisible({ timeout: 15_000 });
  });

  test("results page shows regulation areas and findings", async ({ page }) => {
    await completeWizardWithTemplate(page);
    await page.getByRole("button", { name: /Continuar para Formulário|Continue to Full Form/ }).click();

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/analyze") && resp.status() === 200),
      page.locator("button[type='submit']").click(),
    ]);

    // Wait for results to load
    await expect(page.getByText("/100")).toBeVisible({ timeout: 15_000 });

    // Should show coverage section
    await expect(page.getByText(/Cobertura Regulamentar|Regulatory Coverage/)).toBeVisible();

    // Should show at least one regulation area
    await expect(page.getByText(/RGEU|SCIE|REH/).first()).toBeVisible();
  });

  test("can navigate back to landing from results", async ({ page }) => {
    await completeWizardWithTemplate(page);
    await page.getByRole("button", { name: /Continuar para Formulário|Continue to Full Form/ }).click();

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/analyze") && resp.status() === 200),
      page.locator("button[type='submit']").click(),
    ]);

    await expect(page.getByText("/100")).toBeVisible({ timeout: 15_000 });

    // Click the logo/home button in the header to go back to landing
    await page.locator("header button").first().click();

    // Should be back on landing with the hero text
    await expect(page.locator("h1")).toContainText(/Do projeto à obra|From project to site/);
  });

  test("blank project wizard goes to basics with empty fields", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();
    await expect(page.getByText(/Como deseja começar|How would you like to start/)).toBeVisible();

    // Click "Começar do Zero" (Start from Scratch)
    await page.getByText(/Começar do Zero|Start from Scratch/).click();

    // Should skip template selection and go directly to "basics" step
    await expect(page.getByText(/Dados Básicos|Basic Data/)).toBeVisible();

    // Name field should be empty (default project has empty name)
    const nameInput = page.locator("input").first();
    await expect(nameInput).toHaveValue("");
  });
});

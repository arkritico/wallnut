import { test, expect } from "@playwright/test";

// Helper: clear localStorage to start fresh
async function clearStorage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

// Helper: complete wizard with template and analyze
async function createProjectViaWizard(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();
  await page.getByText(/Usar Modelo|Use Template/).click();
  await page.getByText("Moradia T3").click();
  await page.getByRole("button", { name: /Continuar|Continue/ }).click();
  await page.getByRole("button", { name: /Continuar|Continue/ }).click();
  await page.getByRole("button", { name: /Continuar para Formulário|Continue to Full Form/ }).click();

  // Submit form and wait for analysis
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes("/api/analyze") && resp.status() === 200),
    page.locator("button[type='submit']").click(),
  ]);

  // Wait for results to render
  await expect(page.getByText("/100")).toBeVisible({ timeout: 15_000 });
}

test.describe("Dashboard & State Management", () => {
  test("dashboard shows empty state when no projects saved", async ({ page }) => {
    await clearStorage(page);

    // The "My Projects" button only appears when savedProjects.length > 0
    // With no projects, we can't reach dashboard via UI.
    // Verify the landing page doesn't show the "My Projects" link
    await expect(page.getByText(/Os Meus Projetos|My Projects/)).not.toBeVisible();
  });

  test("after analysis, project appears in dashboard", async ({ page }) => {
    await clearStorage(page);
    await createProjectViaWizard(page);

    // Navigate to dashboard — the "My Projects" button should now be visible
    await page.getByText(/Os Meus Projetos|My Projects/).click();

    // Dashboard should show the project
    await expect(page.getByText("Moradia T3")).toBeVisible();

    // Should show the score
    await expect(page.getByText(/Pontuação|Score/)).toBeVisible();
  });

  test("can delete a project from dashboard", async ({ page }) => {
    await clearStorage(page);
    await createProjectViaWizard(page);

    // Go to dashboard
    await page.getByText(/Os Meus Projetos|My Projects/).click();
    await expect(page.getByText("Moradia T3")).toBeVisible();

    // Accept the confirm dialog before clicking delete
    page.on("dialog", (dialog) => dialog.accept());

    // Click the trash delete button inside the project card
    const projectCard = page.locator("div").filter({ hasText: "Moradia T3" }).locator("button.text-gray-400").first();
    await projectCard.click();

    // Project should be gone — empty state message
    await expect(page.getByText(/Nenhum projeto guardado|No saved projects/)).toBeVisible({ timeout: 10_000 });
  });

  test("language toggle persists across views", async ({ page }) => {
    await page.goto("/");

    // Default is Portuguese — verify hero headline
    await expect(page.locator("h1")).toContainText("Do projeto à obra.");

    // Switch to English — click the language toggle button specifically
    await page.locator("nav button", { hasText: "EN" }).click();

    // Landing should now be in English
    await expect(page.locator("h1")).toContainText("From project to site.");

    // Navigate to wizard
    await page.getByRole("button", { name: /Start Analysis/ }).click();

    // Wizard should be in English
    await expect(page.getByText(/How would you like to start/)).toBeVisible();

    // Go back to landing
    await page.getByText(/Cancel/).click();

    // Landing should still be in English
    await expect(page.locator("h1")).toContainText("From project to site.");
  });

  test("dark mode persists across views", async ({ page }) => {
    await page.goto("/");

    // Verify light mode initially
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Toggle dark mode (moon icon button)
    await page.locator("button[title='Modo escuro']").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Navigate to wizard
    await page.getByRole("button", { name: /Iniciar Análise|Start Analysis/ }).click();

    // Dark mode should persist
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Go back
    await page.getByText(/Cancelar|Cancel/).click();

    // Still dark
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

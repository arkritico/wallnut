import { describe, it, expect } from "vitest";
import {
  loadScraperConfig,
  CypeUnifiedScraper,
  type CypeTypology,
  type TypologyConfig,
} from "@/lib/cype-unified-scraper";

// ── Config Loading ──────────────────────────────────────────

describe("loadScraperConfig", () => {
  it("parses v1 flat config — all chapters belong to obra_nova", () => {
    const v1 = {
      version: "1.0",
      typologies: [
        { id: "obra_nova", name: "Obra nova", path: "obra_nova", enabled: true },
      ],
      chapters: [
        { code: "E", name: "Estruturas", path: "Estruturas", enabled: true, priority: 1, status: "scraped" },
        { code: "I", name: "Instalacoes", path: "Instalacoes", enabled: true, priority: 1, status: "scraped" },
      ],
    };

    const result = loadScraperConfig(v1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("obra_nova");
    expect(result[0].enabled).toBe(true);
    expect(result[0].chapters).toHaveLength(2);
    expect(result[0].chapters[0].code).toBe("E");
  });

  it("parses v2 per-typology config", () => {
    const v2 = {
      version: "2.0",
      source: "geradordeprecos.info",
      typologies: {
        obra_nova: {
          name: "Obra nova",
          path: "obra_nova",
          enabled: true,
          chapters: [
            { code: "E", name: "Estruturas", path: "Estruturas", enabled: true, priority: 1 },
          ],
        },
        reabilitacao: {
          name: "Reabilitacao",
          path: "reabilitacao",
          enabled: true,
          chapters: [
            { code: "E", name: "Estruturas", path: "Estruturas", enabled: true, priority: 1 },
            { code: "Z", name: "Reabilitacao energetica", path: "Reabilitacao_energetica", enabled: true, priority: 1 },
          ],
        },
        espacos_urbanos: {
          name: "Espacos urbanos",
          path: "espacos_urbanos",
          enabled: false,
          chapters: [
            { code: "M", name: "Pavimentos urbanos", path: "Pavimentos_urbanos", enabled: true, priority: 1 },
          ],
        },
      },
    };

    const result = loadScraperConfig(v2);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("obra_nova");
    expect(result[0].chapters).toHaveLength(1);
    expect(result[1].id).toBe("reabilitacao");
    expect(result[1].chapters).toHaveLength(2);
    expect(result[1].chapters[1].code).toBe("Z");
    expect(result[2].id).toBe("espacos_urbanos");
    expect(result[2].enabled).toBe(false);
  });

  it("defaults to obra_nova when config has no version", () => {
    const noVersion = {
      chapters: [
        { code: "A", name: "Test", path: "Test", enabled: true, priority: 2 },
      ],
    };

    const result = loadScraperConfig(noVersion);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("obra_nova");
  });
});

// ── Dedup with Typology ─────────────────────────────────────

describe("CypeUnifiedScraper dedup", () => {
  it("toJSON includes typology per item", () => {
    const scraper = new CypeUnifiedScraper({ typology: "reabilitacao" });
    const json = scraper.toJSON();

    // Empty scraper returns empty items with metadata
    expect(json.metadata.version).toBe("4.0-multi-typology");
    expect(json.metadata.typologyCounts).toBeDefined();
    expect(json.metadata.typologyCounts.obra_nova).toBe(0);
    expect(json.metadata.typologyCounts.reabilitacao).toBe(0);
    expect(json.metadata.typologyCounts.espacos_urbanos).toBe(0);
  });

  it("toCypeWorkItems sets isRehab=true for reabilitacao typology", () => {
    const scraper = new CypeUnifiedScraper({ typology: "reabilitacao" });
    // Access internal results map to inject a test item
    const results = (scraper as unknown as { results: Map<string, unknown> }).results;
    results.set("TEST001:reabilitacao", {
      code: "TEST001",
      description: "Test item",
      category: "Test",
      unit: "Ud",
      unitCost: 100,
      url: "https://test.com",
      lastUpdated: new Date(),
      typology: "reabilitacao" as CypeTypology,
    });

    const workItems = scraper.toCypeWorkItems();
    expect(workItems).toHaveLength(1);
    expect(workItems[0].isRehab).toBe(true);
    expect(workItems[0].typology).toBe("reabilitacao");
  });

  it("same code across different typology scrapers produces distinct items", () => {
    const scraperA = new CypeUnifiedScraper({ typology: "obra_nova" });
    const scraperB = new CypeUnifiedScraper({ typology: "reabilitacao" });

    // Inject same code in both
    const resultsA = (scraperA as unknown as { results: Map<string, unknown> }).results;
    resultsA.set("EHS010:obra_nova", {
      code: "EHS010",
      description: "Pilar obra nova",
      category: "Estruturas",
      unit: "m",
      unitCost: 673.53,
      url: "https://test.com/obra_nova/EHS010",
      lastUpdated: new Date(),
      typology: "obra_nova" as CypeTypology,
    });

    const resultsB = (scraperB as unknown as { results: Map<string, unknown> }).results;
    resultsB.set("EHS010:reabilitacao", {
      code: "EHS010",
      description: "Pilar reabilitacao",
      category: "Estruturas",
      unit: "m",
      unitCost: 750.00,
      url: "https://test.com/reabilitacao/EHS010",
      lastUpdated: new Date(),
      typology: "reabilitacao" as CypeTypology,
    });

    const jsonA = scraperA.toJSON();
    const jsonB = scraperB.toJSON();

    expect(jsonA.items).toHaveLength(1);
    expect(jsonB.items).toHaveLength(1);
    expect(jsonA.items[0].typology).toBe("obra_nova");
    expect(jsonB.items[0].typology).toBe("reabilitacao");
    expect(jsonA.items[0].totalCost).not.toBe(jsonB.items[0].totalCost);
  });
});

// ── Merge Key ───────────────────────────────────────────────

describe("merge key backward compat", () => {
  it("items without typology field default to obra_nova during merge", () => {
    // Simulate old data without typology
    const oldItems = [
      { code: "NAF010", description: "Old item", unit: "m", totalCost: 11.23, category: "Test", url: "test" },
    ];

    // Simulate new data with typology
    const newItems = [
      { code: "NAF010", description: "New item", unit: "m", totalCost: 12.50, category: "Test", url: "test", typology: "obra_nova" },
    ];

    // Merge using the same logic as scrape-cype.ts
    const existingMap = new Map(
      oldItems.map((i: { code: string; typology?: string }) => [
        `${i.code}:${i.typology || "obra_nova"}`,
        i,
      ]),
    );

    for (const item of newItems) {
      existingMap.set(`${item.code}:${item.typology || "obra_nova"}`, item);
    }

    const merged = Array.from(existingMap.values());
    expect(merged).toHaveLength(1);
    expect((merged[0] as { totalCost: number }).totalCost).toBe(12.50); // New overrides old
  });

  it("items from different typologies are kept separate during merge", () => {
    const existingItems = [
      { code: "EHS010", typology: "obra_nova", totalCost: 673 },
    ];
    const newItems = [
      { code: "EHS010", typology: "reabilitacao", totalCost: 750 },
    ];

    const existingMap = new Map(
      existingItems.map((i) => [`${i.code}:${i.typology}`, i]),
    );

    for (const item of newItems) {
      existingMap.set(`${item.code}:${item.typology}`, item);
    }

    const merged = Array.from(existingMap.values());
    expect(merged).toHaveLength(2);
  });
});

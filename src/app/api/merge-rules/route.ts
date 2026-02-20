/**
 * API Route: Merge extracted rules into a plugin's rules.json
 *
 * POST /api/merge-rules
 * Body: { pluginId: string, regulationId?: string, rules: ExtractedRuleInput[] }
 * Returns: { success: true, added: number, skipped: number, total: number }
 *
 * Security: Requires MERGE_RULES_API_KEY header in production.
 * Plugin IDs are validated against a whitelist to prevent path traversal.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { transformAndMerge } from "@/lib/plugins/rule-transformer";
import type { ExtractedRuleInput } from "@/lib/plugins/rule-transformer";
import type { DeclarativeRule } from "@/lib/plugins/types";

// Whitelist of valid plugin IDs — prevents path traversal
const VALID_PLUGINS = new Set([
  "accessibility",
  "acoustic",
  "architecture",
  "drawings",
  "electrical",
  "elevators",
  "energy",
  "fire-safety",
  "gas",
  "general",
  "hvac",
  "licensing",
  "municipal",
  "structural",
  "telecommunications",
  "thermal",
  "waste",
  "water-drainage",
]);

// Only alphanumeric, hyphens, and underscores allowed in IDs
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function checkAuth(request: NextRequest): boolean {
  const key = process.env.MERGE_RULES_API_KEY;
  if (!key) return false; // Fail-closed: no key configured = deny
  const provided = request.headers.get("x-api-key");
  return provided === key;
}

export async function POST(request: NextRequest) {
  // Authentication check
  if (process.env.NODE_ENV === "production" && !checkAuth(request)) {
    return NextResponse.json(
      { error: "Autenticação necessária." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { pluginId, regulationId, rules } = body as {
      pluginId: string;
      regulationId?: string;
      rules: ExtractedRuleInput[];
    };

    if (!pluginId || !rules || !Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json(
        { error: "pluginId and non-empty rules array required" },
        { status: 400 },
      );
    }

    // Validate pluginId against whitelist (prevents path traversal)
    if (!VALID_PLUGINS.has(pluginId)) {
      return NextResponse.json(
        { error: "Plugin inválido." },
        { status: 400 },
      );
    }

    // Validate regulationId format if provided (prevents path traversal)
    if (regulationId && !SAFE_ID_PATTERN.test(regulationId)) {
      return NextResponse.json(
        { error: "ID de regulamento inválido." },
        { status: 400 },
      );
    }

    // Find the plugin's rules directory
    const pluginDir = path.join(process.cwd(), "src", "data", "plugins", pluginId);
    if (!fs.existsSync(pluginDir)) {
      return NextResponse.json(
        { error: "Plugin não encontrado." },
        { status: 404 },
      );
    }

    // Find the first regulations subdirectory (or use regulationId if provided)
    const regsDir = path.join(pluginDir, "regulations");
    if (!fs.existsSync(regsDir)) {
      return NextResponse.json(
        { error: "Diretoria de regulamentos não encontrada." },
        { status: 404 },
      );
    }

    const regDirs = fs.readdirSync(regsDir).filter(d =>
      fs.statSync(path.join(regsDir, d)).isDirectory(),
    );

    const targetRegDir = regulationId
      ? regDirs.find(d => d === regulationId)
      : regDirs[0];

    if (!targetRegDir) {
      return NextResponse.json(
        { error: "Diretoria de regulamento não encontrada." },
        { status: 404 },
      );
    }

    const rulesPath = path.join(regsDir, targetRegDir, "rules.json");

    // Verify resolved path is still within plugins directory (defense-in-depth)
    const resolvedPath = path.resolve(rulesPath);
    const pluginsRoot = path.resolve(path.join(process.cwd(), "src", "data", "plugins"));
    if (!resolvedPath.startsWith(pluginsRoot)) {
      return NextResponse.json(
        { error: "Caminho inválido." },
        { status: 400 },
      );
    }

    // Read existing rules
    let existingRules: DeclarativeRule[] = [];
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, "utf-8");
      const parsed = JSON.parse(content);
      existingRules = Array.isArray(parsed) ? parsed : parsed.rules ?? [];
    }

    // Transform and merge
    const { added, skipped } = transformAndMerge(
      rules,
      existingRules,
      pluginId,
      `${pluginId}-${targetRegDir}`,
    );

    // Write back
    const merged = [...existingRules, ...added];
    fs.writeFileSync(rulesPath, JSON.stringify(merged, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      added: added.length,
      skipped,
      total: merged.length,
    });
  } catch (error) {
    console.error("Merge rules error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 },
    );
  }
}

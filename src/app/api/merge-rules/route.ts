/**
 * API Route: Merge extracted rules into a plugin's rules.json
 *
 * POST /api/merge-rules
 * Body: { pluginId: string, regulationId?: string, rules: ExtractedRuleInput[] }
 * Returns: { success: true, added: number, skipped: number, total: number }
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { transformAndMerge } from "@/lib/plugins/rule-transformer";
import type { ExtractedRuleInput } from "@/lib/plugins/rule-transformer";
import type { DeclarativeRule } from "@/lib/plugins/types";

export async function POST(request: NextRequest) {
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

    // Find the plugin's rules directory
    const pluginDir = path.join(process.cwd(), "src", "data", "plugins", pluginId);
    if (!fs.existsSync(pluginDir)) {
      return NextResponse.json(
        { error: `Plugin '${pluginId}' not found` },
        { status: 404 },
      );
    }

    // Find the first regulations subdirectory (or use regulationId if provided)
    const regsDir = path.join(pluginDir, "regulations");
    if (!fs.existsSync(regsDir)) {
      return NextResponse.json(
        { error: `No regulations directory for plugin '${pluginId}'` },
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
        { error: `Regulation directory not found in plugin '${pluginId}'` },
        { status: 404 },
      );
    }

    const rulesPath = path.join(regsDir, targetRegDir, "rules.json");

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
      { error: "Internal server error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

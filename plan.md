# Plan: AI-Driven 4D Construction Sequencer

## Goal
Replace the mechanical element-task mapping and fixed-phase sequencing with an AI-powered construction intelligence layer. Claude analyzes the specific IFC model and generates a project-specific construction sequence with high-confidence element-to-task assignments and cumulative build-up logic.

---

## Architecture Overview

```
IFC File → IFC Specialty Analyzer (existing) → Element Summary
                                                      ↓
                                            AI Construction Sequencer (NEW)
                                              ├── Claude Opus 4.6 API call
                                              ├── Project-specific reasoning
                                              └── Structured JSON output
                                                      ↓
                                            AI-Enhanced Schedule + Mapping
                                                      ↓
                                            4D Viewer (cumulative build-up)
```

---

## Changes (7 files)

### 1. NEW: `src/lib/ai-construction-sequencer.ts`

**The brain.** Prepares IFC element data for Claude and processes the structured response.

**Key functions:**
- `buildSequencingPrompt(analyses, project)` — Builds a detailed prompt with:
  - Summarized IFC elements grouped by storey and type (entity counts, areas, volumes)
  - Spatial relationships (which rooms are on which floor, adjacencies)
  - Material information (concrete, steel, masonry, etc.)
  - Project metadata (building type, floors, location, climate zone)
  - Existing ProNIC chapter mapping for cost context

- `parseAiSequence(response)` — Parses Claude's structured JSON response into:
  - `AiConstructionStep[]` — ordered construction steps with:
    - `stepId: string` (e.g., "S001")
    - `name: string` (e.g., "Escavação e movimentos de terra")
    - `phase: ConstructionPhase` (maps to existing 32 phases)
    - `elementIds: string[]` (IFC GlobalIds assigned to this step)
    - `storey: string | null`
    - `predecessors: string[]` (stepIds this depends on)
    - `rationale: string` (why this order — AI explains its reasoning)
    - `estimatedDurationDays?: number` (AI's estimate, optional override)

- `generateAiSequence(analyses, project, options?)` — Orchestrates the full flow:
  1. Summarize IFC data into a compact representation (stay within token limits)
  2. Call Claude API with structured output instructions
  3. Parse and validate the response
  4. Map AI steps → existing ConstructionPhase enum
  5. Return `AiSequenceResult` with steps + element mapping + confidence scores

**Types:**
```typescript
interface AiSequenceResult {
  steps: AiConstructionStep[];
  elementMapping: Map<string, { stepId: string; phase: ConstructionPhase; confidence: number }>;
  unmappedElements: string[];
  aiRationale: string;  // Overall construction strategy explanation
  tokenUsage: { input: number; output: number };
}

interface AiConstructionStep {
  stepId: string;
  name: string;
  phase: ConstructionPhase;
  elementIds: string[];
  storey: string | null;
  predecessors: string[];
  rationale: string;
  estimatedDurationDays?: number;
}
```

**Prompt design principles:**
- Ask Claude to think as a Portuguese construction site manager
- Provide the full element inventory with quantities
- Request step-by-step construction logic starting from earthworks
- Require each step to reference specific IFC element IDs
- Use the existing ConstructionPhase enum values so output maps cleanly
- Request JSON output with a defined schema
- Include Portuguese construction methodology context (30 canonical phases)
- Limit prompt to ~12K tokens input, expect ~4K-8K output (use extended thinking for complex projects)

**Token budget strategy:**
- Small projects (<200 elements): Send full element list, single API call
- Medium projects (200-1000): Group by type+storey, send summary with element ID lists
- Large projects (>1000): Two-pass approach:
  1. First call: high-level strategy per storey (which phases, order, dependencies)
  2. Second call: detailed element assignment per storey (parallelizable)

### 2. NEW: `src/app/api/ai-sequence/route.ts`

**API endpoint** for the AI sequencing call.

```typescript
POST /api/ai-sequence
Body: {
  ifcAnalyses: SpecialtyAnalysisResult[];  // From IFC parsing
  project: Partial<BuildingProject>;        // Project metadata
  options?: {
    maxWorkers?: number;
    startDate?: string;
    detailLevel?: "summary" | "detailed";   // For large projects
  }
}

Response: {
  steps: AiConstructionStep[];
  elementMapping: { elementId: string; stepId: string; phase: string; confidence: number }[];
  unmappedElements: string[];
  aiRationale: string;
  tokenUsage: { input: number; output: number };
}
```

**Implementation:**
- Validates input (IFC analyses must be present)
- Checks ANTHROPIC_API_KEY
- Calls `generateAiSequence()` from the new lib module
- Uses `claude-opus-4-6` model for best reasoning (falls back to `claude-sonnet-4-5-20250929` if configured)
- Max tokens: 8192 output (construction sequences can be detailed)
- Returns structured result

### 3. MODIFY: `src/lib/element-task-mapper.ts`

**Add AI mapping method** as the highest-priority strategy.

Changes:
- Add `"ai"` to the `method` union type: `"ai" | "keynote" | "type_storey" | "system" | "fallback"`
- Add new option `aiSequence?: AiSequenceResult` to `mapElementsToTasks()` options
- Insert Strategy 0 (AI) before Strategy 1 (Keynote):
  ```typescript
  // Strategy 0: AI sequence (highest confidence)
  if (aiSequence) {
    const aiMapping = aiSequence.elementMapping.get(elementId);
    if (aiMapping) {
      // Find matching schedule task by phase + storey
      link = {
        elementId,
        entityType: element.entityType,
        taskUid: findBestTask(aiMapping.phase, element.storey, tasksByPhase, summaryByPhase),
        phase: aiMapping.phase,
        confidence: aiMapping.confidence, // 85-95 from AI
        method: "ai",
        storey: element.storey,
      };
    }
  }
  ```
- Existing strategies remain as fallback for elements AI didn't map

### 4. MODIFY: `src/lib/unified-pipeline.ts`

**Insert AI sequencing stage** between parse_ifc and schedule generation.

Changes:
- Add new stage `"ai_sequence"` to `UnifiedStage` union
- Add stage weight: `ai_sequence: 15` (redistribute from schedule: 10→5, parse_ifc: 20→15)
- After Stage 2 (Parse IFC), before Stage 3 (Parse BOQ):
  ```typescript
  // ─── Stage 2b: AI Construction Sequence ──────────────
  let aiSequence: AiSequenceResult | undefined;
  if (ifcAnalyses && ifcAnalyses.length > 0) {
    progress.report("ai_sequence", "IA a analisar sequência construtiva...");
    try {
      const { generateAiSequence } = await import("./ai-construction-sequencer");
      aiSequence = await generateAiSequence(ifcAnalyses, project, {
        maxWorkers: opts.maxWorkers,
      });
      if (aiSequence.unmappedElements.length > 0) {
        warnings.push(
          `IA não mapeou ${aiSequence.unmappedElements.length} elementos ` +
          `(cobertura: ${Math.round(((aiSequence.steps.flatMap(s => s.elementIds).length) /
            ifcAnalyses.flatMap(a => a.quantities).length) * 100)}%).`
        );
      }
    } catch (err) {
      warnings.push(`Sequenciamento IA indisponível: ${err.message}. A usar sequência padrão.`);
    }
    progress.completeStage("ai_sequence");
  }
  ```
- Pass `aiSequence` to element-task mapper in Stage 7b:
  ```typescript
  elementMapping = mapElementsToTasks(ifcAnalyses, schedule, {
    boq: generatedBoq,
    aiSequence,  // NEW
  });
  ```
- Store `aiSequence` in `UnifiedPipelineResult` (new field)
- Graceful degradation: if AI call fails (no API key, timeout, error), fall through to existing mechanical sequencing

### 5. MODIFY: `src/components/FourDViewer.tsx`

**Add cumulative build-up mode** and AI sequence awareness.

Changes:
- Add `aiRationale?: string` to `FourDViewerProps` (display AI's construction strategy)
- Add cumulative mode toggle to toolbar (new button between Progress and Comparison):
  - "Construção cumulativa" — elements appear and stay (default when AI sequence available)
  - Current behavior becomes "Fase ativa" mode — shows only current phase elements
- Modify `computeVisualState()`:
  - In cumulative mode: all elements from completed tasks are always visible (solid)
  - In-progress tasks are semi-transparent
  - Future tasks are hidden (not ghost) — building appears to grow from ground up
  - This is the key visual difference: earth → foundations → structure → envelope progressively
- Add AI rationale info panel:
  - Small expandable panel showing "AI Construction Strategy" with the rationale text
  - Per-step rationale on hover/click in timeline

### 6. MODIFY: `src/lib/construction-sequencer.ts`

**Accept AI sequence hints** to override phase ordering and dependencies.

Changes:
- Add optional `aiSteps?: AiConstructionStep[]` to `ScheduleOptions`
- When `aiSteps` is provided:
  - Use AI-defined predecessor relationships instead of fixed `PHASE_DEPS`
  - Use AI-estimated durations as hints (blend with price-based calculation)
  - Respect AI's storey-by-storey ordering within structural phases
- Existing logic remains the default when no AI steps provided

### 7. MODIFY: `src/lib/wbs-types.ts`

**Extend types** for AI integration.

Changes:
- Add `"ai"` to `ElementTaskLink.method` type
- Add `aiSequenceStepId?: string` to `ScheduleTask` (trace which AI step generated it)
- Add `aiRationale?: string` to `ProjectSchedule` (overall AI strategy)
- Export `AiConstructionStep` type from wbs-types for cross-module use

---

## Data Flow (End-to-End)

```
1. User uploads IFC file
   ↓
2. IFC Specialty Analyzer extracts elements (existing, unchanged)
   → SpecialtyAnalysisResult[] with IfcQuantityData[]
   ↓
3. AI Construction Sequencer (NEW)
   → Summarizes: "4-storey residential, RC structure, 847 elements..."
   → Sends to Claude: "Sequence these elements for construction"
   → Receives: 45 ordered steps with element assignments
   → AiSequenceResult
   ↓
4. BOQ Generation (existing, uses AI hints for better ProNIC mapping)
   → WbsProject
   ↓
5. Price Matching (existing, unchanged)
   → MatchReport with PriceMatch[]
   ↓
6. Construction Sequencer (modified)
   → Uses AI steps for ordering + dependencies
   → Falls back to fixed phases for unmatched elements
   → ProjectSchedule with aiRationale
   ↓
7. Element-Task Mapper (modified)
   → Strategy 0 (AI): 85-95% confidence for AI-mapped elements
   → Strategies 1-4: catch remaining elements
   → ElementTaskMappingResult (higher overall coverage)
   ↓
8. 4D Viewer (modified)
   → Cumulative build-up: earth → foundations → structure → envelope → MEP → finishes
   → AI rationale panel explains construction strategy
   → Timeline shows progressive construction
```

---

## Graceful Degradation

The AI layer is additive, not replacing:

| Scenario | Behavior |
|----------|----------|
| API key present, AI succeeds | Full AI-driven sequence (90%+ mapping confidence) |
| API key present, AI fails | Warning + fallback to existing mechanical sequencing |
| No API key | Skip AI stage entirely, use existing pipeline unchanged |
| AI maps 70% of elements | AI maps what it can, remaining 30% use keynote/type/fallback |

---

## Test Strategy

- Unit tests for `ai-construction-sequencer.ts`:
  - Prompt generation from mock IFC data
  - Response parsing with valid/invalid JSON
  - Token budget calculation
  - Phase mapping validation
- Integration tests for modified `element-task-mapper.ts`:
  - AI method has highest priority
  - Fallback works when AI mapping missing
  - Stats correctly track "ai" method
- Integration tests for modified `unified-pipeline.ts`:
  - AI stage runs when IFC present
  - Graceful skip when no API key
  - Result includes aiSequence data
- Existing tests must continue passing (backwards compatibility)

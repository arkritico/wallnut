import { describe, it, expect, vi, beforeEach } from "vitest";
import { serializeResult, executePipelineJob } from "@/lib/pipeline-runner";
import { runUnifiedPipeline } from "@/lib/unified-pipeline";
import { getJobStore } from "@/lib/job-store";
import type { UnifiedPipelineResult, UnifiedProgress } from "@/lib/unified-pipeline";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/unified-pipeline", () => ({
  runUnifiedPipeline: vi.fn(),
}));

vi.mock("@/lib/job-store", () => {
  const store = {
    create: vi.fn(),
    get: vi.fn(),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getJobStore: vi.fn(() => store),
  };
});

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockRunPipeline = vi.mocked(runUnifiedPipeline);
const mockStore = getJobStore();

// ── Tests ──────────────────────────────────────────────────

describe("serializeResult", () => {
  it("converts ArrayBuffer exports to base64", () => {
    const excelBuf = new TextEncoder().encode("EXCEL_DATA").buffer;
    const complianceBuf = new TextEncoder().encode("COMPLIANCE").buffer;

    const ccpmBuf = new TextEncoder().encode("CCPM_GANTT").buffer;

    const result = {
      project: { name: "Test" },
      budgetExcel: excelBuf,
      ccpmGanttExcel: ccpmBuf,
      complianceExcel: complianceBuf,
      msProjectXml: "<xml/>",
      warnings: ["w1"],
      processingTimeMs: 500,
    } as unknown as UnifiedPipelineResult;

    const serialized = serializeResult(result);

    expect(serialized.budgetExcelBase64).toBe(
      Buffer.from("EXCEL_DATA").toString("base64"),
    );
    expect(serialized.ccpmGanttExcelBase64).toBe(
      Buffer.from("CCPM_GANTT").toString("base64"),
    );
    expect(serialized.complianceExcelBase64).toBe(
      Buffer.from("COMPLIANCE").toString("base64"),
    );
    expect(serialized.msProjectXml).toBe("<xml/>");
    expect(serialized.warnings).toEqual(["w1"]);
    expect(serialized.processingTimeMs).toBe(500);
  });

  it("omits base64 fields when buffers are undefined", () => {
    const result = {
      project: { name: "Test" },
      warnings: [],
      processingTimeMs: 100,
    } as unknown as UnifiedPipelineResult;

    const serialized = serializeResult(result);

    expect(serialized.budgetExcelBase64).toBeUndefined();
    expect(serialized.ccpmGanttExcelBase64).toBeUndefined();
    expect(serialized.complianceExcelBase64).toBeUndefined();
  });
});

describe("executePipelineJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup default resolved values after clearAllMocks
    vi.mocked(mockStore.updateProgress).mockResolvedValue(undefined);
    vi.mocked(mockStore.complete).mockResolvedValue(undefined);
    vi.mocked(mockStore.fail).mockResolvedValue(undefined);
  });

  it("sets status to running, then completes on success", async () => {
    const mockResult: Partial<UnifiedPipelineResult> = {
      project: { name: "Proj" } as UnifiedPipelineResult["project"],
      warnings: [],
      processingTimeMs: 200,
    };

    mockRunPipeline.mockResolvedValueOnce(mockResult as UnifiedPipelineResult);

    await executePipelineJob("job-1", [], {});

    // Should set running first
    expect(mockStore.updateProgress).toHaveBeenCalledWith("job-1", {
      status: "running",
    });

    // Should call complete with serialized result
    expect(mockStore.complete).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        project: { name: "Proj" },
        warnings: [],
        processingTimeMs: 200,
      }),
    );

    // Should NOT call fail
    expect(mockStore.fail).not.toHaveBeenCalled();
  });

  it("calls store.fail on pipeline error", async () => {
    mockRunPipeline.mockRejectedValueOnce(new Error("IFC parse failed"));

    await executePipelineJob("job-2", [], {});

    expect(mockStore.fail).toHaveBeenCalledWith("job-2", "IFC parse failed");
    expect(mockStore.complete).not.toHaveBeenCalled();
  });

  it("forwards progress to store.updateProgress", async () => {
    mockRunPipeline.mockImplementation(
      async ({ options }: { options: { onProgress?: (p: UnifiedProgress) => void } }) => {
        // Simulate progress callback
        options.onProgress?.({
          stage: "parse_ifc",
          percent: 30,
          message: "Parsing IFC model",
          stagesCompleted: ["classify"],
        });
        return {
          project: {},
          warnings: [],
          processingTimeMs: 0,
        } as unknown as UnifiedPipelineResult;
      },
    );

    await executePipelineJob("job-3", [], { includeCosts: true });

    const progressCalls = vi.mocked(mockStore.updateProgress).mock.calls;

    // First call: status=running
    expect(progressCalls[0]).toEqual(["job-3", { status: "running" }]);

    // Second call: progress update from pipeline
    expect(progressCalls[1]).toEqual([
      "job-3",
      {
        stage: "parse_ifc",
        progress: 30,
        stageProgress: {
          parse_ifc: { percent: 30, message: "Parsing IFC model" },
        },
        stagesCompleted: ["classify"],
      },
    ]);
  });

  it("passes options to runUnifiedPipeline", async () => {
    mockRunPipeline.mockResolvedValueOnce({
      project: {},
      warnings: [],
      processingTimeMs: 0,
    } as unknown as UnifiedPipelineResult);

    const files = [new File(["x"], "test.ifc")];
    await executePipelineJob("job-4", files, {
      includeCosts: true,
      includeSchedule: false,
      includeCompliance: true,
    });

    expect(mockRunPipeline).toHaveBeenCalledWith({
      files,
      options: expect.objectContaining({
        includeCosts: true,
        includeSchedule: false,
        includeCompliance: true,
      }),
    });
  });
});

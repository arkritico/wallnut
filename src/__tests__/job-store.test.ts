import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryJobStore } from "@/lib/job-store";
import type { UnifiedStage } from "@/lib/unified-pipeline";

describe("InMemoryJobStore", () => {
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore();
  });

  it("creates a job with correct defaults", async () => {
    const job = await store.create(["file.ifc"], { includeCosts: true });

    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.stage).toBeNull();
    expect(job.progress).toBe(0);
    expect(job.stageProgress).toEqual({});
    expect(job.stagesCompleted).toEqual([]);
    expect(job.fileNames).toEqual(["file.ifc"]);
    expect(job.options).toEqual({ includeCosts: true });
    expect(job.result).toBeNull();
    expect(job.error).toBeNull();
    expect(job.warnings).toEqual([]);
    expect(job.startedAt).toBeNull();
    expect(job.completedAt).toBeNull();
    expect(job.createdAt).toBeTruthy();
    expect(job.updatedAt).toBeTruthy();
  });

  it("get() retrieves a created job", async () => {
    const job = await store.create(["a.ifc", "b.pdf"], {});
    const fetched = await store.get(job.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(job.id);
    expect(fetched!.fileNames).toEqual(["a.ifc", "b.pdf"]);
  });

  it("get() returns null for unknown ID", async () => {
    const result = await store.get("non-existent-id");
    expect(result).toBeNull();
  });

  it("updateProgress() updates status and stage", async () => {
    const job = await store.create(["f.ifc"], {});

    await store.updateProgress(job.id, {
      status: "running",
      stage: "parse_ifc" as UnifiedStage,
      progress: 25,
    });

    const updated = await store.get(job.id);
    expect(updated!.status).toBe("running");
    expect(updated!.stage).toBe("parse_ifc");
    expect(updated!.progress).toBe(25);
    expect(updated!.startedAt).toBeTruthy();
  });

  it("updateProgress() sets startedAt only once", async () => {
    const job = await store.create(["f.ifc"], {});

    await store.updateProgress(job.id, { status: "running" });
    const firstStart = (await store.get(job.id))!.startedAt;

    await store.updateProgress(job.id, { status: "running", progress: 50 });
    const secondStart = (await store.get(job.id))!.startedAt;

    expect(firstStart).toBe(secondStart);
  });

  it("updateProgress() merges stageProgress", async () => {
    const job = await store.create(["f.ifc"], {});

    await store.updateProgress(job.id, {
      stageProgress: { parse_ifc: { percent: 50, message: "Parsing..." } },
    });
    await store.updateProgress(job.id, {
      stageProgress: { estimate: { percent: 10, message: "Matching..." } },
    });

    const updated = await store.get(job.id);
    expect(updated!.stageProgress).toEqual({
      parse_ifc: { percent: 50, message: "Parsing..." },
      estimate: { percent: 10, message: "Matching..." },
    });
  });

  it("updateProgress() is a no-op for unknown ID", async () => {
    // Should not throw
    await store.updateProgress("missing", { progress: 50 });
  });

  it("complete() sets result, status, and completedAt", async () => {
    const job = await store.create(["f.ifc"], {});

    const serialized = {
      project: { name: "Test" },
      warnings: [],
      processingTimeMs: 1234,
    };

    await store.complete(job.id, serialized);

    const completed = await store.get(job.id);
    expect(completed!.status).toBe("completed");
    expect(completed!.progress).toBe(100);
    expect(completed!.result).toEqual(serialized);
    expect(completed!.completedAt).toBeTruthy();
  });

  it("fail() sets error, status, and completedAt", async () => {
    const job = await store.create(["f.ifc"], {});

    await store.fail(job.id, "Something broke");

    const failed = await store.get(job.id);
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("Something broke");
    expect(failed!.completedAt).toBeTruthy();
  });

  it("evicts oldest job when at capacity", async () => {
    const smallStore = new InMemoryJobStore(3);

    const job1 = await smallStore.create(["1.ifc"], {});
    const job2 = await smallStore.create(["2.ifc"], {});
    await smallStore.create(["3.ifc"], {});

    // At capacity — next create should evict job1
    await smallStore.create(["4.ifc"], {});

    expect(await smallStore.get(job1.id)).toBeNull();
    expect(await smallStore.get(job2.id)).not.toBeNull();
  });
});

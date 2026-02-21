import { describe, it, expect } from "vitest";
import {
  sanitizeConversationHistory,
  generateToolUseId,
  deduplicateToolUseIds,
} from "@/lib/sanitize-messages";

// ── sanitizeConversationHistory ─────────────────────────────

describe("sanitizeConversationHistory", () => {
  it("passes through string content unchanged", () => {
    const history = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("extracts text from content block arrays", () => {
    const history = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the answer" },
          { type: "text", text: "with more detail" },
        ],
      },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result).toEqual([
      { role: "assistant", content: "Here is the answer\nwith more detail" },
    ]);
  });

  it("strips tool_use blocks from content arrays", () => {
    const history = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check that" },
          {
            type: "tool_use",
            id: "toolu_abc123",
            name: "search",
            input: { query: "test" },
          },
        ],
      },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result).toEqual([
      { role: "assistant", content: "Let me check that" },
    ]);
  });

  it("strips tool_result blocks from content arrays", () => {
    const history = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_abc123",
            content: "search results here",
          },
          { type: "text", text: "What do you think?" },
        ],
      },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result).toEqual([
      { role: "user", content: "What do you think?" },
    ]);
  });

  it("drops messages with no extractable text content", () => {
    const history = [
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_abc",
            name: "search",
            input: {},
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_abc",
            content: "result",
          },
        ],
      },
      { role: "assistant", content: "Final answer" },
    ];
    const result = sanitizeConversationHistory(history);
    // Messages 1 and 2 are dropped (no text), so user+assistant remain
    expect(result).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Final answer" },
    ]);
  });

  it("merges consecutive same-role messages", () => {
    const history = [
      { role: "user", content: "First question" },
      { role: "user", content: "Follow up" },
      { role: "assistant", content: "Answer" },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result).toEqual([
      { role: "user", content: "First question\n\nFollow up" },
      { role: "assistant", content: "Answer" },
    ]);
  });

  it("handles empty or invalid input", () => {
    expect(sanitizeConversationHistory([])).toEqual([]);
    expect(sanitizeConversationHistory([null, undefined, 42] as unknown[])).toEqual([]);
    expect(sanitizeConversationHistory([{ role: "user", content: "" }])).toEqual([]);
    expect(sanitizeConversationHistory([{ role: "user", content: null }])).toEqual([]);
  });

  it("truncates content to maxContentLength", () => {
    const longContent = "x".repeat(200);
    const result = sanitizeConversationHistory(
      [{ role: "user", content: longContent }],
      { maxContentLength: 50 },
    );
    expect(result[0].content).toHaveLength(50);
  });

  it("limits number of messages with maxMessages", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    const result = sanitizeConversationHistory(history, { maxMessages: 4 });
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("normalizes non-user/assistant roles to user", () => {
    const history = [
      { role: "system", content: "I am system" },
      { role: "assistant", content: "Response" },
    ];
    const result = sanitizeConversationHistory(history);
    expect(result[0].role).toBe("user");
  });
});

// ── generateToolUseId ─────────────────────────────────────

describe("generateToolUseId", () => {
  it("generates IDs with the toolu_ prefix", () => {
    const id = generateToolUseId();
    expect(id).toMatch(/^toolu_[A-Za-z0-9]{24}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateToolUseId());
    }
    expect(ids.size).toBe(1000);
  });
});

// ── deduplicateToolUseIds ──────────────────────────────────

describe("deduplicateToolUseIds", () => {
  it("does nothing when there are no duplicates", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_aaa", name: "search", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_aaa", content: "ok" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_bbb", name: "fetch", input: {} },
        ],
      },
    ];
    const result = deduplicateToolUseIds(messages);
    expect((result[0].content as Array<{ id: string }>)[0].id).toBe("toolu_aaa");
    expect((result[2].content as Array<{ id: string }>)[0].id).toBe("toolu_bbb");
  });

  it("remaps duplicate tool_use IDs and updates tool_result references", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_dup", name: "search", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_dup", content: "first" },
        ],
      },
      {
        role: "assistant",
        content: [
          // Duplicate ID!
          { type: "tool_use", id: "toolu_dup", name: "search", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_dup", content: "second" },
        ],
      },
    ];

    const result = deduplicateToolUseIds(messages);

    // First occurrence keeps its ID
    const firstToolUse = (result[0].content as Array<{ id: string }>)[0];
    expect(firstToolUse.id).toBe("toolu_dup");

    // Second occurrence gets a new unique ID
    const secondToolUse = (result[2].content as Array<{ id: string }>)[0];
    expect(secondToolUse.id).not.toBe("toolu_dup");
    expect(secondToolUse.id).toMatch(/^toolu_/);

    // The corresponding tool_result is updated to reference the new ID
    const secondResult = (result[3].content as Array<{ tool_use_id: string }>)[0];
    expect(secondResult.tool_use_id).toBe(secondToolUse.id);

    // First tool_result still references original ID
    const firstResult = (result[1].content as Array<{ tool_use_id: string }>)[0];
    expect(firstResult.tool_use_id).toBe("toolu_dup");
  });

  it("handles string content messages (no-op)", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ];
    const result = deduplicateToolUseIds(messages);
    expect(result).toEqual(messages);
  });

  it("handles multiple duplicates of the same ID", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_x", name: "a", input: {} },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_x", content: "" }],
      },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_x", name: "b", input: {} },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_x", content: "" }],
      },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_x", name: "c", input: {} },
        ],
      },
    ];

    const result = deduplicateToolUseIds(messages);

    const ids = [0, 2, 4].map(
      (i) => (result[i].content as Array<{ id: string }>)[0].id,
    );
    // All three should be unique
    expect(new Set(ids).size).toBe(3);
    // First should keep original
    expect(ids[0]).toBe("toolu_x");
  });
});

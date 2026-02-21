/**
 * Sanitize messages before sending to the Anthropic Messages API.
 *
 * Prevents the "tool_use ids must be unique" validation error by:
 * 1. Ensuring content is always a plain string (stripping any tool_use blocks)
 * 2. Deduplicating tool_use IDs if content arrays must be preserved
 * 3. Enforcing alternating user/assistant role ordering
 */

// ── Types ──────────────────────────────────────────────────

interface ContentBlock {
  type: string;
  id?: string;
  text?: string;
  [key: string]: unknown;
}

interface RawMessage {
  role: string;
  content: string | ContentBlock[] | unknown;
}

interface SanitizedMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Sanitization ───────────────────────────────────────────

/**
 * Extract plain text from a message content field.
 *
 * Handles three cases:
 * - string → returned as-is
 * - array of content blocks → text blocks joined, tool_use/tool_result blocks stripped
 * - anything else → empty string
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is ContentBlock =>
          block != null &&
          typeof block === "object" &&
          "type" in block &&
          (block as ContentBlock).type === "text",
      )
      .map((block) => block.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

/**
 * Sanitize a conversation history array for the Anthropic Messages API.
 *
 * - Converts all content to plain strings (strips tool_use / tool_result blocks)
 * - Drops empty messages
 * - Ensures alternating user/assistant roles (required by the API)
 * - Caps content length per message
 */
export function sanitizeConversationHistory(
  history: unknown[],
  options: { maxContentLength?: number; maxMessages?: number } = {},
): SanitizedMessage[] {
  const { maxContentLength = 80_000, maxMessages = 20 } = options;

  if (!Array.isArray(history)) return [];

  const messages: SanitizedMessage[] = [];

  for (const raw of history.slice(-maxMessages)) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as RawMessage;

    const role: "user" | "assistant" =
      msg.role === "assistant" ? "assistant" : "user";
    const content = extractTextContent(msg.content).slice(0, maxContentLength);

    if (!content) continue;

    // Enforce alternating roles — skip if same role as previous
    if (messages.length > 0 && messages[messages.length - 1].role === role) {
      // Merge consecutive same-role messages
      messages[messages.length - 1].content += "\n\n" + content;
      continue;
    }

    messages.push({ role, content });
  }

  return messages;
}

/**
 * Generate a unique tool_use ID.
 * Format matches the Anthropic convention: "toolu_" + random alphanumeric string.
 */
export function generateToolUseId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "toolu_";
  for (let i = 0; i < 24; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Deduplicate tool_use IDs across a messages array.
 * For messages that have content arrays with tool_use blocks,
 * ensures every tool_use.id is globally unique and updates
 * corresponding tool_result.tool_use_id references.
 *
 * Processes messages sequentially: when a duplicate tool_use ID is
 * found, it gets a new unique ID, and only subsequent tool_result
 * blocks referencing the old ID are updated (earlier references that
 * matched the original tool_use are left unchanged).
 *
 * This directly fixes the "tool_use ids must be unique" API error.
 */
export function deduplicateToolUseIds(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  const seenIds = new Set<string>();
  // Track per-message-index which IDs were remapped so tool_result
  // updates only apply to blocks that come AFTER the duplicate.
  const remaps: Array<{ afterMessageIndex: number; oldId: string; newId: string }> = [];

  // First pass: find and remap duplicate tool_use IDs
  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    if (!Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (
        block != null &&
        typeof block === "object" &&
        (block as ContentBlock).type === "tool_use" &&
        typeof (block as ContentBlock).id === "string"
      ) {
        const id = (block as ContentBlock).id!;
        if (seenIds.has(id)) {
          const newId = generateToolUseId();
          remaps.push({ afterMessageIndex: msgIdx, oldId: id, newId });
          (block as ContentBlock).id = newId;
        }
        seenIds.add((block as ContentBlock).id!);
      }
    }
  }

  // Second pass: update tool_result references, but only for blocks
  // that appear at or after the message where the duplicate was found.
  for (const { afterMessageIndex, oldId, newId } of remaps) {
    for (let msgIdx = afterMessageIndex; msgIdx < messages.length; msgIdx++) {
      const msg = messages[msgIdx];
      if (!Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        if (
          block != null &&
          typeof block === "object" &&
          (block as ContentBlock).type === "tool_result" &&
          (block as Record<string, unknown>).tool_use_id === oldId
        ) {
          (block as Record<string, unknown>).tool_use_id = newId;
        }
      }
    }
  }

  return messages;
}

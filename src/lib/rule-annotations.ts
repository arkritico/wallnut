// ============================================================
// RULE ANNOTATIONS — Engineer audit annotations for rules
// ============================================================
//
// Persists annotation status (reviewed, irrelevant, needs-fix)
// and optional notes per rule in localStorage.

const STORAGE_KEY = "wallnut_rule_annotations";

export type AnnotationStatus = "reviewed" | "irrelevant" | "needs-fix";

export interface RuleAnnotation {
  status: AnnotationStatus;
  note?: string;
  updatedAt: string;
  updatedBy?: string;
}

function isAvailable(): boolean {
  try {
    const key = "__wallnut_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getAnnotations(): Record<string, RuleAnnotation> {
  if (!isAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setAnnotation(ruleId: string, annotation: RuleAnnotation): void {
  if (!isAvailable()) return;
  const all = getAnnotations();
  all[ruleId] = annotation;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function removeAnnotation(ruleId: string): void {
  if (!isAvailable()) return;
  const all = getAnnotations();
  delete all[ruleId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getAnnotation(ruleId: string): RuleAnnotation | undefined {
  return getAnnotations()[ruleId];
}

/**
 * Import annotations from an external JSON object, merging into localStorage.
 * New annotations overwrite existing ones for the same ruleId.
 * Returns the number of annotations imported.
 */
export function importAnnotations(data: Record<string, RuleAnnotation>): number {
  if (!isAvailable()) return 0;
  const validStatuses = new Set<string>(["reviewed", "irrelevant", "needs-fix"]);
  const all = getAnnotations();
  let count = 0;
  for (const [ruleId, ann] of Object.entries(data)) {
    if (ann && typeof ann === "object" && validStatuses.has(ann.status)) {
      all[ruleId] = {
        status: ann.status,
        note: ann.note,
        updatedAt: ann.updatedAt || new Date().toISOString(),
        updatedBy: ann.updatedBy,
      };
      count++;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return count;
}

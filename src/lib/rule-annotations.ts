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

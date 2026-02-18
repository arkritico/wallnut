/**
 * Labor Constraint Modeling
 *
 * Infers maximum workforce size from project budget.
 * Based on Portuguese construction market reality:
 *   "Obras até 1.5M EUR provavelmente têm acesso a não mais que 10 trabalhadores."
 *
 * The headcount always includes 1 director de obra.
 */

export interface LaborConstraint {
  /** Maximum workers on site simultaneously (including director de obra) */
  maxWorkers: number;
  /** Human-readable budget range label */
  budgetRange: string;
  /** Portuguese rationale for the constraint */
  rationale: string;
}

const BRACKETS: { max: number; workers: number; range: string }[] = [
  { max: 500_000, workers: 6, range: "< 500K €" },
  { max: 1_500_000, workers: 10, range: "500K – 1.5M €" },
  { max: 5_000_000, workers: 20, range: "1.5M – 5M €" },
  { max: Infinity, workers: 40, range: "> 5M €" },
];

/**
 * Infer the maximum number of workers from the total project budget.
 *
 * @param totalBudget Total estimated cost in EUR (≥ 0)
 * @returns LaborConstraint with maxWorkers, budgetRange, and rationale
 */
export function inferMaxWorkers(totalBudget: number): LaborConstraint {
  const budget = Math.max(0, totalBudget);
  const bracket = BRACKETS.find(b => budget < b.max) ?? BRACKETS[BRACKETS.length - 1];

  return {
    maxWorkers: bracket.workers,
    budgetRange: bracket.range,
    rationale:
      `Orçamento estimado de ${Math.round(budget).toLocaleString("pt-PT")} € ` +
      `(${bracket.range}) — equipa máxima de ${bracket.workers} trabalhadores ` +
      `(inclui 1 director de obra).`,
  };
}

import { TrendingUp } from "lucide-react";
import { formatCost } from "@/lib/cost-estimation";
import Section from "./Section";

export default function CashFlowPanel({ cashFlow, open, onToggle }: {
  cashFlow: import("@/lib/cashflow").CashFlowResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Section
      title={`Fluxo de Caixa (${cashFlow.totalMonths} meses)`}
      id="cashflow"
      icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 text-center">
            <p className="text-xs text-emerald-600">Custo Total</p>
            <p className="text-lg font-bold text-emerald-800">{formatCost(cashFlow.totalCost)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
            <p className="text-xs text-blue-600">Pico Mensal</p>
            <p className="text-lg font-bold text-blue-800">{formatCost(cashFlow.workingCapital.peakMonthlySpend)}</p>
            <p className="text-[10px] text-blue-500">{cashFlow.workingCapital.peakMonth}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
            <p className="text-xs text-amber-600">Capital de Giro</p>
            <p className="text-lg font-bold text-amber-800">{formatCost(cashFlow.workingCapital.recommendedWorkingCapital)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
            <p className="text-xs text-gray-600">Contingência ({cashFlow.contingency.percent}%)</p>
            <p className="text-lg font-bold text-gray-800">{formatCost(cashFlow.contingency.amount)}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Despesa Mensal</h4>
          <div className="flex items-end gap-0.5" style={{ height: 48 }}>
            {cashFlow.periods.map((p) => {
              const maxSpend = cashFlow.workingCapital.peakMonthlySpend || 1;
              const pct = (p.total / maxSpend) * 100;
              return (
                <div
                  key={p.key}
                  className="flex-1 rounded-t-sm transition-all hover:opacity-80"
                  style={{
                    height: `${Math.max(2, pct)}%`,
                    backgroundColor: p.key === cashFlow.workingCapital.peakMonth ? "#D97706" : "#10B981",
                  }}
                  title={`${p.label}: ${formatCost(p.total)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-400 mt-1">
            <span>{cashFlow.periods[0]?.label}</span>
            <span>{cashFlow.periods[cashFlow.periods.length - 1]?.label}</span>
          </div>
        </div>

        {cashFlow.milestones.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Marcos de Pagamento</h4>
            <div className="space-y-1.5">
              {cashFlow.milestones.map((ms) => (
                <div key={ms.number} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    {ms.number}
                  </span>
                  <span className="flex-1 text-gray-700 truncate">{ms.label}</span>
                  <span className="font-medium text-gray-900 tabular-nums">{formatCost(ms.amount)}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{Math.round(ms.cumulativePercent)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          {cashFlow.contingency.rationale}. Prazo de pagamento: 30 dias.
        </p>
      </div>
    </Section>
  );
}

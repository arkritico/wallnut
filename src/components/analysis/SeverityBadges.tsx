import { XCircle, AlertTriangle, CheckCircle } from "lucide-react";

/** Compact severity count badges for hierarchy headers */
export default function SeverityBadges({ critical, warning, pass, info, compact }: {
  critical: number;
  warning: number;
  pass: number;
  info: number;
  compact?: boolean;
}) {
  const size = compact ? "text-[10px]" : "text-xs";
  const px = compact ? "px-1.5 py-0" : "px-2 py-0.5";
  return (
    <div className="flex items-center gap-1">
      {critical > 0 && (
        <span className={`inline-flex items-center gap-0.5 ${px} bg-red-100 text-red-700 rounded-full ${size} font-bold border border-red-200`}>
          {!compact && <XCircle className="w-3 h-3" />} {critical}
        </span>
      )}
      {warning > 0 && (
        <span className={`inline-flex items-center gap-0.5 ${px} bg-amber-100 text-amber-700 rounded-full ${size} font-bold border border-amber-200`}>
          {!compact && <AlertTriangle className="w-3 h-3" />} {warning}
        </span>
      )}
      {info > 0 && (
        <span className={`inline-flex items-center gap-0.5 ${px} bg-blue-50 text-blue-600 rounded-full ${size} font-medium border border-blue-200`}>
          {info}
        </span>
      )}
      {pass > 0 && (
        <span className={`inline-flex items-center gap-0.5 ${px} bg-green-50 text-green-600 rounded-full ${size} font-medium border border-green-200`}>
          {!compact && <CheckCircle className="w-3 h-3" />} {pass}
        </span>
      )}
    </div>
  );
}

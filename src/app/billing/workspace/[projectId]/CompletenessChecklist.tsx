import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { BillingCompleteness } from "@/lib/billing-workspace/completeness";
import { BILLING_COMPLETENESS_RESULT_LABEL, BILLING_COMPLETENESS_RESULT_TONE } from "@/lib/billing-workspace/labels";

export function CompletenessChecklist({ completeness }: { completeness: BillingCompleteness }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Billing Completeness</h2>
        <Badge tone={BILLING_COMPLETENESS_RESULT_TONE[completeness.result]}>
          {BILLING_COMPLETENESS_RESULT_LABEL[completeness.result]}
        </Badge>
      </div>
      <ul className="flex flex-col gap-3">
        {completeness.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm">
            <StatusDot ok={check.ok} blocking={check.blocking} />
            <div>
              <p className="font-medium text-neutral-800 dark:text-neutral-200">{check.label}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatusDot({ ok, blocking }: { ok: boolean; blocking: boolean }) {
  const color = ok
    ? "bg-emerald-600 dark:bg-emerald-400"
    : blocking
      ? "bg-red-600 dark:bg-red-400"
      : "bg-amber-600 dark:bg-amber-400";
  return <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

// Pure, timezone-explicit formatters for the admin daily operations UI.
// Business date must always follow Asia/Jakarta, never the browser/server
// host's UTC date — see CLAUDE.md operating rules.

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

// en-CA locale formats as YYYY-MM-DD, matching the cash_pools.business_date
// column format and the ISO date schema used across cash-pool/expense
// validation.
const jakartaDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const jakartaLabelFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function getJakartaBusinessDate(now: Date): string {
  return jakartaDateKeyFormatter.format(now);
}

// businessDate is a plain YYYY-MM-DD key (no time component), so it is
// parsed at UTC noon to stay clear of any DST-less offset edge case before
// being re-rendered in the Asia/Jakarta locale label.
export function formatBusinessDateLabel(businessDate: string): string {
  const [year, month, day] = businessDate.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return jakartaLabelFormatter.format(utcNoon);
}

const rupiahNumberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "Rp 0";
  }
  return `Rp ${rupiahNumberFormatter.format(Math.round(amount))}`;
}

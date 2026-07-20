// Positional, exact-match header contract for Pak Hanafi's cash report —
// deliberately no fuzzy/synonym mapping (Gate 1J-A rule 17): silently
// guessing a column would let a differently-shaped workbook masquerade as
// this one and corrupt the reconciliation.
export const EXPECTED_HEADERS = ["TANGGAL", "KETERANGAN", "NAMA KAPAL", "DEBET", "KREDIT", "SALDO"] as const;

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 50_000;

export const KAS_LABEL = "Kas";
export const OVERHEAD_LABEL = "Lain-lain";

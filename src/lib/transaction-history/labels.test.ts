import { describe, expect, it } from "vitest";
import {
  labelOrRaw,
  PARTIALLY_REVERSED_EXPLANATION,
  TRANSACTION_DIRECTION_LABEL,
  TRANSACTION_SOURCE_LABEL,
  TRANSACTION_STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
} from "./labels";
import { TRANSACTION_DIRECTIONS, TRANSACTION_SOURCES, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "./types";

describe("label maps cover every value the view can produce", () => {
  it("has a label for every TRANSACTION_TYPES value", () => {
    for (const type of TRANSACTION_TYPES) {
      expect(TRANSACTION_TYPE_LABEL[type]).toBeDefined();
    }
  });

  it("has a label for every TRANSACTION_DIRECTIONS value", () => {
    for (const direction of TRANSACTION_DIRECTIONS) {
      expect(TRANSACTION_DIRECTION_LABEL[direction]).toBeDefined();
    }
  });

  it("has a label for every TRANSACTION_SOURCES value", () => {
    for (const source of TRANSACTION_SOURCES) {
      expect(TRANSACTION_SOURCE_LABEL[source]).toBeDefined();
    }
  });

  it("has a label for every TRANSACTION_STATUSES value", () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(TRANSACTION_STATUS_LABEL[status]).toBeDefined();
    }
  });
});

describe("labelOrRaw", () => {
  it("returns the mapped label for a known value", () => {
    expect(labelOrRaw(TRANSACTION_STATUS_LABEL, "reversed")).toBe("Sudah Dibatalkan");
  });

  it("falls back to the raw value for an unmapped value (never fabricates a label)", () => {
    expect(labelOrRaw(TRANSACTION_STATUS_LABEL, "unknown_future_status")).toBe("unknown_future_status");
  });

  it("shows an explicit placeholder for null (never a blank cell)", () => {
    expect(labelOrRaw(TRANSACTION_STATUS_LABEL, null)).toBe("-");
  });
});

describe("Gate 1K.1 — partially_reversed status", () => {
  it("has a distinct, non-regressed label from the pre-existing statuses", () => {
    expect(TRANSACTION_STATUS_LABEL.partially_reversed).toBe("Reversal Tidak Lengkap");
    expect(TRANSACTION_STATUS_LABEL.active).toBe("Aktif");
    expect(TRANSACTION_STATUS_LABEL.reversed).toBe("Sudah Dibatalkan");
    expect(TRANSACTION_STATUS_LABEL.reversal).toBe("Transaksi Pembatal");
  });

  it("provides an operational explanation naming it an Owner-review integrity exception", () => {
    expect(PARTIALLY_REVERSED_EXPLANATION).toMatch(/satu sisi/i);
    expect(PARTIALLY_REVERSED_EXPLANATION).toMatch(/owner/i);
  });
});

import * as XLSX from "xlsx";

const HEADER_MAP: Record<string, string> = {
  پلتفرم: "platform",
  platform: "platform",
  platformslug: "platform",
  slug: "platform",
  مبلغ: "amount",
  amount: "amount",
  مدت: "duration",
  duration: "duration",
  "تاریخ انقضا": "expiresAt",
  expiresat: "expiresAt",
  expiry: "expiresAt",
  expiration: "expiresAt",
  کد: "code",
  code: "code",
};

function mapHeader(header: string) {
  const trimmed = header.trim();
  return HEADER_MAP[trimmed] ?? HEADER_MAP[trimmed.toLowerCase()] ?? trimmed;
}

function isEmptyRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => value == null || String(value).trim() === "");
}

export function parseVoucherImportSheet(data: ArrayBuffer) {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });

  return rawRows
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const [header, value] of Object.entries(row)) {
        mapped[mapHeader(header)] = value instanceof Date ? value.toISOString() : value;
      }
      return mapped;
    })
    .filter((row) => !isEmptyRow(row));
}

export function downloadVoucherImportTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["پلتفرم", "مبلغ", "مدت", "تاریخ انقضا", "کد"],
    ["spotify", "100000", "6", "1404/07/01 23:59", "SAMPLE-CODE"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "vouchers");
  XLSX.writeFile(workbook, "voucher-import-template.xlsx");
}

import { NextResponse } from "next/server";
import { aggregateRoyaltiesCsv } from "@westbound/dsp";
import { parseRoyaltyCsv } from "@/lib/royalty-csv";

export async function POST(req: Request) {
  let csv: string;
  try {
    const body = (await req.json()) as { csv?: unknown };
    if (typeof body?.csv !== "string" || !body.csv.trim()) throw new Error("csv required");
    csv = body.csv;
  } catch {
    return NextResponse.json({ error: "csv required" }, { status: 400 });
  }
  const { rows, errors } = parseRoyaltyCsv(csv);
  if (errors.length) return NextResponse.json({ error: "Invalid CSV; nothing was imported", problems: errors }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  try {
    const imported = await aggregateRoyaltiesCsv(rows);
    return NextResponse.json({ imported, skippedDuplicates: rows.length - imported });
  } catch (e) {
    console.error("[royalty-import] failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Import failed; check the server log" }, { status: 500 });
  }
}

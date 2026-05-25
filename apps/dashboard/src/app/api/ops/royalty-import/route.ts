import { NextResponse } from "next/server";
import { aggregateRoyaltiesCsv } from "@westbound/dsp";

function parseCsv(csv: string) {
  const lines = csv.trim().split("\n");
  const rows: Array<{
    platform: string;
    amount: number;
    month: string;
    trackTitle?: string;
  }> = [];
  for (let i = 1; i < lines.length; i++) {
    const [platform, amount, month, trackTitle] = lines[i].split(",").map((s) => s.trim());
    if (!platform || !amount) continue;
    rows.push({
      platform,
      amount: Number(amount),
      month: month ?? new Date().toISOString().slice(0, 7),
      trackTitle,
    });
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const { csv } = (await req.json()) as { csv: string };
    const rows = parseCsv(csv);
    const imported = await aggregateRoyaltiesCsv(rows);
    return NextResponse.json({ imported });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

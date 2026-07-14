import { NextRequest, NextResponse } from "next/server";

const PYTHON = "http://localhost:5001";

export async function GET() {
  try {
    const r = await fetch(`${PYTHON}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "offline" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const endpoint = form.get("_endpoint") as string || "bokeh";
    form.delete("_endpoint");

    const r = await fetch(`${PYTHON}/${endpoint}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });

    const data = await r.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

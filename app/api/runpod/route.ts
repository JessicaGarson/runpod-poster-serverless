import { NextRequest, NextResponse } from "next/server";

const API_ROOT = "https://api.runpod.ai/v2";

function credentials() {
  return {
    apiKey: process.env.RUNPOD_API_KEY,
    endpointId: process.env.RUNPOD_ENDPOINT_ID,
  };
}

function extractImage(output: unknown): string | null {
  if (typeof output === "string") {
    return output.startsWith("http") || output.startsWith("data:image") ? output : null;
  }
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;
  for (const key of ["image", "image_url", "url"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  if (Array.isArray(record.images) && typeof record.images[0] === "string") {
    return record.images[0];
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { apiKey, endpointId } = credentials();
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ liveAvailable: Boolean(apiKey && endpointId) });
  }
  if (!apiKey || !endpointId) {
    return NextResponse.json({ error: "Live Runpod credentials are not configured." }, { status: 503 });
  }

  const response = await fetch(`${API_ROOT}/${endpointId}/status/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  return NextResponse.json({
    id: data.id,
    status: data.status,
    delayTime: data.delayTime ?? null,
    executionTime: data.executionTime ?? null,
    image: extractImage(data.output),
    error: data.error ?? null,
  });
}

export async function POST(request: NextRequest) {
  const { apiKey, endpointId } = credentials();
  if (!apiKey || !endpointId) {
    return NextResponse.json({ error: "Live Runpod credentials are not configured." }, { status: 503 });
  }

  const body = (await request.json()) as { prompt?: string; style?: string };
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }

  const promptField = process.env.RUNPOD_PROMPT_FIELD || "prompt";
  const subject = body.prompt.trim();
  const visualStyle = body.style || "Bold editorial poster";
  const styleDirection = visualStyle === "Brick built"
    ? "a playful brick-built poster style with interlocking toy blocks, round studs, bold primary colors, and no brand marks or logos"
    : `a ${visualStyle} visual style`;
  const response = await fetch(`${API_ROOT}/${endpointId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        [promptField]: [
          `Create an image of exactly this subject: ${subject}.`,
          `Use ${styleDirection}.`,
          "Keep the requested subject as the clear focus. Do not substitute a different character, object, or setting.",
        ].join(" "),
      },
    }),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

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
  if (typeof record.b64_json === "string") {
    return `data:image/png;base64,${record.b64_json}`;
  }
  for (const key of ["image", "image_url", "url"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  for (const key of ["data", "images"]) {
    if (Array.isArray(record[key]) && record[key].length > 0) {
      return extractImage(record[key][0]);
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { apiKey, endpointId } = credentials();
  const id = request.nextUrl.searchParams.get("id");
  const wantsHealth = request.nextUrl.searchParams.has("health");

  if (!id && !wantsHealth) {
    return NextResponse.json({ liveAvailable: Boolean(apiKey && endpointId) });
  }
  if (!apiKey || !endpointId) {
    return NextResponse.json({ error: "Live Runpod credentials are not configured." }, { status: 503 });
  }

  if (!id) {
    // Real worker and queue counts, so the stage view reflects the endpoint rather than a guess.
    const response = await fetch(`${API_ROOT}/${endpointId}/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json(data, { status: response.status });
    return NextResponse.json({ workers: data.workers ?? {}, jobs: data.jobs ?? {} });
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
        openai_route: "/v1/images/generations",
        openai_input: {
          model: process.env.RUNPOD_MODEL || "Tongyi-MAI/Z-Image-Turbo",
          prompt: [
            `Create an image of exactly this subject: ${subject}.`,
            `Use ${styleDirection}.`,
            "Keep the requested subject as the clear focus. Do not substitute a different character, object, or setting.",
          ].join(" "),
          size: process.env.RUNPOD_IMAGE_SIZE || "512x512",
          n: 1,
        },
      },
    }),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

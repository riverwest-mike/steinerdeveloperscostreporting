import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

const client = new Anthropic();

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export async function POST(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-clerk-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large for AI extraction (max 20 MB)" },
      { status: 400 }
    );
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);

  if (!isPdf && !isImage) {
    return NextResponse.json(
      { error: "AI extraction supports PDF and image files only" },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  type ContentBlock =
    | {
        type: "document";
        source: { type: "base64"; media_type: "application/pdf"; data: string };
      }
    | {
        type: "image";
        source: { type: "base64"; media_type: SupportedImageType; data: string };
      };

  const contentBlock: ContentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)
            ? (file.type as SupportedImageType)
            : "image/jpeg",
          data: base64,
        },
      };

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Extract key terms from this construction contract document. Return a JSON object with these exact fields (use null for any not found):

{
  "vendor_name": "Name of the contractor/vendor party",
  "contract_number": "Contract or agreement number if present",
  "description": "Brief description of the scope of work (1-2 sentences)",
  "original_value": numeric dollar amount of the total contract value (no $ or commas, e.g. 250000),
  "retainage_pct": numeric retainage percentage if stated (e.g. 10 for 10%, null if not found),
  "execution_date": "Contract signing or execution date in YYYY-MM-DD format",
  "substantial_completion_date": "Substantial completion or project end date in YYYY-MM-DD format"
}

For dates, look for phrases like "date of agreement", "signed on", "execution date", "contract date", "substantial completion", "completion date", "project end date". For the contract value, look for "contract sum", "contract price", "total price", "lump sum", "not to exceed". Return ONLY valid JSON with no markdown or explanation.`,
            },
          ],
        },
      ],
    });

    const text =
      (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)
        ?.text ?? "";

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data: extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

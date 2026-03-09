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
              text: `Extract data from this Certificate of Insurance (COI) document. Return a JSON object with these exact fields (use null for any not found):

{
  "insurer_name": "Name of the insurance company",
  "policy_number": "Policy or certificate number",
  "coverage_type": "One of: General Liability, Workers Compensation, Commercial Auto, Umbrella / Excess, Professional Liability, Builders Risk, Other",
  "effective_date": "Policy start date in YYYY-MM-DD format",
  "expiration_date": "Policy expiration date in YYYY-MM-DD format",
  "per_occurrence_limit": numeric value only (e.g. 1000000),
  "aggregate_limit": numeric value only (e.g. 2000000),
  "additional_insured": true or false,
  "waiver_of_subrogation": true or false
}

For coverage_type, pick the single most prominent coverage. For dollar limits, return numbers only (no $ or commas). Return ONLY valid JSON with no markdown or explanation.`,
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

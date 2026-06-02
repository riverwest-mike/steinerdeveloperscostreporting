# 06 — Claude-Powered Document Extraction API Routes

This document covers the two AI document-extraction endpoints in KILN. They let
the client upload a file (PDF or image), send it to Claude as a vision/document
content block, and receive structured JSON back for prefilling a form.

- `POST /api/extract-contract` — extracts construction-contract key terms.
- `POST /api/extract-document` — extracts Certificate of Insurance (COI) fields.

The two routes are **byte-for-byte identical except for the user-prompt text**
(the per-file extraction instructions / JSON shape). Everything else — imports,
auth, file handling, model, `max_tokens`, content-block construction, response
parsing, error handling — is the same. This document gives the shared skeleton
once, then the two prompts and their DB mappings.

> Out of scope (documented elsewhere): the agentic `/api/chat` route, the Clerk
> webhook (`/api/webhooks/*`), and all AppFolio routes. They are referenced but
> not re-described here.

---

## 1. Shared infrastructure

### 1.1 Imports & Anthropic client

Both files begin identically:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

const client = new Anthropic();
```

- `new Anthropic()` is constructed **with no arguments**, so the SDK reads the
  API key from the `ANTHROPIC_API_KEY` environment variable. **This env var is a
  hard dependency** — without it, the constructor (or first request) throws and
  the route returns a 500. There is no explicit key-presence check; it relies on
  the SDK's default behavior.
- The client is created at **module top level**, so it is instantiated once per
  serverless instance (cold start), not per request.

### 1.2 Supported image types

```ts
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];
```

### 1.3 HTTP method & auth

- **Method:** `POST` only (a single `export async function POST(req: NextRequest)`).
  No `GET`/`PUT`/etc. handlers are exported.
- **Auth check:** reads the `x-clerk-user-id` request header (set by the Clerk
  middleware — see below) and 401s if absent:

```ts
const headersList = await headers();
const userId = headersList.get("x-clerk-user-id");
if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

  Note: `userId` is only used as an auth gate; it is **not** otherwise used in
  the request (no per-user logging, no DB write from these routes).

  **How the header is populated:** `middleware.ts` runs `clerkMiddleware`. For
  any non-public route it calls `await auth()`, redirects to `/sign-in` if there
  is no `userId`, then forwards the verified id as a request header:

  ```ts
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-clerk-user-id"); // strip any client-supplied value
  requestHeaders.set("x-clerk-user-id", userId);
  return NextResponse.next({ request: { headers: requestHeaders } });
  ```

  The middleware deletes any client-supplied `x-clerk-user-id` first, so the
  header is trustworthy inside the route. Public routes (`/sign-in`, `/sign-up`,
  `/not-invited`, `/api/webhooks/*`) bypass this — but the extraction routes are
  **not** public, so a request can only reach them with a valid header.

### 1.4 Request body / file handling

The body is `multipart/form-data` with a single field named `file`.

```ts
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
```

**File-size limit — 20 MB:**

```ts
if (file.size > 20 * 1024 * 1024) {
  return NextResponse.json(
    { error: "File too large for AI extraction (max 20 MB)" },
    { status: 400 }
  );
}
```

**File-type gate** — accepts PDF (by MIME or `.pdf` extension) or one of the
four supported image MIME types; everything else is rejected:

```ts
const isPdf =
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);

if (!isPdf && !isImage) {
  return NextResponse.json(
    { error: "AI extraction supports PDF and image files only" },
    { status: 400 }
  );
}
```

**Base64 encoding** — the entire file is read into memory and base64-encoded:

```ts
const bytes = await file.arrayBuffer();
const base64 = Buffer.from(bytes).toString("base64");
```

### 1.5 Anthropic content block (document vs. image)

A single content block is built. PDFs use a `document` block; images use an
`image` block. The local TS union type and the construction:

```ts
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
```

- PDF → `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`.
- Image → `{ type: "image", source: { type: "base64", media_type: <file.type>, data } }`,
  falling back to `"image/jpeg"` if the MIME isn't one of the four supported.
  (In practice this fallback is unreachable since a non-image, non-PDF would have
  been rejected earlier, but it satisfies the type narrowing.)

### 1.6 Anthropic API call (shared params)

```ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        contentBlock,
        { type: "text", text: `<PROMPT — see §2 / §3>` },
      ],
    },
  ],
});
```

Key facts for a rebuild:
- **Model:** `"claude-sonnet-4-6"` (hard-coded string literal in both routes).
  This is a **model-version assumption** — the route will break if that model id
  is retired/renamed. No env override.
- **`max_tokens`:** `1024`.
- **No `system` prompt.** All instructions live in the single user-message text
  block. The message `content` array is exactly `[contentBlock, textBlock]` —
  the file block first, then the instruction text.
- **No tools / no JSON-schema tool definitions.** Extraction is **not** done via
  tool-use / structured-output. Claude is simply asked (in prose) to "Return
  ONLY valid JSON," and the route parses free text. There is no
  `tools`/`tool_choice`/`response_format` of any kind.
- **No temperature, no streaming, no prompt caching, no stop sequences** — only
  the four params shown above are passed.

### 1.7 Response parsing & validation

```ts
const text =
  (response.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined)
    ?.text ?? "";

// Strip markdown code fences if present
const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error("No JSON found in AI response");

const extracted = JSON.parse(jsonMatch[0]);
return NextResponse.json({ data: extracted });
```

Parsing steps:
1. Find the **first text block** in `response.content`; default to `""` if none.
2. Strip a leading ```` ``` ```` / ````` ```json ````` fence and a trailing
   ```` ``` ```` fence (multiline regex), then `trim()`.
3. Match the first `{ ... }` span (`/\{[\s\S]*\}/`, greedy). If none, throw
   `"No JSON found in AI response"` → caught → 500.
4. `JSON.parse` the matched substring.

**Validation note:** there is **no schema validation** of the parsed object. The
keys/types are whatever Claude returned. The route trusts the prompt to produce
the right shape; the client/consumer (the form prefill) is responsible for
handling missing or malformed fields. A malformed `JSON.parse` throws and is
caught as a 500.

### 1.8 Success response shape

On success the route returns HTTP 200:

```json
{ "data": { /* the parsed extraction object — see §2.1 / §3.1 */ } }
```

The extracted object is nested under a top-level `data` key.

### 1.9 Error handling summary

| Condition | Status | Body |
|---|---|---|
| Missing `x-clerk-user-id` header | 401 | `{ "error": "Unauthorized" }` |
| `req.formData()` throws | 400 | `{ "error": "Invalid form data" }` |
| No `file` field / empty file | 400 | `{ "error": "No file provided" }` |
| File > 20 MB | 400 | `{ "error": "File too large for AI extraction (max 20 MB)" }` |
| Non-PDF/non-image type | 400 | `{ "error": "AI extraction supports PDF and image files only" }` |
| Anthropic call throws, no JSON in reply, or `JSON.parse` fails | 500 | `{ "error": <err.message or "AI extraction failed"> }` |

The `try/catch` wraps **only** the Anthropic call + parsing block:

```ts
} catch (err) {
  const message = err instanceof Error ? err.message : "AI extraction failed";
  return NextResponse.json({ error: message }, { status: 500 });
}
```

So Anthropic SDK error messages (e.g. rate limits, bad API key) are surfaced
verbatim to the client in the 500 body.

### 1.10 Cost / token logging

**None.** Neither route logs token usage, cost, latency, or the
`response.usage` object. There is no audit-log write from these routes (unlike
the contract/document *save* server actions, which call `insertAuditLog`). The
extraction call is fire-and-discard except for the returned `data`.

---

## 2. `POST /api/extract-contract`

File: `app/api/extract-contract/route.ts`

Everything in §1 applies. The only unique piece is the text prompt.

### 2.1 Full user prompt (verbatim)

The text block appended after `contentBlock`:

```
Extract key terms from this construction contract document. Return a JSON object with these exact fields (use null for any not found):

{
  "vendor_name": "Name of the contractor/vendor party",
  "contract_number": "Contract or agreement number if present",
  "description": "Brief description of the scope of work (1-2 sentences)",
  "original_value": numeric dollar amount of the total contract value (no $ or commas, e.g. 250000),
  "retainage_pct": numeric retainage percentage if stated (e.g. 10 for 10%, null if not found),
  "execution_date": "Contract signing or execution date in YYYY-MM-DD format",
  "substantial_completion_date": "Substantial completion or project end date in YYYY-MM-DD format"
}

For dates, look for phrases like "date of agreement", "signed on", "execution date", "contract date", "substantial completion", "completion date", "project end date". For the contract value, look for "contract sum", "contract price", "total price", "lump sum", "not to exceed". Return ONLY valid JSON with no markdown or explanation.
```

### 2.2 Returned `data` object fields

| Field | Type (per prompt) |
|---|---|
| `vendor_name` | string \| null |
| `contract_number` | string \| null |
| `description` | string \| null |
| `original_value` | number \| null (no `$`/commas) |
| `retainage_pct` | number \| null (e.g. `10` for 10%) |
| `execution_date` | string `YYYY-MM-DD` \| null |
| `substantial_completion_date` | string `YYYY-MM-DD` \| null |

### 2.3 DB mapping → `contracts` table

The extracted object is **not** written to the DB by this route. It prefills the
contract create/edit form; the actual persistence happens in
`app/(dashboard)/projects/[id]/contracts/actions.ts` (`createContract` /
`updateContract`), which reads matching `formData` fields and inserts into the
`contracts` table. The extraction keys line up 1:1 with that payload:

```ts
vendor_name: (formData.get("vendor_name") as string).trim(),
contract_number: (formData.get("contract_number") as string)?.trim() || null,
// description maps to the contract description field
original_value: parseFloat(formData.get("original_value") as string) || 0,
retainage_pct: parseFloat(formData.get("retainage_pct") as string) || 0,
execution_date: (formData.get("execution_date") as string) || null,
substantial_completion_date: (formData.get("substantial_completion_date") as string) || null,
// ...inserted via supabase.from("contracts").insert(payload)
```

So: extraction field → `contracts.<same column name>`. Note the save action
coerces numeric fields with `parseFloat(...) || 0`, so a `null` from extraction
becomes `0` on save.

---

## 3. `POST /api/extract-document`

File: `app/api/extract-document/route.ts`

Everything in §1 applies. The only unique piece is the text prompt. This route
targets Certificate of Insurance (COI) documents.

### 3.1 Full user prompt (verbatim)

The text block appended after `contentBlock`:

```
Extract data from this Certificate of Insurance (COI) document. Return a JSON object with these exact fields (use null for any not found):

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

For coverage_type, pick the single most prominent coverage. For dollar limits, return numbers only (no $ or commas). Return ONLY valid JSON with no markdown or explanation.
```

### 3.2 Returned `data` object fields

| Field | Type (per prompt) | Notes |
|---|---|---|
| `insurer_name` | string \| null | |
| `policy_number` | string \| null | |
| `coverage_type` | string \| null | One of the 7 enumerated values |
| `effective_date` | string `YYYY-MM-DD` \| null | |
| `expiration_date` | string `YYYY-MM-DD` \| null | |
| `per_occurrence_limit` | number \| null | numbers only |
| `aggregate_limit` | number \| null | numbers only |
| `additional_insured` | boolean \| null | |
| `waiver_of_subrogation` | boolean \| null | |

`coverage_type` enum (exact strings from the prompt): `General Liability`,
`Workers Compensation`, `Commercial Auto`, `Umbrella / Excess`,
`Professional Liability`, `Builders Risk`, `Other`.

### 3.3 DB mapping → `vendor_documents` table

As with §2.3, this route does not persist. The prefill is saved by
`app/(dashboard)/vendors/[name]/actions.ts` (`saveVendorDocument` /
`updateVendorDocument`), which inserts/updates the `vendor_documents` table.
Field mapping (1:1 with the extraction keys):

```ts
supabase.from("vendor_documents").insert({
  insurer_name: insurerName,
  policy_number: policyNumber,
  coverage_type: coverageType,
  per_occurrence_limit: perOccurrenceLimit,
  aggregate_limit: aggregateLimit,
  additional_insured: documentType === "COI" ? additionalInsured : null,
  waiver_of_subrogation: documentType === "COI" ? waiverOfSubrogation : null,
  // effective_date / expiration_date also stored on the row
  // ...plus storage fields (the uploaded file is also saved to a storage bucket)
});
```

Important: `additional_insured` and `waiver_of_subrogation` are only persisted
when the document type is `"COI"`; otherwise the save action stores `null` for
them regardless of what extraction returned. The extraction route itself does
not know the document type — that distinction is applied at save time.

---

## 4. Rebuild checklist

1. Create `app/api/extract-contract/route.ts` and
   `app/api/extract-document/route.ts` as Next.js App Router route handlers
   exporting `async function POST(req: NextRequest)`.
2. Add `@anthropic-ai/sdk` to `dependencies`; instantiate `new Anthropic()` at
   module top level (reads `ANTHROPIC_API_KEY`).
3. Set `ANTHROPIC_API_KEY` in the environment (Vercel project env). Hard
   dependency; no fallback.
4. Implement the shared skeleton (§1.3–§1.9): Clerk header auth, `formData`
   parse, file presence/size(20 MB)/type(PDF + 4 image MIME) gates, base64
   encode, build `document` vs `image` content block.
5. Call `client.messages.create` with `model: "claude-sonnet-4-6"`,
   `max_tokens: 1024`, a single user message whose content is
   `[contentBlock, { type: "text", text: <PROMPT> }]`. No system prompt, no
   tools.
6. Paste the prompt verbatim — §2.1 for contract, §3.1 for COI.
7. Parse: first text block → strip code fences → first `{...}` regex match →
   `JSON.parse` → return `{ data: extracted }`. Throw "No JSON found in AI
   response" if no match.
8. Wrap the call+parse in try/catch returning `{ error: message }` with status
   500.
9. Ensure the Clerk middleware sets `x-clerk-user-id` and these routes are NOT
   in the public-route matcher.

---

## Summary

Both `/api/extract-contract` and `/api/extract-document` are identical POST
handlers that differ only in their prose prompt: Clerk-header auth, a 20 MB
PDF/image upload base64-encoded into a single Anthropic `document`/`image`
content block, sent to `claude-sonnet-4-6` (`max_tokens: 1024`, no system
prompt, no tools) with instructions to return raw JSON, which is then
fence-stripped, regex-matched, `JSON.parse`d, and returned as `{ data }`. The
contract route's fields map to the `contracts` table and the COI route's fields
to `vendor_documents`, but neither route writes the DB — separate server actions
persist the prefilled form, and there is no schema validation or token/cost
logging in either route.

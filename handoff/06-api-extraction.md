# 06 — Claude-Powered Document Extraction API Routes

This document covers the two AI document-extraction endpoints in the KILN
Next.js 14 (App Router) app:

- `app/api/extract-contract/route.ts` → `POST /api/extract-contract`
- `app/api/extract-document/route.ts` → `POST /api/extract-document`

Both routes take an uploaded file (PDF or image), send it to Claude with a
structured extraction prompt, parse the JSON the model returns, and hand the
extracted fields back to the client, which uses them to pre-fill a form. The
routes **do not write to the database themselves** — they are pure extraction
helpers. Persistence happens later when the user submits the pre-filled form
(via server actions documented elsewhere).

The two routes are **byte-for-byte identical except for the user prompt text**
(the extraction instructions and target JSON shape). Everything else — auth,
file handling, content-block construction, model, max_tokens, response parsing,
error handling — is the same.

> Out of scope (documented elsewhere): the agentic `/api/chat` route, the Clerk
> webhook, and the AppFolio routes. They are referenced here only where
> relevant (e.g. the Clerk header that auth relies on).

---

## 0. Shared dependencies and assumptions

### Anthropic SDK and API key

- Package: `@anthropic-ai/sdk` version `^0.78.0` (from `package.json`).
- The client is constructed at module top level with **no arguments**:

  ```ts
  import Anthropic from "@anthropic-ai/sdk";
  const client = new Anthropic();
  ```

  This means the SDK reads the API key from the **`ANTHROPIC_API_KEY`
  environment variable** implicitly. There is no explicit `apiKey:` option and
  no other env var name in use. **`ANTHROPIC_API_KEY` must be set in the
  deployment environment** (Vercel project env) or every request throws and
  falls into the 500 catch block.

### Model-version assumption

- Both routes hardcode `model: "claude-sonnet-4-6"`. There is no model alias,
  fallback, or env override — if that model ID is retired or unavailable to the
  key, the `messages.create` call throws and the route returns a 500 with the
  SDK error message. A rebuild should keep the model name configurable or pin a
  known-good Sonnet model ID.

### Auth

Both routes authenticate via a request header, **not** by calling Clerk
directly:

```ts
import { headers } from "next/headers";
const headersList = await headers();
const userId = headersList.get("x-clerk-user-id");
if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

`x-clerk-user-id` is injected by the app's `middleware.ts`, which strips any
client-supplied value and re-sets it from the verified Clerk session:

```ts
requestHeaders.delete("x-clerk-user-id"); // strip any client-supplied value
requestHeaders.set("x-clerk-user-id", userId);
```

So presence of the header is equivalent to "request is from a signed-in user."
The routes only check that `userId` is truthy — they do **not** check roles,
project membership, or do anything with the value beyond the gate. The `userId`
is not logged or attached to the Anthropic call.

### Cost / token logging

There is **none**. Neither route reads `response.usage`, logs token counts, or
records cost anywhere. The only thing returned is the parsed extraction. If
cost tracking is desired in a rebuild, it must be added.

---

## 1. Request format (identical for both routes)

- **HTTP method:** `POST` only (exported as `export async function POST`). No
  `GET`/other handlers, so other methods 405 by Next.js default.
- **Body:** `multipart/form-data` with a single field named **`file`**. The
  client builds it with `FormData`:

  ```ts
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/extract-contract", { method: "POST", body: fd });
  ```

- The route parses it via `req.formData()` (no base64 in the request — the file
  is uploaded as binary). Base64 encoding happens server-side before sending to
  Anthropic (see §3).

### Request validation / limits (in order)

1. **Auth:** missing `x-clerk-user-id` → `401 {"error":"Unauthorized"}`.
2. **Form parse:** `await req.formData()` wrapped in try/catch; failure →
   `400 {"error":"Invalid form data"}`.
3. **File presence:** `file` missing or `file.size === 0` →
   `400 {"error":"No file provided"}`.
4. **Size limit:** `file.size > 20 * 1024 * 1024` (20 MB) →
   `400 {"error":"File too large for AI extraction (max 20 MB)"}`.
5. **Type allow-list:** must be PDF or a supported image, else
   `400 {"error":"AI extraction supports PDF and image files only"}`.

### Accepted file types

```ts
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
```

```ts
const isPdf =
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type);
if (!isPdf && !isImage) { /* 400 */ }
```

- PDF is detected by MIME type **OR** `.pdf` filename extension (so a PDF with a
  missing/odd MIME still works).
- Images are detected by MIME type only (must be exactly one of the four).

---

## 2. Anthropic message construction (identical for both routes)

```ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        contentBlock,           // document or image block, see §3
        { type: "text", text: /* the extraction prompt, see §5/§6 */ },
      ],
    },
  ],
});
```

- **Model:** `claude-sonnet-4-6`
- **max_tokens:** `1024`
- **No `system` prompt** — all instructions live in the single user-message
  text block. The user message has exactly two content blocks: the file block
  first, then the text instructions.
- **No tools / no JSON-schema tool definition.** Despite the task framing,
  these routes do **not** use Anthropic tool-use / structured-output tools. The
  JSON shape is enforced purely by the prompt text ("Return ONLY valid JSON…")
  and parsed manually from the text response. A rebuild reproducing exact
  behavior should NOT add a tool; the contract is "model emits raw JSON text."
- **No streaming**, no temperature, no other parameters.

---

## 3. File → Anthropic content block (identical for both routes)

The uploaded file is read into memory and base64-encoded:

```ts
const bytes = await file.arrayBuffer();
const base64 = Buffer.from(bytes).toString("base64");
```

The content-block TypeScript type and the block built from it:

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

Behavior:

- **PDFs** → Anthropic **`document`** content block, `media_type:
  "application/pdf"`, base64-encoded. (Relies on Claude's native PDF/document
  support; the SDK version `^0.78.0` supports document blocks without a beta
  header.)
- **Images** → Anthropic **`image`** content block, `media_type` = the file's
  MIME type when it's one of the four supported types, otherwise it falls back
  to `"image/jpeg"`. (In practice the type check upstream guarantees it's a
  supported type, so the fallback is defensive.)

The whole file is held in memory and base64-encoded — combined with the 20 MB
limit this is the practical memory ceiling per request.

---

## 4. Response parsing & validation (identical for both routes)

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

Steps:

1. Find the **first** `text` block in `response.content`; default to `""` if
   none.
2. Strip a leading ```` ``` ```` / ```` ```json ```` fence and a trailing
   ```` ``` ```` fence (multiline-flag regexes), then `trim()`.
3. Match the first `{ … }` span (greedy, `[\s\S]*` so it spans newlines). If no
   brace block is found → throw `"No JSON found in AI response"` (caught → 500).
4. `JSON.parse` the matched substring. A parse failure throws (caught → 500).

**Validation is intentionally minimal:** there is **no schema validation, no
field whitelisting, and no type coercion** on the server. Whatever JSON object
the model emits is returned verbatim under `data`. The model is instructed to
use the exact field names and `null` for missing values; the **client** is
responsible for picking out known fields and ignoring extras (see §7).

### Success response shape

```jsonc
// HTTP 200
{ "data": { /* the parsed JSON object from Claude, see §5/§6 */ } }
```

### Error response shape

```jsonc
{ "error": "<message>" }
```

with status:

- `401` Unauthorized (no Clerk header)
- `400` for the four request-validation failures (see §1)
- `500` for any thrown error inside the try block (Anthropic API error, no JSON
  found, JSON.parse failure). Message is `err.message` when `err instanceof
  Error`, else the literal `"AI extraction failed"`:

  ```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  ```

  Note: this can leak raw Anthropic SDK error strings to the client.

---

## 5. `/api/extract-contract` — prompt & schema

**Purpose:** extract key terms from a construction contract to pre-fill the
"New Contract" form.

**Full user-message text block (verbatim):**

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

**Extracted fields:**

| JSON field                     | Type            | Notes                                  |
|--------------------------------|-----------------|----------------------------------------|
| `vendor_name`                  | string \| null  | contractor/vendor party name           |
| `contract_number`              | string \| null  | contract/agreement number              |
| `description`                  | string \| null  | 1–2 sentence scope of work             |
| `original_value`               | number \| null  | total contract value, no `$`/commas    |
| `retainage_pct`                | number \| null  | e.g. `10` for 10%                       |
| `execution_date`               | string \| null  | `YYYY-MM-DD`                            |
| `substantial_completion_date`  | string \| null  | `YYYY-MM-DD`                            |

### DB mapping → `contracts` table (`supabase/schema.sql`, "TABLE 10")

The extracted fields line up 1:1 with columns the New Contract form submits
into the `contracts` table:

| Extracted field                | `contracts` column            | Column type        |
|--------------------------------|-------------------------------|--------------------|
| `vendor_name`                  | `vendor_name`                 | `TEXT NOT NULL`    |
| `contract_number`              | `contract_number`             | `TEXT`             |
| `description`                  | `description`                 | `TEXT NOT NULL`    |
| `original_value`               | `original_value`              | `NUMERIC(15,2) NOT NULL` |
| `retainage_pct`                | `retainage_pct`               | `NUMERIC(5,2) NOT NULL DEFAULT 0` |
| `execution_date`               | `execution_date`              | `DATE`             |
| `substantial_completion_date`  | `substantial_completion_date` | `DATE`             |

(Other `contracts` columns — `project_id`, `gate_id`, `cost_category_id`,
`status`, Schedule-of-Values line items, `created_by`, etc. — are supplied by
the form / server action, not by extraction.)

### Consumer (for context)

`app/(dashboard)/projects/[id]/contracts/new/new-contract-form.tsx` calls the
route, then maps `json.data` into form state, guarding each field:

```ts
const d = json.data ?? {};
if (d.vendor_name) setVendorName(d.vendor_name);
if (d.contract_number) setContractNumber(d.contract_number);
if (d.description) setDescription(d.description);
if (d.original_value != null && !isNaN(Number(d.original_value))) setOriginalValue(String(d.original_value));
if (d.retainage_pct != null && !isNaN(Number(d.retainage_pct))) setRetainagePct(String(d.retainage_pct));
if (d.execution_date) setExecutionDate(d.execution_date);
if (d.substantial_completion_date) setCompletionDate(d.substantial_completion_date);
```

So extras returned by the model are ignored; numeric fields are validated
client-side with `isNaN(Number(...))`.

---

## 6. `/api/extract-document` — prompt & schema

**Purpose:** extract data from a **Certificate of Insurance (COI)** to pre-fill
the vendor COI document form.

**Full user-message text block (verbatim):**

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

**Extracted fields:**

| JSON field                | Type             | Notes                                              |
|---------------------------|------------------|----------------------------------------------------|
| `insurer_name`            | string \| null   | insurance company name                             |
| `policy_number`           | string \| null   | policy/certificate number                          |
| `coverage_type`           | string \| null   | one of the 7 enumerated values (see prompt)        |
| `effective_date`          | string \| null   | `YYYY-MM-DD`                                        |
| `expiration_date`         | string \| null   | `YYYY-MM-DD`                                        |
| `per_occurrence_limit`    | number \| null   | number only                                        |
| `aggregate_limit`         | number \| null   | number only                                        |
| `additional_insured`      | boolean \| null  | true/false                                         |
| `waiver_of_subrogation`   | boolean \| null  | true/false                                         |

`coverage_type` allowed values (from prompt): `General Liability`,
`Workers Compensation`, `Commercial Auto`, `Umbrella / Excess`,
`Professional Liability`, `Builders Risk`, `Other`.

### DB mapping → `vendor_documents` table (`supabase/migrations/20260310_vendor_documents.sql`)

The COI extraction fields map to the COI columns of `vendor_documents` (the
table also has Lien-Waiver / W-9 columns that extraction does not touch):

| Extracted field           | `vendor_documents` column   | Column type   |
|---------------------------|-----------------------------|---------------|
| `insurer_name`            | `insurer_name`              | `TEXT`        |
| `policy_number`           | `policy_number`             | `TEXT`        |
| `coverage_type`           | `coverage_type`             | `TEXT`        |
| `effective_date`          | `effective_date`            | `DATE`*       |
| `expiration_date`         | `expiration_date`           | `DATE`*       |
| `per_occurrence_limit`    | `per_occurrence_limit`      | `NUMERIC`     |
| `aggregate_limit`         | `aggregate_limit`           | `NUMERIC`     |
| `additional_insured`      | `additional_insured`        | `BOOLEAN`     |
| `waiver_of_subrogation`   | `waiver_of_subrogation`     | `BOOLEAN`     |

\* `effective_date` / `expiration_date` are COI date columns in the table
definition. Non-extraction columns (`vendor_name`, `project_id`,
`document_type` CHECK in `('COI','Lien Waiver','W-9','Other')`, `display_name`,
`storage_path`, lien-waiver fields, `notes`) are supplied by the upload form.

### Consumer (for context)

`app/(dashboard)/vendors/[name]/vendor-documents.tsx` maps `json.data` into COI
form state, including a client-side allow-list check on `coverage_type`:

```ts
const d = json.data;
setCoiFields({
  insurerName: d.insurer_name ?? "",
  policyNumber: d.policy_number ?? "",
  coverageType: (COVERAGE_TYPES as readonly string[]).includes(d.coverage_type) ? d.coverage_type : "",
  perOccurrenceLimit: d.per_occurrence_limit != null ? String(d.per_occurrence_limit) : "",
  aggregateLimit: d.aggregate_limit != null ? String(d.aggregate_limit) : "",
  effectiveDate: d.effective_date ?? "",
  expirationDate: d.expiration_date ?? "",
  additionalInsured: !!d.additional_insured,
  waiverOfSubrogation: !!d.waiver_of_subrogation,
});
```

Note the client also surfaces an error if `!resp.ok || json.error`, i.e. it
treats any `error` key in the body as a failure.

---

## 7. Rebuild checklist (minimal contract to reproduce)

1. App Router route file exporting `POST(req: NextRequest)`.
2. Auth: read `x-clerk-user-id` from `next/headers`; 401 if absent (middleware
   sets this from the verified Clerk session).
3. Parse `multipart/form-data`; read field `file`. Validate: present, size > 0,
   ≤ 20 MB, type PDF (MIME `application/pdf` or `.pdf` extension) or image
   (`image/jpeg|png|gif|webp`). Each failure → 400 with the exact messages in
   §1.
4. `arrayBuffer()` → `Buffer.from(...).toString("base64")`.
5. Build a `document` block for PDFs / `image` block for images (base64),
   followed by a `text` block with the verbatim prompt.
6. Call `client.messages.create` with `model: "claude-sonnet-4-6"`,
   `max_tokens: 1024`, single user message, no system, no tools.
7. Take the first `text` block, strip code fences, regex the first `{…}`,
   `JSON.parse`. Return `{ data }` on success.
8. Wrap the Anthropic call + parsing in try/catch → 500 `{ error: message }`.
9. Set `ANTHROPIC_API_KEY` in the environment (read implicitly by
   `new Anthropic()`).
10. No DB writes, no usage/cost logging — keep extraction stateless.

---

## Summary

Both `/api/extract-contract` and `/api/extract-document` are POST-only,
Clerk-header-gated routes that base64 a single uploaded PDF/image (≤ 20 MB) into
an Anthropic `document`/`image` content block, then ask `claude-sonnet-4-6`
(max_tokens 1024, no system prompt, no tools) to return a fixed-shape JSON
object via a verbatim prompt. The text response is fence-stripped, brace-matched,
`JSON.parse`d, and returned as `{ data }` with no server-side schema validation;
errors map to 401/400/500. The contract route's fields map 1:1 to the
`contracts` table and the document route's COI fields map to `vendor_documents`,
but persistence happens later in the form server actions — these routes only
extract and depend on `ANTHROPIC_API_KEY` plus the hardcoded model ID.
```
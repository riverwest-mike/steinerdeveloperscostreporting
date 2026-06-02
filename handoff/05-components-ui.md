# KILN — Shared UI / Layout / Dashboard / Design-System Layer

Rebuild reference for the shared component layer of KILN, a Next.js 14 App
Router / RSC app. Everything below is reproducible without repo access.

Tech context:
- Tailwind CSS, design tokens declared as HSL CSS custom properties consumed
  through Tailwind's `hsl(var(--token))` convention.
- shadcn/ui primitives over Radix UI, styled with `class-variance-authority`
  (`cva`) + the `cn()` helper.
- Icons from `lucide-react`. Auth from `@clerk/nextjs` (`UserButton`).
- Markdown via `react-markdown` + `remark-gfm`.

---

## 1. Design System (`app/globals.css`)

The file is light-theme only; the sidebar carries its own dark tokens. Top of
file imports Tailwind layers:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 1.1 Brand palette (documented in a comment header)

| Name | Hex | Role |
|------|-----|------|
| Terracotta | `#C4552D` | primary action, sidebar active |
| Charcoal | `#141414` | sidebar surface, foreground text |
| Slate | `#3A3F44` | secondary structure |
| Warm Gray | `#E6E2DD` | neutral surfaces, borders |
| Signal Blue | `#2563EB` | informational |
| Approval Green | `#16A34A` | approved / success |

### 1.2 Complete CSS custom properties (`:root` in `@layer base`)

All values are **HSL channel triplets** (no `hsl()` wrapper) so Tailwind can
compose them with alpha. Reproduce exactly:

```css
@layer base {
  :root {
    --background:       36 33% 97%;    /* warm cream off-white */
    --foreground:       0 0% 8%;       /* charcoal #141414 */
    --card:             0 0% 100%;
    --card-foreground:  0 0% 8%;
    --popover:          0 0% 100%;
    --popover-foreground: 0 0% 8%;

    --primary:          15 63% 47%;    /* terracotta #C4552D */
    --primary-foreground: 0 0% 100%;

    --secondary:        36 14% 92%;    /* warm gray surface */
    --secondary-foreground: 0 0% 8%;

    --muted:            36 14% 95%;
    --muted-foreground: 210 6% 38%;    /* slate-derived */

    --accent:           36 14% 89%;    /* warm gray accent */
    --accent-foreground: 0 0% 8%;

    --destructive:      0 72% 45%;
    --destructive-foreground: 0 0% 100%;

    --border:           36 12% 86%;
    --input:            36 12% 86%;
    --ring:             15 63% 47%;
    --radius:           0.5rem;

    /* Sidebar tokens (charcoal surface, terracotta active) */
    --sidebar-bg:       0 0% 8%;       /* charcoal #141414 */
    --sidebar-fg:       36 14% 80%;
    --sidebar-muted:    36 8% 55%;
    --sidebar-active-bg: 15 63% 47%;   /* matches --primary */
    --sidebar-hover-bg: 0 0% 14%;
    --sidebar-border:   0 0% 18%;

    /* Status colors */
    --status-active:    142 76% 36%;   /* approval green #16A34A */
    --status-hold:      38 90% 45%;
    --status-complete:  221 83% 53%;   /* signal blue #2563EB */
    --status-archived:  210 6% 45%;
  }
}
```

These tokens map to Tailwind theme keys (in `tailwind.config`, not read here
but implied): `bg-background`, `text-foreground`, `bg-primary`,
`text-primary-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`,
`bg-secondary`, `bg-accent`, `bg-destructive`, `border-border`, `border-input`,
`ring-ring`, and `rounded-*` derived from `--radius` (0.5rem). The sidebar/status
tokens are consumed inline via `hsl(var(--…))` (e.g. `style={{ background:
"hsl(var(--sidebar-bg))" }}`).

### 1.3 Base layer global rules

```css
@layer base {
  * { @apply border-border; }          /* default border color everywhere */

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";  /* font stylistic sets */
  }
}
```

Fonts: configured via `next/font` (per project CLAUDE.md) and exposed through
the Tailwind font family; the OpenType `cv02/cv03/cv04/cv11` stylistic sets are
enabled globally on `body`.

### 1.4 `.kiln-table` component classes (`@layer components`)

Add `class="kiln-table"` to any `<table>` for branded headers. Reproduce:

```css
@layer components {
  .kiln-table thead tr {
    @apply border-b;
    background-color: hsl(var(--sidebar-bg));   /* charcoal */
    color: hsl(var(--sidebar-fg));
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .kiln-table thead th {
    @apply px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase;
    color: hsl(36 14% 75%);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .kiln-table tbody tr {
    @apply border-b transition-colors last:border-0;
  }
  .kiln-table tbody tr:nth-child(even) { @apply bg-muted/30; }   /* zebra */
  .kiln-table tbody tr:hover           { @apply bg-accent/60; }
}
```

### 1.5 Print styles (`@media print`) — applies to ALL pages

Key behaviors: landscape, white background, hide chrome (`aside`, `header`,
`nav`, `.print:hidden`), force color rendering, brand-dark table headers, and a
dedicated `#pcm-report` 15-column fit. Reproduce verbatim:

```css
@media print {
  html, body { height: auto; overflow: visible; background: white !important; font-size: 11pt; }
  @page { size: landscape; margin: 0; }        /* margin:0 removes browser URL/title headers */
  html, body { padding: 0.4in; }               /* replaces @page margin */

  aside, header, nav, .print\:hidden { display: none !important; }

  .print-header { display: block !important; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 2pt solid #141414; }
  .print-header h1 { font-size: 14pt; font-weight: 700; color: #141414; }
  .print-header p  { font-size: 9pt; color: #555; }

  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  table thead tr, .kiln-table thead tr { background-color: #141414 !important; color: white !important; }
  table thead th, .kiln-table thead th { color: #cbc6be !important; font-size: 7pt !important; padding: 4pt 6pt !important; text-transform: uppercase; letter-spacing: 0.04em; }
  table tbody td { font-size: 8pt !important; padding: 3pt 6pt !important; }
  table tbody tr:nth-child(even) { background-color: #f6f3ee !important; }
  table { border-collapse: collapse; width: 100%; }

  #pcm-report { overflow: visible !important; }
  #pcm-report table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; border-collapse: collapse !important; }
  /* Cost Code 7%, Description 14%, 13 data cols share remaining ~6.08% each */
  #pcm-report col:nth-child(1) { width: 7%; }
  #pcm-report col:nth-child(2) { width: 14%; }
  #pcm-report col:nth-child(n+3) { width: 6.08%; }
  #pcm-report th, #pcm-report td { padding: 1pt 2pt !important; white-space: normal !important; word-break: break-word !important; overflow: hidden !important; font-size: 6pt !important; line-height: 1.2 !important; }
  #pcm-report th { font-size: 5pt !important; line-height: 1.1 !important; }

  .page-break-before { page-break-before: always; }
  .page-break-after  { page-break-after: always; }
  .avoid-break       { page-break-inside: avoid; }
}
```

---

## 2. `cn()` helper (`lib/utils.ts`)

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
Standard shadcn merge: `clsx` for conditional joins, `tailwind-merge` to
de-dupe conflicting Tailwind classes. Used everywhere.

---

## 3. Layout / Shell

### 3.1 `DashboardShell` (`components/layout/dashboard-shell.tsx`) — `"use client"`

Props: `{ role: string; children: React.ReactNode }`.

Composition (top-to-bottom):
- Wraps everything in `<ConfirmDestructiveProvider>` (section 5.4).
- Root: `flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible`.
- **Desktop sidebar**: `<div className="hidden md:flex h-full print:hidden"><Sidebar role={role} /></div>` — always visible at `md+`, hidden in print.
- **Mobile drawer**: state `mobileOpen`. When open, renders a fixed `inset-0 z-50 md:hidden` overlay = backdrop (`bg-black/40 backdrop-blur-sm`, click-to-close) + a `w-64` slide-in panel (`animate-in slide-in-from-left-2 duration-200`) containing `<Sidebar role={role} onClose={closeDrawer} />`.
- **Main**: `flex flex-1 flex-col … min-w-0` with a scrollable `<main>` rendering `children` plus a footer.
- **Footer**: `border-t mt-8 px-4 sm:px-6 py-3 text-[11px] text-muted-foreground`, hidden in print, content: left `KILN by RiverWest` (KILN bold), right `kilnhq.com`.
- Mounts three always-on, render-nothing/floating helpers at the end:
  `<ActivityTracker />`, `<QuickStartTrigger />`, `<AiChatWidget />`.

Mobile nav behavior:
- Listens on `window` for the custom `"open-mobile-nav"` event → `setMobileOpen(true)`.
- While `mobileOpen`, sets `document.body.style.overflow = "hidden"` (scroll lock), restored on close/unmount.

### 3.2 `Header` (`components/layout/header.tsx`) — server component

Props: `{ title: string; helpContent?: PageHelpContent }`.

```
<header class="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6 print:hidden">
  left:  <MobileNavTrigger /> + <h1 class="text-lg font-semibold text-foreground truncate">{title}</h1>
  right: {helpContent && <PageHelp content={helpContent} />} + <UserButton afterSignOutUrl="/sign-in" />
</header>
```
`UserButton` is Clerk's avatar/account menu. The page-help `?` button only
appears when `helpContent` is supplied.

### 3.3 `MobileNavTrigger` (`components/layout/mobile-nav-trigger.tsx`) — `"use client"`

Hamburger button, `md:hidden`, icon `Menu` (lucide). On click dispatches
`window.dispatchEvent(new Event("open-mobile-nav"))` — decoupled from the shell
via the window event. Classes: `flex h-9 w-9 items-center justify-center
rounded-md text-muted-foreground hover:bg-muted hover:text-foreground …`.

### 3.4 `Sidebar` (already documented elsewhere — brief)

Client component (`components/layout/sidebar.tsx`). Charcoal surface using
`--sidebar-*` tokens. Renders `<KilnLockup>` at top, nav links (`Dashboard`,
`Projects`, `Vendors`), a collapsible **Reporting** group (`reportItems`: Project
Cost Management, Cost Detail, Vendor Detail, Commitment Detail, Change Order Log,
Balance Sheet, etc.), a role-gated **Settings/Admin** group (`settingsItems`:
Users & Access, Cost Categories, AppFolio, …), and a Quick Start Guide link that
dispatches `"open-quickstart"`. Accepts `role` (for gating) and optional
`onClose` (mobile). Uses `usePathname()` for active-state highlighting.

---

## 4. Brand logo (`components/brand/kiln-logo.tsx`)

Two exports.

### 4.1 `KilnMark`
Props: `{ className?: string; title?: string ("KILN") }`. An inline SVG
"chamber" mark — a 32×32 solid block with a rectangular doorway notch in the
bottom edge. `fill="currentColor"` so color comes from `text-*`. Default size
`h-6 w-6`.
```tsx
<svg viewBox="0 0 32 32" fill="currentColor" role="img" aria-label={title} className={cn("h-6 w-6", className)}>
  <path d="M3 3h26v26h-9V18h-8v11H3V3Z" />
</svg>
```

### 4.2 `KilnLockup`
Props:
- `endorsed?: boolean` (default `false`) — show the "by RiverWest" endorser line.
- `size?: "sm" | "md" | "lg"` (default `"md"`).
- `invert?: boolean` (default `false`) — force light/white text for dark surfaces.
- `className?: string`.

Size map:
```ts
const sizeMap = {
  sm: { mark: "h-5 w-5", word: "text-[13px]", endorser: "text-[10px]" },
  md: { mark: "h-7 w-7", word: "text-base",   endorser: "text-[11px]" },
  lg: { mark: "h-9 w-9", word: "text-xl",     endorser: "text-xs" },
};
```
Layout: `flex items-center gap-2.5`. The mark is rendered as
`text-primary shrink-0` (terracotta) at the size's `mark` class. The wordmark
`KILN` is `font-extrabold tracking-tight uppercase` colored `text-white` when
`invert` else `text-foreground`. Endorser line "by RiverWest" colored
`text-[hsl(var(--sidebar-muted))]` when `invert` else `text-muted-foreground`.
Used in headers, sidebar, and auth pages.

---

## 5. shadcn UI primitives (`components/ui/*`)

All use `cn()` and (where stateful) Radix. Display names mirror the Radix root.

### 5.1 `avatar.tsx` — wraps `@radix-ui/react-avatar`
- `Avatar` = `AvatarPrimitive.Root`, classes `relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full`.
- `AvatarImage` = `AvatarPrimitive.Image`, `aspect-square h-full w-full`.
- `AvatarFallback` = `AvatarPrimitive.Fallback`, `flex h-full w-full items-center justify-center rounded-full bg-muted`.

### 5.2 `badge.tsx` — pure `cva`, no Radix
Base: `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs
font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring
focus:ring-offset-2`. Variants:
```ts
default:     "border-transparent bg-primary text-primary-foreground hover:bg-primary/80"
secondary:   "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80"
outline:     "text-foreground"
```
Default variant `default`. `Badge` is a `<div>` spreading
`badgeVariants({ variant })`. Exports `Badge`, `badgeVariants`.

### 5.3 `button.tsx` — `cva` + `@radix-ui/react-slot`
Base: `inline-flex items-center justify-center whitespace-nowrap rounded-md
text-sm font-medium ring-offset-background transition-colors
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50`.
```ts
variant: {
  default:     "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline:     "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost:       "hover:bg-accent hover:text-accent-foreground",
  link:        "text-primary underline-offset-4 hover:underline",
}
size: {
  default: "h-10 px-4 py-2",
  sm:      "h-9 rounded-md px-3",
  lg:      "h-11 rounded-md px-8",
  icon:    "h-10 w-10",
}
```
Defaults `variant:"default", size:"default"`. `asChild` prop → renders Radix
`Slot` instead of `<button>`. forwardRef. Exports `Button`, `buttonVariants`.

### 5.4 `dialog.tsx` — wraps `@radix-ui/react-dialog`
Re-exports `Dialog` (Root), `DialogTrigger`, `DialogPortal`, `DialogClose`.
- `DialogOverlay`: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm` + open/close fade animations.
- `DialogContent`: portals overlay + content. Centered card: `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 bg-background p-6 shadow-lg … rounded-xl border`, with zoom/slide in-out data-state animations. Renders children + an absolute top-right close button (`X` icon, `sr-only "Close"`).
- `DialogHeader`: `flex flex-col space-y-1.5 text-center sm:text-left` div.
- `DialogTitle`: `text-lg font-semibold leading-none tracking-tight`.
- `DialogDescription`: `text-sm text-muted-foreground`.

### 5.5 `separator.tsx` — wraps `@radix-ui/react-separator`
`Separator` props default `orientation="horizontal"`, `decorative=true`. Classes
`shrink-0 bg-border` + `h-[1px] w-full` (horizontal) or `h-full w-[1px]`
(vertical).

---

## 6. Shared components

### 6.1 `ActivityTracker` (`components/activity-tracker.tsx`) — `"use client"`
Renders `null`. Mounted once in `DashboardShell`. Uses `usePathname()`; on every
route change (deduped via a `lastPath` ref) it fires:
```ts
fetch("/api/activity", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "page_view", path: pathname }),
}).catch(() => {});
```

### 6.2 `AiChatWidget` (`components/ai-chat-widget.tsx`) — `"use client"`
Floating bottom-right AI assistant. Mounted once in `DashboardShell`.

State: `open`, `messages` (`Anthropic.MessageParam & { id }`), `input`,
`streaming`; refs `bottomRef`, `inputRef`, `abortRef` (AbortController).

Triggers / events:
- Listens on `window` for `"open-ai-chat"` (a `CustomEvent<string>`); the
  `detail` is an optional query. On receipt: opens the panel and, if a query is
  present, calls `sendMessage(query)` after 100ms. (Dispatched by
  `DashboardChatInput`.)
- Bottom-right bubble (`h-12 w-12 rounded-full`) toggles `open`. Bubble icon:
  `MessageCircle` when closed (primary bg), `X` when open (muted bg).
- Container: `fixed bottom-6 right-6 z-50 … print:hidden`.

Panel: `w-[calc(100vw-3rem)] max-w-[380px] h-[min(520px,75vh)] rounded-xl border
shadow-2xl`. Header ("Ask anything" + a `Trash2` clear button shown when there
are messages + an `X` close). Empty state hint text. Footer textarea (Enter to
send, Shift+Enter newline) + send button (`Send`, or spinning `Loader2` while
streaming).

**Streaming call to `/api/chat`** (the core integration):
```ts
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
  signal: controller.signal,
});
if (!res.ok || !res.body) throw new Error("Request failed");
const reader = res.body.getReader();
const decoder = new TextDecoder();
let accumulated = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
}
```
The endpoint streams **raw text** (not SSE/JSON); the widget appends decoded
chunks directly into the assistant message. A placeholder assistant message
(empty content) is inserted before streaming begins. Errors (non-Abort) replace
content with "Something went wrong. Please try again." `handleClose` aborts the
in-flight request; `handleClear` aborts + resets all state.

**Markdown rendering (`ChatMessage`):** user messages render plain
(`whitespace-pre-wrap`, primary bubble). Assistant messages render through
`<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: … }}>` inside a
`prose prose-sm prose-slate` container with a large block of arbitrary-variant
table/list/code/heading/blockquote styles (e.g. `[&_table]:w-full
[&_th]:bg-slate-100`, `[&_code]:bg-slate-100`, etc.). Custom `a` renderer: links
starting with `/` render as a `<button>` calling `onNavigate(href)` (closes
panel + `router.push(href)`); external links open in a new tab with
`rel="noopener noreferrer"`. While streaming the last assistant message shows a
blinking caret (`animate-pulse`). A hover-revealed copy button uses
`navigator.clipboard.writeText` and shows a green `Check` for 2s.

### 6.3 `ConfirmDestructive` (`components/confirm-destructive.tsx`) — `"use client"`
Destructive-action confirmation modal pattern, provided via React context.

- `ConfirmDestructiveProvider` mounted once (in `DashboardShell`). Exposes via
  context an async `open(opts)` function. `useConfirmDestructive()` returns it
  (throws if used outside the provider).
- `ConfirmOptions`: `{ title; body?: ReactNode; confirmLabel?; cancelLabel?;
  reasonLabel?; reasonPlaceholder?; requireReason?: boolean }`.
- Returns `Promise<string | null>`: resolves to the **trimmed reason string**
  on confirm (may be `""` when not required), or `null` on cancel/Escape/backdrop.

Usage:
```ts
const confirm = useConfirmDestructive();
const reason = await confirm({ title: "Delete project?", confirmLabel: "Delete" });
if (reason === null) return;        // cancelled
await deleteProject(id, reason);
```
UI: full-screen `z-[60]` backdrop `bg-black/80 backdrop-blur-sm`; card
`max-w-md rounded-xl border`. Header has a `bg-destructive/10` circle with
`AlertTriangle` (destructive), the title, and optional body. A required/optional
`reason` `<textarea>` (auto-focused; required shows red `*`, optional shows
"(optional)"). Hint "⌘/Ctrl + Enter to confirm." Footer: Cancel (outline) +
Confirm (`bg-destructive`; disabled while `requireReason` and reason empty, or
while `busy`; shows `Loader2` when busy). Escape cancels (unless busy); body
scroll locked while open.

### 6.4 `InfoTip` (`components/info-tip.tsx`) — `"use client"`
`<InfoTip text="…" />`. An amber circular `!` badge (`bg-amber-100
border-amber-400 text-amber-700`, `cursor-help`) with a CSS hover tooltip — a
`w-72 rounded-lg bg-slate-800 text-white` bubble positioned `bottom-full left-0`,
fading in on `group-hover`, with a small triangular arrow. Pure CSS, no JS state.

### 6.5 `PageHelp` (`components/page-help.tsx`) — `"use client"`
Renders the `?` help button in the header and a slide-in help panel. Types:
```ts
interface HelpSection { heading: string; body: string }
interface HelpAction  { label: string; desc: string }
interface PageHelpContent {
  title: string; description: string;
  sections?: HelpSection[]; actions?: HelpAction[]; tip?: string;
}
```
Props: `{ content: PageHelpContent }`.

Trigger: `h-8 w-8 rounded-full border` `HelpCircle` button (hover → primary),
`print:hidden`. Panel: right-anchored modal (`fixed inset-0 flex items-start
justify-end`, backdrop `bg-black/20 backdrop-blur-sm`), card `max-w-md
max-h-[90vh]` sliding in (`animate-in slide-in-from-right-4`). Sections rendered
in order:
1. Header (HelpCircle chip + `content.title` + "Page Help").
2. `content.description` paragraph.
3. **Key Actions** (if `actions`): bordered list, each row a `ChevronRight` +
   `label` (bold) + `desc`.
4. **Sections** (if `sections`): each `heading` (uppercase) + `body`.
5. **Tip** (if `tip`): `Lightbulb` callout in `bg-primary/8 border-primary/20`.
6. Footer link "Open full Quick Start Guide →" which closes the panel then
   dispatches `window.dispatchEvent(new Event("open-quickstart"))` after 100ms.

Closes on Escape and on backdrop click.

### 6.6 `LocalTime` (`components/local-time.tsx`) — `"use client"`
Props `{ iso: string; timeClassName?: string ("text-[10px]") }`. Renders empty
on the server (avoids hydration mismatch); in `useEffect` formats `iso` to local
`en-US` date (`{month:"short", day:"numeric", year:"numeric"}`) and time
(`hour/minute/second, 2-digit`). Outputs `<div>{date}</div>` + a time `<div>`
using `timeClassName`.

### 6.7 `TimeGreeting` (`components/time-greeting.tsx`) — `"use client"`
Props `{ name: string | null | undefined }`. Computes from local `getHours()`:
`<12` "Good morning", `<17` "Good afternoon", else "Good evening"; appends
`, {name}` if name present.

### 6.8 Quickstart

**`QuickStartTrigger`** (`components/quickstart/quickstart-trigger.tsx`,
`"use client"`): mounted once in shell. On mount: auto-opens the modal the first
time (when `localStorage["qs_seen_v1"]` is absent), and adds a `window` listener
for the `"open-quickstart"` event to re-open it on demand (dispatched by the
sidebar link and by `PageHelp`). Renders `<QuickStartModal isOpen … onClose … />`.

**`QuickStartModal`** (`components/quickstart/quickstart-modal.tsx`): a 9-step
guided tour (`sections` array, indices 0–8): Welcome, Navigating the App,
Projects & Gates, Contracts & SOV, PCM Report (13-column reference table),
Reports Index & Drilldown, Vendors & Compliance, Admin Panel, Quick Tips. Each
section has `{ title, icon (lucide), content (JSX) }`. Helper subcomponents:
`Screenshot` (img with broken-image dashed-box fallback), `Hint` (primary-tinted
💡 callout), `StepList` (numbered list). Modal: centered `max-w-3xl`, header with
`BookOpen` + "Quick Start Guide" + `{step+1}/{sections.length}`, step title row,
scrollable body, footer with dot pagination (active dot wider `w-5`) +
Previous/Next or Done. `handleClose` sets `localStorage["qs_seen_v1"]="1"` so it
won't auto-open again. Closes on Escape / backdrop click.

### 6.9 `ExpandButton` / `ExpandedModal` (`components/expandable-card.tsx`) — `"use client"`
Used by all dashboard alert/list widgets to expand into a large modal.
- `ExpandButton`: small `Maximize2` icon button, placed in a card header.
- `ExpandedModal`: `{ open, onClose, children }`. Centered `max-w-5xl
  max-h-[85vh]` modal over `bg-black/40 backdrop-blur-sm`; close on Escape /
  backdrop; body scroll locked while open; top-right `X`.

---

## 7. Dashboard home + widgets

### 7.1 `DashboardPage` (`app/(dashboard)/dashboard/page.tsx`) — RSC, `force-dynamic`
Server component. Flow:
1. Reads Clerk user id from `headers().get("x-clerk-user-id")`; loads
   `users.full_name, role` via Supabase **admin** client. Default role
   `"read_only"`.
2. `isAdmin = role in {admin, accounting, development_lead}` → sees all
   projects. Otherwise resolves `allowedProjectIds` from `project_users` and
   filters the `projects` query by them.
3. Empty state: if no projects, renders header + greeting + a message (admins
   get a "Create your first project" link; others "contact your admin").
4. Loads active gates → `gate_budgets` (sums `revised_budget` per gate, then per
   project), proposed `change_orders` (PM/admin only), `appfolio_transactions`
   spend (paid+unpaid summed per property, `limit 5000`), `cost_categories`
   (active), per-category actuals (`limit 10000`), recent `appfolio_transactions`
   bills (last **90 days**, `limit 1000`), COI + Lien Waiver `vendor_documents`,
   and non-terminated `contracts` (for total committed).
5. `usd()` compact formatter: `>=1M → $X.XM`, `>=1K → $XK`, else `$X`.

Render: `<Header title="Dashboard" helpContent={HELP.dashboard} />`, a
`<TimeGreeting>` h2, `<DashboardChatInput>`, a tagline, a **4-card KPI strip**
(Total Projects; Total Commitments; Forecast to Complete = `max(0, portfolioValue
- totalSpent)`; and for non-read_only "Total Exposure" = pending CO value with a
pending-CO count, else "Your Role"), then `<ProjectGrid>`, conditional
`<BudgetAlerts>` / `<COIAlerts>` / `<LienWaiverAlerts>` (only when their arrays
are non-empty), and a `RecentBills` + (PM/admin) `PendingCOs` grid
(`lg:grid-cols-5`, 3/2 split).

**Over-budget alert computation** (the key threshold logic):
```ts
const overBudgetAlerts: OverBudgetAlert[] = [];
for (const gb of rawGateBudgets ?? []) {
  if (Number(gb.revised_budget) <= 0) continue;
  const projectId = gateToProject.get(gb.gate_id);
  if (!projectId) continue;
  const propertyId = projectToProperty.get(projectId);
  if (!propertyId) continue;
  const key = `${propertyId}::${gb.cost_category_id}`;
  const actual = actualsByPropertyCategory.get(key) ?? 0;   // summed invoice_amount, GL code → category
  const overage = actual - Number(gb.revised_budget);
  if (overage <= 0) continue;                                // only over-budget rows
  // …push {project, gate, category, revised_budget, actual_amount, overage}
}
overBudgetAlerts.sort((a, b) => b.overage - a.overage);      // largest overage first
```
Actuals are matched by uppercased/trimmed `gl_account_id` → cost-category `code`.

COI / Lien Waiver alert windows: documents with a non-null `expiration_date`
`<=` **60 days** out (`in60DaysStr`) including already-expired, filtered to docs
with no `project_id` or an **active** project. `days_until_expiry` =
round((exp − today)/86_400_000).

### 7.2 `BudgetAlerts` (`budget-alerts.tsx`) — `"use client"`
Props `{ alerts: OverBudgetAlert[] }`; renders nothing if empty. Header: red dot
+ "Budget Alerts" + count + total overage (red). Inline `ExpandButton` opens an
`ExpandedModal` with the same list (`expanded` adds a project `<select>`).
Filters: overage buttons `["All","5+ over","10+ over"]` → thresholds **$5,000 /
$10,000**:
```ts
if (overageFilter === "5+ over"  && a.overage < 5_000)  return false;
if (overageFilter === "10+ over" && a.overage < 10_000) return false;
```
Each row is a `Link` to `/projects/{project_id}/gates/{gate_id}`, showing
project · gate, `{category_code} {category_name}`, budget/actual, and
`+{overage}` with `pctOver = round((actual-budget)/budget*100)`. `usd()` here is
`Intl.NumberFormat` currency, 0 fraction digits.

### 7.3 `COIAlerts` (`coi-alerts.tsx`) — `"use client"`
Table of COI documents. Header summary "{n} expired · {n} expiring within 60
days". Expanded view adds vendor search, status filter buttons
`["All","Expired","≤30 days","31–60 days"]`, and a coverage-type `<select>`.
Status filter logic:
```ts
if (statusFilter === "Expired"     && a.days_until_expiry >= 0) return false;
if (statusFilter === "≤30 days"    && (a.days_until_expiry < 0  || a.days_until_expiry > 30)) return false;
if (statusFilter === "31–60 days"  && (a.days_until_expiry < 31 || a.days_until_expiry > 60)) return false;
```
Columns: Vendor (link to `/vendors/{name}`), [Project when expanded], Document,
Coverage, Expires (red if expired else amber-700), Status pill — `bg-red-100`
expired / `bg-orange-100` `<=30d` / `bg-amber-100` otherwise; label
`Expired Xd ago` / `Expires today` / `Xd left`. Non-expanded table is
`max-h-64` scrollable with sticky header.

### 7.4 `LienWaiverAlerts` (`lien-waiver-alerts.tsx`) — `"use client"`
Same table pattern as COI but `expiration_date` may be `null`. Buckets:
expired (`days<0`), expiring soon (`days>=0`), and **no expiry set** (`days===null`
→ gray "No date set" pill). Filters: vendor search + project `<select>`. Columns
mirror COI (Type = coverage_type). Same `≤30d` orange / else amber threshold for
non-expired pills.

### 7.5 `PendingCOs` (`pending-cos.tsx`) — `"use client"`
List of proposed change orders awaiting approval (PM/admin only). Header: count
+ total amount. Expanded controls: project `<select>`, age buttons
`["All","7+ days","14+ days"]`, sort `<select>`
`["Oldest first","Newest first","Amount ↓","Amount ↑"]`. Age =
`floor((now - proposed_date)/86_400_000)`. Filter:
```ts
if (ageFilter === "7+ days"  && age < 7)  return false;
if (ageFilter === "14+ days" && age < 14) return false;
```
Each row `Link` → `/projects/{project_id}`. Age-coded dot/label: **>=14d red**,
**>=7d amber**, else muted. Shows `co_number`, `usd(amount)`, description,
`{age}d ago` / "Today".

### 7.6 `RecentBills` (`recent-bills.tsx`) — `"use client"`
AppFolio transactions table. Time-range `<select>`:
`Last 24 hours/3 days/week/30 days/90 days` (days 1/3/7/30/90; default **7**).
`cutoff` = today − days. Expanded adds vendor search, project `<select>`, and
status buttons `["All","Paid","Unpaid","Partial"]`. Sorted by `bill_date` desc.
Columns: Date, Project (link), Vendor (link `/vendors/{name}`), Cost Category
(`code name`, or italic "Unmatched" when no code), Amount (`paid+unpaid`),
Status pill (`Paid`→green, `Unpaid`→yellow, else blue). Non-expanded table
`max-h-72` scrollable. Summary shows count + total.

### 7.7 `ProjectGrid` (`project-grid.tsx`) — `"use client"`
Card grid (`sm:grid-cols-2 xl:grid-cols-3`). Filter tabs
`all/active/on_hold/completed` with per-status counts; active tab `bg-primary
text-primary-foreground`. Each card `Link` → `/projects/{id}`. Card header: a
project image (`next/image fill`) or a **monogram** box colored by hashing the
code:
```ts
const MONOGRAM_PALETTES = ["bg-blue-100 text-blue-700","bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700","bg-amber-100 text-amber-700","bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700"];
function monogramStyle(code){ const sum = code.split("").reduce((a,c)=>a+c.charCodeAt(0),0); return MONOGRAM_PALETTES[sum % 6]; }
```
showing `code.slice(0,4)`. Name + code (+ gate name) + status pill
(`STATUS_BADGE`: active green / on_hold yellow / completed blue / archived gray).
**`BudgetBar`** — spend/budget progress; thresholds: `>=0.95` red, `>=0.8`
amber, else emerald; "No budget entered" when budget `<=0`. Width = clamped
percent.

### 7.8 `SyncStatusBanner` (`sync-status-banner.tsx`) — server component
Props `{ sync: SyncStatus | null }`. (Defined but not rendered by the current
`page.tsx`.) Shows AppFolio sync state: null → dashed "No AppFolio sync recorded
yet" + "Sync now →". Otherwise color/icon by status: `running`
(blue, spinning `Loader2`, "Sync in progress…"), `failed` (destructive,
`XCircle`, error message, "Retry sync →"), `completed` (emerald `CheckCircle2`,
"Completed {relative} · {n} records", "Manage →"). `fmtRelative` →
just now / Xm / Xh / Xd ago. Links to `/admin/appfolio`.

### 7.9 `DashboardChatInput` (`dashboard-chat-input.tsx`) — `"use client"`
The inline AI prompt on the dashboard. `Sparkles` "AI ASSISTANT" label, an input
with a primary arrow send button, and 3 suggestion chips
("Summarize my active projects", "What are the pending change orders?",
"Show unpaid bills this month"). Submitting (Enter / arrow / chip) dispatches:
```ts
window.dispatchEvent(new CustomEvent("open-ai-chat", { detail: query }));
```
which `AiChatWidget` (section 6.2) catches to open the panel and run the query.

---

## 8. `lib/help.ts` — page-level help content

`export const HELP: Record<string, PageHelpContent>` keyed by page slug,
consumed by `<Header helpContent={HELP.<key>} />` and surfaced through
`PageHelp` (section 6.5). Keys present: `dashboard`, `projects`, `projectDetail`,
`drawDetail`, `contractDetail`, `gateDetail`, `reports`, `pcmReport`,
`costDetail`, `vendorDetail`, `gateDetailReport`, `changeOrderLog`,
`commitmentDetail`, `balanceSheet`, `trialBalance`, `reportingPackage`,
`adminIndex`, `adminUsers`, `costCategories`, `vendors`, `vendorProfile`,
`auditLog`, `appfolio`.

Each entry follows `PageHelpContent`: a `title`, a `description`, usually an
`actions[]` array (`{label, desc}`), optionally `sections[]`
(`{heading, body}` — `body` may contain `\n` for multi-line rendering), and a
`tip`. Representative sample:

```ts
dashboard: {
  title: "Dashboard",
  description: "Your real-time overview of all projects. See portfolio-level stats at a glance, then drill into any project for detail.",
  actions: [
    { label: "Stats bar", desc: "Active projects, portfolio budget, total deployed costs, and pending change orders…" },
    { label: "Project cards", desc: "Each card shows budget consumption. Green = under budget, amber = over 90%, red = over…" },
    { label: "Recent Bills", desc: "Last 90 days of AppFolio transactions…" },
    { label: "Pending COs", desc: "Change orders awaiting approval… grey = recent, amber = 14+ days, red = 30+ days…" },
    { label: "AI chat bar", desc: "Type any question… Press Enter or click the arrow to send…" },
    { label: "COI Alerts card", desc: "Lists all Certificates of Insurance expiring within 60 days…" },
    { label: "Budget Alerts card", desc: "Shows cost categories that have exceeded their gate budget…" },
  ],
  tip: "The dashboard updates every time the page loads. AppFolio data reflects the most recent sync…",
},
```

`pcmReport`, `contractDetail`, `changeOrderLog`, `adminUsers`, and `appfolio`
additionally use `sections[]` (e.g. the PCM "Column Reference" =
`A=Original Budget · B=Authorized Adj. · C=Current Budget (A+B) · … ·
M=Balance to Complete (C−L)`). The full set of entries is exhaustive
documentation for every page and is the single source of truth for the help
panels — recreate each key with the same `title/description/actions/sections/
tip` shape.

---

## Summary

The design system is a light terracotta-on-cream theme defined entirely as HSL
CSS custom properties (`--primary` terracotta `#C4552D`, `--foreground`/sidebar
charcoal `#141414`, full `--sidebar-*` and `--status-*` token sets), plus the
`.kiln-table` branded-header component classes and an extensive `@media print`
block (landscape, dark headers, a fixed 15-column `#pcm-report` layout).
`DashboardShell` composes a desktop sidebar, an event-driven mobile drawer, and
the main content, and mounts the always-on `ActivityTracker`, `QuickStartTrigger`,
`AiChatWidget`, and `ConfirmDestructiveProvider`; shadcn primitives wrap Radix
with `cva` variants and the `KilnLockup`/`KilnMark` brand SVG renders the
wordmark. Dashboard widgets are client components driven by RSC-computed data —
over-budget alerts (overage > 0, $5K/$10K filters), 60-day COI/lien-waiver expiry
alerts, age-coded pending COs, recent bills, and budget-bar project cards — with
help content centralized in `lib/help.ts` surfaced via `PageHelp`.

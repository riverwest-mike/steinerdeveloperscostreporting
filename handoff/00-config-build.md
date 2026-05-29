# 00 — Config & Build (verbatim)

> Every project config file copied exactly, plus env vars and build/run steps.
> The rest of the reconstruction spec lives in the sibling files:
> `01-database.md`, `02-reports.md`, `03-projects-workflows.md`,
> `04-admin-auth.md`, `05-components-ui.md`, `06-api-extraction.md`, and the
> top-level `KILN_TOOLBOX_HANDOFF.md` (overview + AppFolio + auth).

App: **KILN** ("Where projects take shape." — by RiverWest). Package name `kiln`.

---

## package.json
```json
{
  "name": "kiln",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@clerk/nextjs": "^6.12.0",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-toast": "^1.2.6",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.49.1",
    "@types/pg": "^8.18.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.475.0",
    "next": "14.2.29",
    "pg": "^8.20.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "svix": "^1.57.0",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^20.17.24",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.1",
    "eslint-config-next": "14.2.29",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3"
  }
}
```
> No `engines` pin; build with **Node 20+**. README says "Next.js 15" but the
> pin is **14.2.29** — 14 is authoritative.

---

## next.config.mjs
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable client-side router cache so pages always re-fetch when navigated to.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        // Supabase storage — project cover images
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
```

---

## vercel.json
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ] && exit 0 || exit 1",
  "crons": [
    {
      "path": "/api/cron/daily-sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```
> `ignoreCommand` makes Vercel **build only on `main`** — feature branches get no
> preview deploy. The single cron hits `/api/cron/daily-sync` at 06:00 UTC.

---

## tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
> Path alias `@/* → ./*` is used everywhere (e.g. `@/lib/...`, `@/components/...`).

---

## tailwind.config.ts
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```
> All color values are CSS variables defined in `app/globals.css` (see `05-components-ui.md`).

---

## postcss.config.mjs
```js
/** @type {import('postcss').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

---

## components.json (shadcn/ui)
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## middleware.ts (Clerk auth + userId header injection)
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/not-invited(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
    // Forward the verified userId as a request header so server components can
    // read it via next/headers (works around unreliable Clerk header propagation
    // in Vercel Edge → Node.js with @clerk/nextjs v6.39+).
    const requestHeaders = new Headers(req.headers);
    requestHeaders.delete("x-clerk-user-id"); // strip any client-supplied value
    requestHeaders.set("x-clerk-user-id", userId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```
> **Key architectural contract:** every server component / API route reads the
> authenticated user via the `x-clerk-user-id` request header, NOT directly from
> Clerk in most places. Reproduce this exactly or the whole auth/data flow breaks.

---

## app/layout.tsx (root)
```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "KILN — Where projects take shape.",
  description: "KILN is the financial control system for real estate development. Control commitments. Forecast exposure. Approve with confidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```
> Brand display face is **Söhne Heavy** (commercial license required); Inter is the
> stand-in until the foundry license is in place.

---

## lib/supabase/server.ts (verbatim — the two client factories)
```ts
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/** RLS-aware client authenticated with the Clerk JWT (template "supabase"). */
export async function createClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  let supabaseToken: string | null = null;
  try {
    supabaseToken = await getToken({ template: "supabase" });
  } catch (err) {
    console.error("[supabase/server] getToken failed:", err);
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : {} },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Component — cookie writes ignored */ }
        },
      },
    }
  );
}

/** Service-role client — BYPASSES RLS. Use only in trusted server contexts. */
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

## lib/supabase/client.ts
```ts
import { createBrowserClient } from "@supabase/ssr";
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

## lib/access.ts (project scoping)
```ts
import { createAdminClient } from "./supabase/server";

/** null = admin/accounting/development_lead (all projects); string[] = scoped IDs. */
export async function getAccessibleProjectIds(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string | null
): Promise<string[] | null> {
  if (!userId) return null;
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  const role = (data as { role?: string } | null)?.role;
  if (!role || role === "admin" || role === "accounting" || role === "development_lead") return null;
  const { data: access } = await supabase.from("project_users").select("project_id").eq("user_id", userId);
  return (access ?? []).map((a: { project_id: string }) => a.project_id);
}
```

---

## Environment variables (complete)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                     # direct Postgres (pg pool) — some report pages + apply-migrations
SUPABASE_ACCESS_TOKEN=            # used by apply-migrations tooling

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=             # svix verification for /api/webhooks/clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# AppFolio  (code reads APPFOLIO_DATABASE_URL — README's APPFOLIO_BASE_URL is wrong)
APPFOLIO_CLIENT_ID=
APPFOLIO_CLIENT_SECRET=
APPFOLIO_DATABASE_URL=            # e.g. your-company.appfolio.com

# Anthropic (chat + document extraction)
ANTHROPIC_API_KEY=                # SDK reads this from env automatically

# Misc
CRON_SECRET=                      # protects GET /api/cron/daily-sync (Bearer)
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=  # address-autocomplete + project map tab
```

---

## .gitignore (essentials)
Standard Next.js ignore: `/node_modules`, `/.next/`, `/out/`, `/build`, `.env*.local`,
`.env`, `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`, `.DS_Store`, `*.pem`, debug logs.

---

## Build / run
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # PRODUCTION build (see deploy policy)
npm run start
npm run lint
```

### Deploy policy (from CLAUDE.md — reproduce intentionally)
- Vercel preview deploys are **disabled on every branch except `main`** (via the
  `vercel.json` `ignoreCommand`). Feature branches push for review only — no preview URL.
- Every build that runs is a **production build that ships to users** → keep
  `dependencies` tight (they ship in the serverless bundle), avoid heavy top-level
  work in `app/` files, reuse the existing cron/webhook routes.

### Stand-up order
1. Create Supabase project; run `01-database.md` schema → RLS → migrations in order.
2. Configure Clerk app + the **`supabase` JWT template** (HS256, signed with the
   Supabase JWT secret — see `01-database.md` / clerk-jwt-setup).
3. Set all env vars (above) in Vercel + local `.env.local`.
4. Point the Clerk webhook at `/api/webhooks/clerk` (events: user.created/updated/deleted,
   session.created) with `CLERK_WEBHOOK_SECRET`.
5. Set AppFolio creds; link each project's `appfolio_property_id` (see overview §9.6).
6. Deploy to `main`; the daily cron starts syncing.

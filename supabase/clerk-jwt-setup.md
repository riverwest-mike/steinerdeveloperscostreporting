# Clerk + Supabase JWT Integration Setup

Follow these steps exactly after the schema and RLS are applied.

## Step 1 — Get your Supabase JWT Secret

1. Go to: Supabase Dashboard → your project → Settings → API
2. Find **JWT Settings** → copy the **JWT Secret** value
   (it looks like a long random string starting with `super-secret-jwt-token...`)

## Step 2 — Create the JWT Template in Clerk

1. Go to: Clerk Dashboard → your application → **JWT Templates**
2. Click **New template** → choose **Supabase** (pre-built template)
3. If "Supabase" preset is not listed, choose **Blank** and configure manually:
   - **Name**: `supabase` (must be exactly this — the app calls `getToken({ template: 'supabase' })`)
   - **Signing algorithm**: `HS256`
   - **Signing key**: paste the Supabase JWT Secret from Step 1
   - **Claims** (JSON body):
     ```json
     {
       "sub": "{{user.id}}",
       "role": "authenticated",
       "iss": "https://clerk.dev",
       "iat": "{{date.now}}",
       "exp": "{{date.now_plus_5_minutes}}"
     }
     ```
4. Click **Save**

## Step 3 — Set up the Clerk Webhook

The webhook syncs Clerk users to the Supabase `users` table automatically.

1. Go to: Clerk Dashboard → your application → **Webhooks**
2. Click **Add Endpoint**
3. **Endpoint URL**: `https://your-vercel-domain.vercel.app/api/webhooks/clerk`
   - For local testing use: `https://your-ngrok-url/api/webhooks/clerk`
4. **Events to subscribe**: check these boxes:
   - `user.created`
   - `user.updated`
   - `user.deleted`
5. Click **Create**
6. Copy the **Signing Secret** (starts with `whsec_...`)
7. Add it to your `.env.local`:
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   ```
   And add to Vercel environment variables as well.

## Step 4 — Assign Your First Admin Role

After signing up for the first time through the app:

1. Go to Clerk Dashboard → your application → **Users**
2. Click your user → **Public Metadata**
3. Set:
   ```json
   { "role": "admin" }
   ```
4. This will trigger a `user.updated` webhook, which writes `role = 'admin'`
   to the Supabase `users` table.

**Until this is done, your user will default to `read_only` in the app.**

## How it works

- When you sign in, Clerk generates a JWT signed with the Supabase JWT secret
- Your app calls `getToken({ template: 'supabase' })` to get this JWT
- The JWT is attached as `Authorization: Bearer <token>` on every Supabase request
- Supabase verifies the JWT, extracts `auth.uid()` from the `sub` claim
- RLS policies use `auth.uid()` to check `users.role` and `project_users`

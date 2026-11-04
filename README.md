# Cybervex Digital · Invoice Generator

A standalone, local-first invoice generator for Cybervex Digital. It is fully independent of
the older `Invoice Generator - Cybervex` project: separate folder, dependencies and browser
storage keys, and no shared database.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # calculation, numbering and status unit tests
npm run build    # static build in dist/ (works from any folder or sub-path)
```

## Workflow

- **Invoices**: dashboard with outstanding/overdue totals (per currency), search and status filters.
- **New invoice / editor**: live A4 preview. Use *Save draft*, then *Issue invoice* once it's complete.
- **Download PDF**: vector A4 PDF with selectable text (Inter font, embedded).
- **Print**: prints only the invoice, on A4, with no app controls.
- **More**: *Duplicate*, *Return to draft* (only if no payments), *Void*, *Delete draft*.
- **Settings**: business profile, bank/payment details, number prefix, default currency/terms/taxes,
  logo variant, and backup export/import.

## Business rules

- An invoice lists its **services** (as bullets) and one **overall budget** for all of them.
  Invoices saved before this change are upgraded automatically: their line items become services, and
  their exact item total becomes the budget.
- Money is calculated in integer minor units. Each figure is rounded once (half away from zero), in
  the order printed: budget → discount → tax on the discounted amount → untaxed additional charges →
  total → payments → balance.
- Tax is never assumed. Add taxes per invoice, or as defaults in Settings.
- Status is derived: **Draft**, **Awaiting payment**, **Partially paid**, **Overdue**, **Paid**, **Void**.
  "Paid" only comes from recorded payments (with explicit confirmation) that cover the total. The app
  records payments; it does not process them.
- Invoice numbers (`CVD-YYYY-0001`) are generated automatically. Duplicates are blocked, and numbers
  from deleted drafts are never reused.
- Legal name, address, email, tax IDs and bank details are left blank on purpose. Until they're filled
  in they print as grey `[placeholders]`, and an invoice can't be issued while required ones are missing.

## Data & privacy

Without cloud sync, invoices are stored only in this browser's `localStorage` (keys prefixed
`cybervex-invoice:v1:`). Clearing browser data deletes them, so use **Settings → Export backup**
regularly and store the file securely.

## Cloud sync (Supabase)

With Supabase configured, users sign in and their invoices and settings sync across devices.
The browser copy stays the working copy (instant, works offline); every change is queued and
uploaded, and the latest data is downloaded on sign-in and when the tab regains focus.
The first sign-in on a browser uploads the invoices already stored there.

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and run it.
   It creates the `cybervex_invoices` and `cybervex_settings` tables with Row Level Security, so each account only
   sees its own data.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up".
   Then **Authentication → Users → Add user** to create each login (email + password, auto-confirm).
4. **Project Settings → API**: copy the Project URL and the `anon` public key into `.env`
   (see `.env.example`) and into your host's environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), then redeploy.
   Never use the `service_role` key in this app.

Leave the variables empty to run local-only.

## Assets

- `public/brand/cybervex-logo-silver.png`: the official logo from the company website project, trimmed.
- `public/brand/cybervex-logo-black.png`: the same artwork with its colour set to black (alpha
  preserved), used for the monochrome invoice.
- `public/fonts/Inter-*.ttf`: Inter 4.1 (SIL Open Font License, see `Inter-LICENSE.txt`).

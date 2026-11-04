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

Invoices are stored only in this browser's `localStorage` (keys prefixed `cybervex-invoice:v1:`).
Nothing is sent to a server, and there are no API keys. Clearing browser data deletes the invoices,
so use **Settings → Export backup** regularly and store the file securely.

## Assets

- `public/brand/cybervex-logo-silver.png`: the official logo from the company website project, trimmed.
- `public/brand/cybervex-logo-black.png`: the same artwork with its colour set to black (alpha
  preserved), used for the monochrome invoice.
- `public/fonts/Inter-*.ttf`: Inter 4.1 (SIL Open Font License, see `Inter-LICENSE.txt`).

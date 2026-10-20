Project: "Data Uploader", a small Next.js 15 (App Router, TypeScript, Tailwind) app run
with Bun. Users from Sales and Marketing download a CSV template, fill it in, upload
it, and the app VALIDATES the file and FORWARDS it unchanged to a Databricks Unity
Catalog Volume using the Databricks Files API. A pipeline already inside Databricks
processes the files.

Scope rules (strict):

- The app never edits, cleans, converts, or re-encodes an uploaded file. It validates
  it and forwards the exact bytes.
- No tables, no SQL, no SQL Warehouse. Only the Databricks Files API for Volumes.
- Databricks settings (workspace URL, token, volume location) are configured in the
  app's Settings page, never in .env, and never hardcoded in code or tests.
- Secrets never leave the server. The browser only sees masked values.
- Validation rules live in data (a config per template), not scattered in components.
  Adding a new template must mean adding one config entry.

Tooling rules:

- Use Bun for everything: bun install, bun add, bun run dev, bun run build,
  bun test. Do not create package-lock.json, yarn.lock, or pnpm-lock.yaml.
- Keep dependencies minimal. Allowed beyond the Next.js starter: zod, papaparse
  (and @types/papaparse), lucide-react. Ask before adding anything else.

Code style (strict):

- Never write code comments of any kind (no //, no /\* \*/, no JSDoc, no JSX comments).
  Remove existing ones from any file you touch.
- Natural, idiomatic code: clear names, small functions, early returns, no
  boilerplate, no narrating console.log, no emoji, no TODO placeholders.
- All user-facing text in Indonesian.

Design rules: minimalist and modern. One fixed light theme. Background #fafafa, white
surfaces, zinc text, hairline zinc-200 borders, a single indigo-600 accent. Font Geist
or Inter. No gradients, no shadows beyond a faint one, no colored icon squares, no
decorative animation. Generous whitespace, content centered at max-w-3xl.

Workflow: work one step at a time. After each step, run bun run build, bun run lint,
and bun test, then summarize what you built and how to run it. Then STOP and wait for
my approval.

Reply only with "Siap" and wait for Step 1.

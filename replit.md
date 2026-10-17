# Agilence Queue

A simple, shared clinic queue for small local clinics in India. Reception can check in walk-in patients, and doctors can call, complete, or cancel visits while both views update live.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/agilence-queue run dev` — run the clinic queue web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts --name <name>` — generate a versioned SQL migration from the Drizzle schema
- `pnpm --filter @workspace/db run check` — validate the migration chain
- `pnpm --filter @workspace/db run migrate` — apply pending migrations to the database in `DATABASE_URL`
- Required env: `DATABASE_URL`, `CLINIC_OWNER_EMAIL`, and Replit-managed Clerk keys

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/agilence-queue/src/` — receptionist and doctor dashboard
- `artifacts/api-server/src/routes/queue.ts` — queue API and live event stream
- `artifacts/api-server/src/routes/auth.ts` — current clinic member and owner-managed staff access
- `artifacts/api-server/src/middlewares/clinicAuthorization.ts` — Clerk session verification and server-side roles
- `lib/api-spec/openapi.yaml` — API contract
- `lib/db/src/schema/clinic-queue.ts` — clinic, role, doctor, patient, queue, and consultation tables

## Architecture decisions

- PostgreSQL is the shared source of truth; server-sent events notify connected dashboards, which then reload the queue snapshot.
- Queue numbers are daily and use the clinic's India time zone.
- The MVP has one demo clinic and one shared queue. The schema keeps clinic users and doctor assignment separate so multiple staff and doctor-specific queues can be added later.
- The Drizzle schema and `lib/db/migrations/` are version-controlled. Apply changes with generated migrations; never use schema push/force against an existing database.
- Clerk handles sign-in; clinic membership and roles are stored in PostgreSQL and enforced by the API.
- The first admin role is pre-authorized by `CLINIC_OWNER_EMAIL` and is attached only after that user verifies the matching email with Clerk. Never allow arbitrary sign-ups to claim the owner role.
- Admin can use both reception and doctor queue actions and grant receptionist/doctor access by email. Staff must sign up with the same verified email before they can view the clinic.
- Receptionists can view/add/cancel queue entries; doctors can view/call/complete/cancel. The API remains the authority for these permissions.

## Product

- Add a walk-in patient with a name, optional phone number, and short reason for visit.
- View each patient's queue number and status: Waiting, With doctor, Completed, or Cancelled.
- Call the next patient, complete consultations, or cancel/skip a visit.
- View waiting count, current queue state, completed consultations, and average wait.
- Demo data is seeded for immediate testing.

## User preferences

- Keep the product fast and simple for clinic reception staff; collect only the minimum visit details needed for the queue.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
- SSE updates are broadcast within the API server process; the current MVP uses one API server instance.
- VPS update order: `git pull`, install dependencies, run `pnpm --filter @workspace/db run migrate` with the VPS `DATABASE_URL`, build, then restart the app.
- Migrations are additive and data-preserving. They use `ADD COLUMN IF NOT EXISTS` for ClinicQ fields that may already exist on the VPS.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

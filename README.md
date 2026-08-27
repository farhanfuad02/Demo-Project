# Hungry_JU

Campus food ordering and peer delivery for Jahangirnagar University. Students order from
the Bot Tola vendor cluster; other students deliver it and keep the delivery fee.

A working full-stack application: an Express REST API and a Next.js client, both written
in MVC with OOP throughout, covered by 571 tests, and runnable with two commands.

## Quick start

```bash
npm install
npm run seed     # demo accounts, two shops, eleven dishes
npm run dev      # API on :4000, web client on :3000
```

Open <http://localhost:3000>. Every demo account signs in with the password
`Hungry@JU1`:

| Role                 | E-mail                     | What it shows                        |
| -------------------- | -------------------------- | ------------------------------------ |
| Student              | `farhan@juniv.edu`         | Browse, cart, checkout, tracking     |
| Student (delivering) | `rahim@juniv.edu`          | Deliver mode is already on           |
| Vendor               | `shihab.vendor@juniv.edu`  | Order board, menu, analytics         |
| Vendor               | `sanjida.vendor@juniv.edu` | A second shop                        |
| Admin                | `admin@juniv.edu`          | Approvals, users, disputes, settings |

### Seeing the whole flow

Sign in as the student in one browser and the vendor in another (a private window works):

1. **Student** — pick a shop, add a dish, place the order. Write down the four-digit PIN;
   it is shown once.
2. **Vendor** — accept it, start preparing, then mark it ready for pickup.
3. **Student `rahim`** — open Deliver, accept the job, mark heading-to-shop and picked-up,
   then enter the customer's PIN to complete it.
4. **Student** — the tracking page follows along on its own, and the rating form appears
   once it arrives.

No mail provider is configured in development, so verification and reset links come back
in the response and are shown on screen instead of being e-mailed.

## Layout

```
packages/shared/     enums, constants, and JSDoc types shared by both apps
apps/api/            Express REST API
  src/models/          domain entities that own their invariants
  src/repositories/    data access; row ⇄ model mapping
  src/services/        business rules and orchestration
  src/controllers/     HTTP entry; the only layer touching req/res
  src/routes/          one router class per URL family
  src/middleware/      auth, RBAC, validation, rate limit, errors, logging
  src/config/          env, DI container, storage engine, seeder
apps/web/            Next.js client
  src/app/             routing only — no state, no fetching
  src/views/           screens, layout, and presentational components
  src/controllers/     observable state, API calls, no JSX
  src/models/          read models over API payloads
  src/services/        HttpClient and the ApiClient gateways
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layer rules, the OOP decisions
and why each was made, the concurrency guarantee, and the security model.

## Scripts

| Script                  | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | API and web client together, with reload     |
| `npm run dev:api`       | API only, on port 4000                       |
| `npm run dev:web`       | Web client only, on port 3000                |
| `npm run seed`          | Write the demo dataset (`--force` to reseed) |
| `npm test`              | The whole suite                              |
| `npm run test:coverage` | The suite plus a coverage report             |
| `npm run lint`          | ESLint, including the JSDoc rules            |
| `npm run format`        | Prettier write — run before pushing          |
| `npm run format:check`  | Prettier check, as CI runs it                |
| `npm run build`         | Production build of the web client           |
| `npm start`             | Both apps in production mode                 |

## Configuration

Copy `.env.example` to `apps/api/.env`. Everything has a working development default, so
the app runs before you fill anything in. In production the API refuses to start without
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

## Storage

Data lives in `apps/api/data/hungry-ju.json`, read into memory at boot and written back
after each change. This is deliberate: the project has no managed database and a zero
budget, and a demo that needs a running PostgreSQL first is a demo that fails on the
examiner's laptop. Every repository talks to an abstract `Database`, so Phase 2 swaps the
engine by adding one subclass.

Delete the file and run `npm run seed` to start over.

## Testing

```bash
npm test
```

571 tests: value objects, models, state machines, repositories, services, middleware, the
full HTTP surface through `supertest`, and the client's models and controllers. No module
mocking — every class takes its collaborators through its constructor, so a fake is
enough.

Business rules are tested as rules, not as code paths: BR-03 (one cart, one vendor),
BR-04 (the cancellation window closes when cooking starts), BR-06 (nobody delivers their
own order), BR-08 (one rating per order per target), BR-10 (only the customer's PIN
closes a delivery), BR-11 (an unanswered order auto-cancels), and FR-D3 — that of many
riders accepting at the same instant, exactly one wins.

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and push to `main`: lint and format,
the full suite with coverage, then a production build and a health check against a booted
API. `.github/workflows/cd.yml` chains on a successful CI run, packages a release bundle,
and deploys through a protected `production` environment — so a deploy can never outrun
its own tests. The deployment step is a placeholder for the host's own command; no
credential lives in the workflow.

## Conventions

kebab-case files, PascalCase classes and components, camelCase members,
UPPER_SNAKE_CASE constants, two-space indent, 100-column lines, Prettier before pushing,
feature branches only, and commits as `feat:` / `fix:` / `docs:` / `refactor:` / `test:`.
JSDoc is mandatory and enforced by ESLint.

## Team

Md. Shihab Hossen · Farhan Fuad · Sanjida Akter Akhi

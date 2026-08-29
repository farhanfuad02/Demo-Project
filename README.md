# Hungry_JU

Campus food ordering and peer delivery for Jahangirnagar University. Students order from
the Bot Tola vendor cluster; other students deliver it and keep the delivery fee.

A working full-stack application: an Express REST API and a Next.js client, both written
in MVC with OOP throughout, covered by 687 tests, and runnable with two commands.

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
| Vendor               | `shihab.vendor@juniv.edu`  | Bot Tola Bhorta Ghor — orders, menu  |
| Vendor               | `sanjida.vendor@juniv.edu` | Akhi Fast Food                       |
| Vendor               | `tanvir.vendor@juniv.edu`  | JU Cha Adda                          |
| Vendor               | `rezaul.vendor@juniv.edu`  | Bot Tola Biriyani House              |
| Vendor               | `mitu.vendor@juniv.edu`    | Mitu Pitha Ghor                      |
| Vendor               | `jubayer.vendor@juniv.edu` | Campus Juice Bar, seeded closed      |
| Admin                | `admin@juniv.edu`          | Approvals, users, disputes, settings |

The seed writes six approved shops and 36 menu items; a few items are marked sold out and
one shop is closed, so the browse list shows both states. Re-running `npm run seed` on a
database that already has data does nothing — run `node src/config/database/seed.js --force`
from `apps/api` to top it up with anything new without disturbing existing orders.

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

### Halls

JU's residence halls are gender-segregated, so a hall is not free text: a student states a
gender and then picks from that gender's list. Both lists live in
`packages/shared/src/halls/index.js`, which is read by the API's validators and by the
client's dropdown, so the halls a student is offered and the halls the server accepts are
the same list by construction.

| Gender | Halls                                                 |
| ------ | ----------------------------------------------------- |
| Male   | SRJ, SSB, SBF, MBH, RTH, KUH, KNH, STUH, NSH, MH, ABH |
| Female | RH, TBH, NFH, SFH, SKH, PRH, JIH, J24H, BKZH, FZH     |

The code is the stored value — it is what students say and write, and it stays valid if a
hall later gains a longer display name. The rule is enforced at every point a hall can be
set: registration, the profile screen, and the delivery address at checkout, which may
name a different hall for one order without saving it. A student with no gender on file is
asked for that first rather than shown an empty dropdown.

Changing gender clears a hall that belongs to the other list rather than refusing the
change — otherwise a student who picked the wrong gender at sign-up could never fix
either field.

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

| Variable          | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `MONGODB_URI`     | Run on MongoDB. Unset, the API runs on the JSON file.           |
| `MONGODB_DB_NAME` | Database inside that server; blank means the one the URI names. |
| `DATABASE_DRIVER` | `json` or `mongodb`, to override the choice above.              |

## Storage

The API runs on either of two engines, and nothing above the storage layer knows which.
Every repository talks to an abstract `Database`; each engine is one subclass of it.

| Engine    | Selected by           | What it is for                           |
| --------- | --------------------- | ---------------------------------------- |
| JSON file | the default           | offline demos, the test suite, no set-up |
| MongoDB   | setting `MONGODB_URI` | real deployments and shared data         |

**JSON file.** Data lives in `apps/api/data/hungry-ju.json`, read into memory at boot and
written back after each change. This stays the default on purpose: a demo that needs a
running database server before it will start is a demo that fails on the examiner's
laptop. Delete the file and run `npm run seed` to start over.

**MongoDB.** Point `MONGODB_URI` at a server and the same API runs against it — no code
change, no different seed, no separate build:

```bash
# in apps/api/.env
MONGODB_URI=mongodb://127.0.0.1:27017/hungry_ju
```

```bash
docker compose up -d mongo   # a local single-node replica set on :27017
npm run seed
npm run dev
```

An Atlas cluster works the same way; paste its `mongodb+srv://` URI instead. The API logs
which engine it booted on, so there is never a question of which one is live:

```
Database ready  driver=mongodb database=hungry_ju transactions=enabled
```

Collections and indexes are created at boot from `src/config/database/mongo-indexes.js`.
Some of those indexes are there for speed; the unique ones are there for correctness —
one account per e-mail, one cart per student, one delivery per order, and one rating per
order per target (BR-08) are stated in the database and not only in the services, so two
simultaneous requests cannot slip a duplicate past the check.

Multi-document transactions need a replica set — that is a MongoDB rule, not ours, and it
is why the compose file starts one rather than a bare `mongod`. Against a standalone
server the API still runs and says `transactions=unavailable` at boot; each individual
write stays atomic, but a failure part-way through checkout can leave an order without
its lines. Deploy against a replica set or Atlas.

Delivery assignment does not depend on any of that. `updateWhere` compiles to a single
`findOneAndUpdate`, which the server applies atomically, so of several riders accepting at
the same instant exactly one wins (FR-D3) on every deployment.

## Testing

```bash
npm test
```

687 tests: value objects, models, state machines, repositories, services, middleware, the
full HTTP surface through `supertest`, and the client's models and controllers. No module
mocking — every class takes its collaborators through its constructor, so a fake is
enough.

Business rules are tested as rules, not as code paths: BR-03 (one cart, one vendor),
BR-04 (the cancellation window closes when cooking starts), BR-06 (nobody delivers their
own order), BR-08 (one rating per order per target), BR-10 (only the customer's PIN
closes a delivery), BR-11 (an unanswered order auto-cancels), and FR-D3 — that of many
riders accepting at the same instant, exactly one wins.

Most of the suite runs on the in-process store, which needs nothing installed. The MongoDB
engine is the exception: `tests/integration/mongo-database.test.js` starts a real one-node
replica set and runs both the storage contract and the whole ordering flow over HTTP
against it, with every repository, service, and controller unchanged. The server binary is
downloaded on first run and cached; if it cannot start, that file skips and the rest of
the suite still runs.

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and push to `main`: lint and format,
the full suite with coverage, then a production build and a health check against a booted
API. `.github/workflows/cd.yml` chains on a successful CI run, packages a release bundle,
and deploys through a protected `production` environment — so a deploy can never outrun
its own tests. The deployment step is a placeholder for the host's own command; no
credential lives in the workflow.

## GitHub Pages preview

`.github/workflows/deploy-pages.yml` publishes a static export of the web client to
GitHub Pages on every push to `main`. Enable it once under **Settings -> Pages ->
Source -> GitHub Actions**; the site then lands at
`https://<owner>.github.io/<repo>/`.

**It is a UI preview, not a working app.** Pages serves files; it does not run Node.js,
so the Express API in `apps/api` is not deployed alongside it. Sign in, shops, cart,
orders, delivery, and the admin screens all call the API and will show their error state.
The static build differs from `npm run dev` in three ways, all forced by having no server:

| Feature           | Dev                        | Static export                           |
| ----------------- | -------------------------- | --------------------------------------- |
| `/api/*`          | rewritten to the API       | no rewrite; needs an absolute origin    |
| `/shops/[shopId]` | any id, rendered on demand | only the prerendered placeholder exists |
| `next/image`      | optimised                  | `unoptimized`                           |

To give the preview a real backend, host `apps/api` somewhere that runs Node, add the
API's origin to its `CORS_ORIGINS`, and set the repository variable `API_BASE_URL`
(**Settings -> Secrets and variables -> Actions -> Variables**) to that origin's `/api`
path. The workflow passes it through as `NEXT_PUBLIC_API_BASE_URL`.

Building the export locally:

```bash
cd apps/web
NEXT_OUTPUT=export NEXT_BASE_PATH=/<repo> npm run build   # writes apps/web/out
```

## Conventions

kebab-case files, PascalCase classes and components, camelCase members,
UPPER_SNAKE_CASE constants, two-space indent, 100-column lines, Prettier before pushing,
feature branches only, and commits as `feat:` / `fix:` / `docs:` / `refactor:` / `test:`.
JSDoc is mandatory and enforced by ESLint.

## Team

Md. Shihab Hossen · Farhan Fuad · Sanjida Akter Akhi

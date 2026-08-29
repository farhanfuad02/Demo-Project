# Hungry_JU — Architecture

An npm-workspaces monorepo holding two applications and one shared package. Both
applications follow MVC; both are written in classes with constructor injection; neither
reaches for a global.

```
hungry-ju/
├── packages/shared/     enums, constants, and JSDoc types used by both apps
├── apps/api/            Express REST API
└── apps/web/            Next.js client
```

The two apps talk over HTTP only. The browser always calls a same-origin `/api/*` path,
which `next.config.mjs` rewrites to the Express service — so the refresh cookie stays
same-site, no CORS credential dance is needed, and the API origin is a deployment detail
the client bundle never learns.

---

## The API (`apps/api`)

```
Request
  │
  ▼  routes/           one router class per URL family; declares guards and handlers
  │
  ▼  middleware/       auth → RBAC → validation → rate limit  (then errors, last)
  │
  ▼  controllers/      parse, read the actor, delegate, shape the reply
  │
  ▼  services/         business rules, orchestration, notifications, audit
  │
  ▼  models/           domain entities that own their invariants
  │
  ▼  repositories/     row ⇄ model mapping
  │
  ▼  config/database/  the storage engine behind one abstract class
```

Each layer knows only the one below it. A controller never touches a repository; a model
never knows it is being persisted.

### Where the "M" lives

`models/` holds state and invariants. `repositories/` holds persistence. They are
separate because a model that also knew SQL could not be unit-tested without a database,
and NFR-12 asks for testable business rules. The split is what lets 651 tests run in
under ten seconds with no database process anywhere.

### Controllers vs services

The coding standard says "business logic in controllers". In practice controllers stay
thin — parse, authorize, delegate, respond — and the rules live in services. The reason
is concrete: BR-11's auto-cancel is reached from HTTP _and_ from the scheduler, and an
Express handler cannot be called from a timer. Controllers remain the only layer that
touches `req` and `res`.

### OOP decisions

| Decision                                                                                            | Why                                                                                                |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `User` abstract; `Student`, `Vendor`, `Admin` subclass it                                           | Role behaviour differs — landing route, permissions — while identity and credentials are shared    |
| `UserFactory` dispatches role → class                                                               | The abstract base cannot name its own subclasses without a circular import                         |
| Private `#fields` with getters everywhere                                                           | Encapsulation: a status moves through a method that checks the move, never through assignment      |
| `BaseModel` / `BaseRepository` / `BaseService` / `BaseController` / `BaseRouter` / `BaseMiddleware` | Abstraction: a shared contract, with the generic half implemented once                             |
| Constructor injection, wired by `Container`                                                         | Composition over inheritance, and the seam every unit test uses (SOLID: D)                         |
| `OrderStateMachine` / `DeliveryStateMachine` as transition tables                                   | The SRS calls the order status a state machine; writing it as one makes an illegal move impossible |
| `Money` value object over integer poisha                                                            | `0.1 + 0.2 !== 0.3`, and an order total that disagrees with its lines by a poisha is a dispute     |
| `QueryOptions` value object                                                                         | Clamps `?limit=1000000` in one place instead of in every list endpoint                             |
| `Cart` and `Order` as aggregates                                                                    | Lines are reached only through their root, so BR-03 cannot be bypassed by saving a line directly   |

### The order lifecycle

```
placed ──► accepted ──► preparing ──► ready ──► picked_up ──► delivered
   │           │
   ├──► rejected
   └──► cancelled ◄──┘
```

`cancelled` is reachable only from `placed` and `accepted` (BR-04); `rejected` only from
`placed`; the three end states have no successors. Encoded once, in
`models/order-state-machine.js`, and consulted by the entity before every status change.

The state machines live in `models/` rather than `services/` because they are domain
rules the entity itself enforces — a service that could bypass them would make the table
advisory.

### Concurrency (FR-D3, NFR-11)

`DeliveryRepository.claim` performs a conditional update: the write applies only while
the row still reads `available` with no rider. Two riders tapping Accept at the same
instant cannot both succeed; the loser receives `null`, and one layer up a
`ConflictError` → HTTP 409. This is covered by tests at three levels — the store, the
repository, and the service — because it is the requirement most expensive to get wrong.

### Storage

`Database` is abstract, and three classes implement it:

| Class              | What it is                                                  |
| ------------------ | ----------------------------------------------------------- |
| `InMemoryDatabase` | the whole contract, in process; what the test suite runs on |
| `JsonFileDatabase` | that, plus durability to a file; the offline default        |
| `MongoDatabase`    | a real server, selected by setting `MONGODB_URI`            |

The file store is still the default because the MVP has no managed database and a zero
budget (SRS §2.4), and a capstone demo that needs a running server is a demo that fails on
the examiner's laptop. Its reads and writes stay in memory — the file is only durability —
so response times are unaffected.

`MongoDatabase` is what the seam was built for, and adding it cost exactly what the design
promised: one subclass, one factory, and no change to any repository, service, or
controller. Three things had to be decided inside it, and all three are invisible above it:

- **Naming.** The application's key is `id` and MongoDB's is `_id`. `MongoMapper` renames
  in both directions, so a row read back from MongoDB is shaped exactly like one read back
  from the file. It also translates the criteria operators, including `$like`, which
  becomes a `$regex` over an _escaped_ fragment — the fragment comes from a search box, and
  unescaped, a user typing `.*` would match every row.
- **Atomicity.** `updateWhere` becomes one `findOneAndUpdate`, which the server applies
  indivisibly. That is a stronger guarantee than the in-process store can give, and it is
  what first-accept-wins delivery assignment rests on (FR-D3). `transaction()` uses a
  session, carried to each operation through an `AsyncLocalStorage` so that no repository
  has to accept and forward a session it has no business knowing about. MongoDB offers
  transactions only on a replica set; against a standalone server the callback runs
  directly and the API says so at boot, rather than refusing to start.
- **Invariants.** The unique indexes restate rules the services already enforce — one
  account per e-mail, one cart per student, one rating per order per target (BR-08) — in
  the one place two concurrent requests cannot step over them. A violation is translated
  into the same `ConflictError` the service raises, so losing that race is a 409 and not a 500.

Moving to PostgreSQL later is the same exercise a third time.

---

## The client (`apps/web`)

MVC again, with the same separation:

```
app/            routing only — resolves params, mounts a screen, holds no state
views/          React components: screens, layout, and presentational primitives
controllers/    classes that own state, call the API, and publish changes
models/         read models that answer domain questions about API payloads
services/       HttpClient and the resource gateways of ApiClient
```

- **Model.** `OrderModel`, `CartModel`, and friends wrap a JSON payload and answer
  questions a view would otherwise ask in JSX — `isCancellable`, `statusLabel`,
  `quantityOf`. They never write.
- **Controller.** Each owns a slice of state and publishes it through `subscribe` plus an
  immutable snapshot — exactly the contract `useSyncExternalStore` expects, so React
  binds to it with no state library. `BaseController.run` puts the loading flag and error
  handling around every API call, so no screen can forget a spinner or swallow a failure.
- **View.** Components read controller state through `useControllerState` and call
  controller methods. They hold no fetch logic.

`ControllerRegistry` is the browser-side counterpart of the server's `Container`: it
builds the graph once per tab, which is what lets the cart badge in the header and the
Add button on a menu page be the same state rather than two copies that drift.

### Session handling

The access token lives in the `SessionController`'s memory and nowhere else — not in
`localStorage`, which any injected script can read. On reload the session is rebuilt from
the httpOnly refresh cookie, which costs one request and closes the most commonly
exploited hole in a browser client. `HttpClient` refreshes once and replays a request
that met a 401, sharing one in-flight refresh between concurrent callers.

### Real-time behaviour

Order tracking, the rider feed, the vendor board, and the notification badge poll on a
five-second interval (`REALTIME.POLL_INTERVAL_MS`). The SRS recommends polling for the
MVP and asks for status propagation within five seconds (NFR-03); polling also survives
campus Wi-Fi dropping and returning, which a socket does not. Every poller stops itself —
on unmount, and when the thing it watches reaches an end state.

---

## Security

| Concern        | How it is handled                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Authentication | Access JWT ≤ 15 min in memory; refresh JWT in an httpOnly, SameSite=Lax cookie, rotated on use       |
| Session end    | Refresh tokens are stored as SHA-256 hashes and revoked on sign-out, password change, and suspension |
| Authorization  | `RbacMiddleware` for the coarse role gate; object-level ownership checks in the services             |
| IDOR           | Ownership is checked against the stored row, never against a claim the client sent back              |
| Passwords      | bcrypt cost 12, strength policy of FR-A3 enforced in one service                                     |
| Brute force    | Failure counter and lockout on the account (FR-A6), plus per-caller throttles on sign-in             |
| Input          | Zod schemas as a whitelist; unknown fields are stripped before a service sees them                   |
| Error leakage  | Only `AppError` reaches a client; anything else becomes an opaque 500 with the stack in the log      |
| Secret leakage | `Logger.redact` strips password, token, and PIN fields at any depth before a line is written         |
| Delivery fraud | Completion requires the customer's PIN, stored only as a hash (BR-10)                                |
| Audit          | Every lifecycle transition is written to `audit_logs` with actor and timestamp (BR-09/NFR-13)        |

---

## Testing

651 tests across two Jest projects, running as native ES modules — the source is ESM, and
transpiling it to CommonJS just to test it would mean the code under test is not the code
that ships.

| Layer                         | How it is tested                               |
| ----------------------------- | ---------------------------------------------- |
| Value objects and models      | Directly; no collaborators needed              |
| State machines                | Every legal and illegal transition, as a table |
| Repositories                  | Against a throwaway `InMemoryDatabase`         |
| The MongoDB engine            | Against a real `mongod`, started by the suite  |
| Services                      | Through a container wired over that database   |
| Middleware                    | With hand-written request and response doubles |
| Controllers and routers       | Through the real Express app with `supertest`  |
| Client models and controllers | With a `FakeApiClient` — no DOM, no network    |

There is no module mocking anywhere. Every class takes its collaborators through its
constructor, so a fake is enough — which is the practical payoff of the dependency
injection, not just a design preference.

Three defects were found by these tests and fixed: refresh tokens minted in the same
second were byte-identical (so rotation revoked its own replacement), the BR-11
auto-cancel job loaded orders without their lines and failed validation on save, and
`SessionController.logout` propagated a rejection that would have aborted the sign-out
redirect.

---

## Conventions

- Files and folders kebab-case; classes PascalCase; React components PascalCase in
  `.jsx`; constants UPPER_SNAKE_CASE in `packages/shared`.
- Two-space indent, 100-column lines, single quotes, semicolons. `npm run format` before
  pushing.
- Comments explain _why_. The what is the code.
- JSDoc is mandatory and enforced by `eslint-plugin-jsdoc`: every file has an `@file` and
  `@module`, and every class, method, getter, and exported constant carries a block with
  typed `@param`, `@returns`, and `@throws`. One exception to the column limit is allowed:
  a `@param` whose type is a long `import(...)` reference keeps the type and the name on
  one line, because splitting them leaves the tag with no parameter name at all.
- Types crossing a layer boundary are `@typedef`s in `packages/shared/src/types`.
- Feature branches only; commits as `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`.

## Scope

MVP is Epics A–E, COD-Direct payment (F01), and Admin G01–G06. Escrow, QR confirmation,
SMS OTP, and push notifications are Phase 2: the schema columns and the `Payment` and
`PayoutSplit` shapes exist so the route surface does not change later (SRS §12.3).

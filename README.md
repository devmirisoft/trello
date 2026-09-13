# Trello Snap

A small multi-user PWA: sign in, connect your own Trello account, open a board,
photograph a handwritten to-do list, and it OCRs the text on your phone,
previews one Trello card per line — each with its own title and its own date —
and creates them all, assigned to the person the board is set to, in the list
you chose.

The flow is:

**login → boards → a board → camera → OCR → preview → confirm.**

The board shows its lists side by side, with a member dropdown pinned to the
top and the camera button at the bottom. That dropdown does two jobs: it
filters the board to one person's cards, and it names who the next capture is
assigned to. The choice lives in the URL (`?member=`), so a reload — or a
shared link — lands on the same person.

Each previewed card carries its own due date. The batch date picker above them
is the default for every card that has not been given one of its own; moving it
fills the blanks and leaves the rest alone.

- OCR runs **on your device** in the browser via
  [Tesseract.js](https://github.com/naptha/tesseract.js) (WebAssembly). No
  image is ever uploaded.
- Every Trello call is made **server-side**. The browser never receives a
  Trello key or token — it talks only to this app's own API, which loads the
  calling user's credentials, decrypts them in memory, and proxies the request.
- Credentials are encrypted at rest with AES-256-GCM under `ENCRYPTION_KEY`.
- Accounts key off the MongoDB `_id`. The session JWT carries `sub: <userId>`
  and nothing else — no username — so changing your username or password never
  signs you out and never orphans your Trello connection.

## 1. Run it

```bash
npm install
cp .env.local.example .env.local   # fill in all four variables
npm run dev
```

| Variable         | Required | What it is                                            |
| ---------------- | -------- | ----------------------------------------------------- |
| `MONGODB_URI`    | yes      | MongoDB connection string                              |
| `MONGODB_DB`     | no       | Database name, defaults to `trello-snap`               |
| `SESSION_SECRET` | yes      | Signs the session JWT (HS256)                          |
| `ENCRYPTION_KEY` | yes      | 32 bytes, base64 — encrypts each user's Trello secrets |
| `TRELLO_API_BASE`| no       | Overrides the Trello base URL; the tests point it at a stub |

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # ENCRYPTION_KEY
```

Changing `ENCRYPTION_KEY` makes every stored Trello connection unreadable and
everyone has to reconnect. Changing `SESSION_SECRET` signs everyone out.

## 2. Connect Trello

Each person does this once, for their own account:

1. Create an integration at <https://trello.com/power-ups/admin/new> to get an
   **API key**.
2. Authorise it to get a **token**:
   `https://trello.com/1/authorize?expiration=never&name=TrelloSnap&scope=read,write&response_type=token&key=YOUR_KEY`
3. Paste both into the Connect screen. They are validated against
   `GET /1/members/me` before being saved, then encrypted.

Anyone holding your key and token can read and write your boards. Revoke a
leaked one from <https://trello.com/app-key>.

## 3. API

All routes require a session cookie; the Trello ones also require saved
credentials and answer `Trello not connected.` without them.

| Route                                                     | Method      | Purpose                          |
| --------------------------------------------------------- | ----------- | -------------------------------- |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | POST      | Account and session              |
| `/api/auth/me`                                             | GET         | `{ userId, username, trelloConnected }` |
| `/api/auth/credentials`                                    | PATCH       | Change username and/or password  |
| `/api/trello/credentials`                                  | PUT         | Save and validate key + token    |
| `/api/trello/boards`                                       | GET         | Your open boards                 |
| `/api/trello/boards/:boardId/lists`                        | GET         | Lists on a board                 |
| `/api/trello/boards/:boardId/members`                      | GET         | Members of a board               |
| `/api/trello/boards/:boardId/members/:memberId/cards`      | GET         | One member's open cards          |
| `/api/trello/cards/bulk`                                   | POST        | One card per task, each with its own date |
| `/api/trello/cards/bulk`                                   | PATCH       | `done` / `update` / `move`       |

`POST` takes `tasks` as either plain titles or `{ name, dueDate }` objects.
A task with no `dueDate` of its own falls back to the request's batch
`dueDate`, and a request with neither means today, not "no due date". Dates are
`yyyy-mm-dd` and are rejected with a 400 if they are not a real day.

Bulk operations are partial-failure tolerant: they return a per-card
`{ cardId, ok, error? }` and never abandon the rest of the batch. Concurrency
is capped at 4 to stay inside Trello's 100-requests-per-10s-per-token limit,
and 429s are retried with exponential backoff.

Moving cards to another board sends **both** `idBoard` and an `idList` that
belongs to it. If the assignee is not a member of the target board, Trello
would silently drop the assignment — so the move is refused with a warning and
only proceeds once you confirm.

## 4. Tests

```bash
npm test              # unit + integration + component (vitest)
npm run test:e2e      # system tests (playwright)
npm run typecheck
npm run lint
npm run build
```

**No test ever reaches real Trello.** Three independent guards:

1. `TRELLO_API_BASE` is read on every call, so tests point the whole app at a
   stub.
2. MSW runs with `onUnhandledRequest: "error"` — an un-stubbed call fails the
   test loudly.
3. `tests/setup/common.ts` throws on any outbound request to `api.trello.com`,
   and `tests/unit/guard.test.ts` asserts that guard actually fires.

| Level       | Where                  | Against                                          |
| ----------- | ---------------------- | ------------------------------------------------ |
| Unit        | `tests/unit`           | Pure functions, nothing mocked because nothing is shared |
| Integration | `tests/integration`    | Route handlers, real in-memory MongoDB, Trello stubbed with MSW — asserted on the captured **outbound** request |
| Component   | `tests/component`      | React Testing Library + user-event                |
| System      | `tests/e2e`            | The built app, in-memory MongoDB, and a **stateful fake Trello** (`tests/e2e/fake-trello.mjs`) |

Route handlers are plain `(Request) => Response` functions — they read the
session off the raw cookie header rather than `next/headers` — so integration
tests call them directly with no server to boot.

The system tests stub the camera with Chrome's
`--use-file-for-fake-video-capture`, which only accepts y4m. Regenerate the
fixture with:

```bash
node tests/e2e/make-fixture.mjs   # writes fixtures/tasks.y4m
```

OCR still runs for real against that video, so the system tests exercise the
whole loop. The first run downloads Tesseract's English language data from a
CDN.

### Manual checklist (real Trello, on a throwaway board)

Nothing automated touches real Trello, so these are worth doing by hand once:

1. A real key and token save and validate
2. Real boards and members load
3. Photograph a real list → cards land in the right list, right person, right due date
4. No date chosen → due today
5. Bulk mark done shows up on the board
6. Bulk move to another board keeps the assignee, and warns when they are not on it
7. A 20+ card batch does not trip rate limiting

## 5. Notes

- **Mobile gestures.** Long-press is 500ms and cancels if the finger moves more
  than 10px, so scrolling never selects. A completed hold buzzes
  (`navigator.vibrate(10)`). Task rows suppress text selection and the iOS
  callout menu.
- **Motion.** Lists stagger in at 40ms per row, and collapse to instant under
  `prefers-reduced-motion: reduce`.
- **Service worker.** Only build assets and the signed-out `/login` shell are
  cached. Navigations and RSC payloads always go to the network (falling back
  to the login shell offline), because `/boards` and `/settings` render one
  person's data and Cache Storage is script-readable and outlives signing out.

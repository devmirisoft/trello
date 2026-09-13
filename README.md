# Trello Snap

A small PWA: pick a board, a list and the person the work is for, photograph a
handwritten to-do list, and it OCRs the text on your phone, previews one Trello
card per line, and creates them all — assigned to that person with a shared due
date. No typing.

The flow is: **board → person → camera → OCR → card preview → confirm.**

The app is locked behind a single shared passcode. Unlock it once and every
later visit goes straight to the camera — the Trello credentials come from the
database, so there is nothing to re-enter on a new device.

- OCR runs **on your device** in the browser via [Tesseract.js](https://github.com/naptha/tesseract.js) (WebAssembly). No image or text is ever sent to any server of mine.
- Your Trello API key + token are stored in **MongoDB** and handed to the browser only after the passcode check. Cards are still created by calling `api.trello.com` **directly from the browser** (the same way Trello's own Power-Ups work) — the backend only custodies the credentials, it is not a Trello proxy.
- This is single-tenant by design: one passcode, one stored config, one row. That row is
  `{ _id: "config", id, passcodeHash, trello: { apiKey, token, board…, list…, member… } }` —
  the key and token live in the same record as the passcode that unlocks them, so they
  cannot drift apart from it. `id` is a `randomUUID` identifying the credential record
  (`_id` is the same constant on every install); records written before `id` existed are
  backfilled on the next read. The Settings screen shows it as the Credential ID.

## 1. Get a Trello API key and token

1. Go to <https://trello.com/power-ups/admin/new>, log in, and create a new Power-Up/integration (name doesn't matter — e.g. "Trello Snap"). This gives you an **API key**.
2. In the app itself, after you paste the API key, it will show you a link like:
   `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY`
   Open it, click **Allow**, and copy the **token** it gives you.
3. The first time you open the app it asks you to choose a passcode, then to paste both of these, pick which board and list new cards go into, and pick which board member the cards get assigned to. After that you only ever type the passcode.

Keep the token private — anyone with your key + token can read/write your Trello boards. If it's ever exposed, revoke it from <https://trello.com/app-key> (or your Trello account settings) and generate a new one.

## 2. Run it locally

```bash
npm install
cp .env.local.example .env.local   # then fill in MONGODB_URI and SESSION_SECRET
npm run dev
```

`MONGODB_URI` and `SESSION_SECRET` are required; a missing one makes the API
routes answer with a 500 naming the variable. See `.env.local.example`.

Set `TRELLO_API_KEY` and `TRELLO_TOKEN` too and there is no setup screen at
all: on login the **server** resolves the board, list and assignee itself
(defaulting to your first open board, its first list, and the token's owner),
saves the result, and you land straight on the capture screen. Pin
`TRELLO_BOARD_ID` / `TRELLO_LIST_ID` / `TRELLO_MEMBER_ID` to override those
defaults — but a pinned value can't then be changed from the Settings screen.
Leave the key and token unset and the app falls back to the manual setup form.

Open <http://localhost:3000>. Note: camera capture and PWA install require **HTTPS** (or `localhost`, which browsers treat as secure) — `localhost` is fine for testing, but to try it on your phone during dev you'll need a tunnel (e.g. `npx ngrok http 3000`) or just deploy it (step 3), which is quick and gives you a permanent link anyway.

## 3. Deploy to Vercel

The easiest path:

```bash
npm install -g vercel   # if you don't have it
vercel login
vercel                  # first deploy, follow the prompts
vercel --prod           # promote to your production URL
```

Or without the CLI: push this folder to a GitHub repo and import it at <https://vercel.com/new> — Vercel auto-detects Next.js, no config needed. Either way you get a real `https://...vercel.app` URL.

## 4. Install it on your phone

Open the deployed URL in your phone's browser:

- **Android (Chrome)**: menu → "Add to Home screen" / "Install app".
- **iPhone (Safari)**: Share button → "Add to Home Screen".

Once installed it opens full-screen like a native app.

## How it works

1. **Take a photo** of your notes (or pick one from your gallery).
2. It runs on-device OCR and splits the recognized text into lines, stripping bullets/numbers (`-`, `*`, `1.`, `[ ]`, etc.).
3. You get an editable checklist: uncheck anything that isn't really a task, fix typos, or add a line the OCR missed.
4. Pick **Today**, **Tomorrow**, or any date.
5. Tap **Create N cards** — each checked line becomes a separate Trello card in your configured list, due at 6pm local time on the chosen date.

You can change which board/list new cards go to any time from the **Settings** link in the top-right corner.

## Notes & limitations

- The first time you run OCR, the browser downloads the English language model (~a few MB) from a CDN; after that it's cached for offline reuse. You do need internet access for that first run and for talking to Trello.
- OCR handles printed and reasonably neat handwriting well; messy handwriting may need edits in the review step, which is why that step exists rather than posting straight to Trello.
- Everything is scoped to English OCR (`eng`) by default. To add another language, change `recognizeText`'s call to `createWorker` in `src/lib/ocr.ts` (e.g. `createWorker("eng+hin")` — see [supported languages](https://github.com/naptha/tesseract.js/blob/master/docs/tesseract_lang_list.md)).
- Due time defaults to 6pm local on the chosen date (see `DEFAULT_DUE_HOUR` in `src/lib/dates.ts`) — change it if you'd rather default to morning, etc.

## Project structure

```
src/
  app/
    page.tsx          # main screen flow (capture → OCR → review → submit)
    layout.tsx         # PWA metadata, icons, viewport
    manifest.ts         # web app manifest
  components/
    CameraCapture.tsx   # take/choose a photo
    OcrProgress.tsx      # OCR loading state
    SettingsPanel.tsx        # Trello key/token/board/list setup
    ServiceWorkerRegister.tsx # registers public/sw.js
    LockScreen.tsx            # the shared-passcode gate
    MemberPicker.tsx           # board members + the shared MemberAvatar
    CameraCapture.tsx           # live react-webcam preview + capture
    CardPreviewList.tsx          # Trello-card previews, editable, then create
    DatePicker.tsx                # shadcn Calendar in a Popover
  components/ui/                   # shadcn primitives (button, calendar, popover)
  hooks/
    useAuthConfig.ts  # loading | locked | unlocked + the saved config
  lib/
    trello.ts   # Trello REST API client (boards, lists, create card)
    ocr.ts       # Tesseract.js wrapper + text-to-task-lines splitting
    dates.ts      # Today/Tomorrow/custom date helpers
    passcode.ts    # scrypt passcode hash + signed session token (pure)
    image.ts        # data-URL snapshot -> File for the OCR pipeline
    server.ts       # Mongo connection, env checks, session cookie
    types.ts         # TrelloConfig, shared with the API routes
  app/api/
    unlock/     # POST: set (first run) or check the passcode, set the cookie
    logout/      # POST: clear the cookie
    config/       # GET/PUT: read and update the stored Trello config
public/
  sw.js          # minimal offline app-shell cache (never caches /api/*)
  icons/          # app icons
```

## Checks

```bash
node auth.check.mjs      # passcode hashing + session token forgery/expiry
node capture.check.mjs   # snapshot decoding + local-timezone date handling
node sw.check.mjs        # service worker must never cache /api/*
```

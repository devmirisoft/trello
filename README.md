# Trello Snap

A small PWA: photograph a handwritten to-do list (or any note), it OCRs the
text on your phone, you review the extracted lines, pick a date (Today /
Tomorrow / any date), and it creates one Trello card per line with that due
date — no typing.

There is no backend and no database. It's a single static-ish Next.js app:

- OCR runs **on your device** in the browser via [Tesseract.js](https://github.com/naptha/tesseract.js) (WebAssembly). No image or text is ever sent to any server of mine.
- Your Trello API key + token are stored **only in your browser's localStorage** and used to call `api.trello.com` directly from the browser (the same way Trello's own Power-Ups work).

## 1. Get a Trello API key and token

1. Go to <https://trello.com/power-ups/admin/new>, log in, and create a new Power-Up/integration (name doesn't matter — e.g. "Trello Snap"). This gives you an **API key**.
2. In the app itself, after you paste the API key, it will show you a link like:
   `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY`
   Open it, click **Allow**, and copy the **token** it gives you.
3. Paste both into the app's settings screen the first time you open it. It will then let you pick which board and list new cards go into.

Keep the token private — anyone with your key + token can read/write your Trello boards. If it's ever exposed, revoke it from <https://trello.com/app-key> (or your Trello account settings) and generate a new one.

## 2. Run it locally

```bash
npm install
npm run dev
```

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
    TaskReview.tsx        # editable line list + date picker + Trello submit
    DateSelector.tsx        # Today/Tomorrow/custom date buttons
    SettingsPanel.tsx        # Trello key/token/board/list setup
    ServiceWorkerRegister.tsx # registers public/sw.js
  lib/
    trello.ts   # Trello REST API client (boards, lists, create card)
    ocr.ts       # Tesseract.js wrapper + text-to-task-lines splitting
    dates.ts      # Today/Tomorrow/custom date helpers
    storage.ts     # localStorage-backed config store
public/
  sw.js          # minimal offline app-shell cache
  icons/          # app icons
```

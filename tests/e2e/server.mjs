// Boots everything the system tests run against — an in-memory MongoDB, the
// fake Trello, and the real Next.js app pointed at both — then keeps running
// until Playwright kills it.
//
// The app talks to Trello from the server, so page.route() in the browser
// cannot intercept it. TRELLO_API_BASE is the seam that lets the stub in.

import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startFakeTrello } from "./fake-trello.mjs";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const TRELLO_PORT = Number(process.env.E2E_TRELLO_PORT ?? 4100);

const mongod = await MongoMemoryServer.create();
const { server: trello } = await startFakeTrello(TRELLO_PORT);

const env = {
  ...process.env,
  PORT: String(APP_PORT),
  MONGODB_URI: mongod.getUri(),
  MONGODB_DB: "trello-snap-e2e",
  SESSION_SECRET: "e2e-session-secret-not-a-real-one",
  ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  TRELLO_API_BASE: `http://127.0.0.1:${TRELLO_PORT}/1`,
};

console.log(`[e2e] mongo ${mongod.getUri()}`);
console.log(`[e2e] fake trello http://127.0.0.1:${TRELLO_PORT}/1`);

const next = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "--port", String(APP_PORT)],
  { env, stdio: "inherit", shell: process.platform === "win32" }
);

const shutdown = async () => {
  next.kill();
  trello.close();
  await mongod.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", shutdown);

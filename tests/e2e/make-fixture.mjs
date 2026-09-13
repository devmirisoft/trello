// Generates fixtures/tasks.y4m — the "photo" Chrome's fake camera plays back.
//
// Chrome's --use-file-for-fake-video-capture only accepts y4m, and y4m is raw
// YUV planes behind a one-line header, so the picture is rendered on a canvas
// in a real browser (Playwright is already a dependency) and converted here.
// No ffmpeg, no image codec, no extra package.
//
//   node tests/e2e/make-fixture.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const WIDTH = 640;
const HEIGHT = 480;

export const FIXTURE_TASKS = [
  "Call the plumber",
  "Email Sam the invoice",
  "Book flights to Delhi",
  "Renew the gym membership",
];

const browser = await chromium.launch();
const page = await browser.newPage();

// Rendered as a photographed to-do list: dark text, plenty of size, high
// contrast. Tesseract has to read this for real, so legibility is the spec.
const luma = await page.evaluate(
  ({ width, height, tasks }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";

    ctx.font = "600 34px Arial, Helvetica, sans-serif";
    tasks.forEach((task, i) => ctx.fillText(task, 48, 60 + i * 88));

    const { data } = ctx.getImageData(0, 0, width, height);
    const y = new Array(width * height);
    for (let i = 0; i < y.length; i++) {
      const p = i * 4;
      // Rec.601 luma, the same conversion y4m's C420 expects.
      y[i] = Math.round(
        0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
      );
    }
    return y;
  },
  { width: WIDTH, height: HEIGHT, tasks: FIXTURE_TASKS }
);

await browser.close();

const chromaSize = (WIDTH / 2) * (HEIGHT / 2);
const frame = Buffer.concat([
  Buffer.from("FRAME\n", "ascii"),
  Buffer.from(Uint8Array.from(luma)),
  // 128 in both chroma planes is neutral grey: the picture is monochrome.
  Buffer.alloc(chromaSize, 128),
  Buffer.alloc(chromaSize, 128),
]);

// One frame is enough — Chrome loops the file for as long as the camera is on.
const y4m = Buffer.concat([
  Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F25:1 Ip A1:1 C420mpeg2\n`, "ascii"),
  frame,
]);

mkdirSync("fixtures", { recursive: true });
writeFileSync("fixtures/tasks.y4m", y4m);
console.log(`wrote fixtures/tasks.y4m (${y4m.length} bytes, ${WIDTH}x${HEIGHT})`);

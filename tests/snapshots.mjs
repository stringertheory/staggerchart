// Takes visual snapshots of the page's main states and fails on page errors,
// horizontal page overflow, or a state that didn't render. Needs Chrome
// installed, and network access because D3 loads from a CDN.
//
//   npm run snapshots            all snapshots, written to snapshots/
//   npm run snapshots -- dark    only snapshots with "dark" in the name

import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUTPUT = join(ROOT, 'snapshots');

const OCT_2016 = 9;

const REAL = '#real';
const PERFECT = '#perfect';

const DESKTOP = { width: 1200, height: 1000 };
const TABLET = { width: 800, height: 1000 };
const PHONE = { width: 390, height: 844 };
const SHORT = { width: 1200, height: 560 };

const CONTENT_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

function startServer() {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    try {
      if (!file.startsWith(ROOT)) throw new Error('outside the project');
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

async function actualPoint(page, section, column) {
  const header = page.locator(`${section} thead th.selects`).nth(column);
  await header.scrollIntoViewIfNeeded();
  const chart = page.locator(`${section} svg.chart`);
  await chart.scrollIntoViewIfNeeded();
  const headerBox = await header.boundingBox();
  const chartBox = await chart.boundingBox();
  return { x: headerBox.x + headerBox.width / 2, y: chartBox.y + 40, top: chartBox.y };
}

async function expectSelection(page, section) {
  await page.locator(`${section} path.selected-forecast`).waitFor({ state: 'attached' });
  await page.locator(`${section} .readout strong`).waitFor();
}

async function hoverActual(page, section, column) {
  const { x, y, top } = await actualPoint(page, section, column);
  await page.mouse.move(x, y);
  await expectSelection(page, section);
  const moved = (await page.locator(`${section} svg.chart`).boundingBox()).y !== top;
  if (moved) throw new Error('selecting shifted the page');
}

async function tapActual(page) {
  const { x, y } = await actualPoint(page, REAL, OCT_2016);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(300);
  await expectSelection(page, REAL);
}

async function hoverForecastCell(page) {
  await page.locator(
    `${REAL} td.value[aria-label*="Forecast for Feb 2017, made Aug 2016"]`).hover();
  await expectSelection(page, REAL);
}

async function hoverLowerCell(page) {
  await page.locator(
    `${REAL} td.value[aria-label*="Forecast for Mar 2017, made Dec 2016"]`).hover();
  await expectSelection(page, REAL);
}

async function readoutStaysInView(page) {
  await hoverLowerCell(page);
  const { y } = await page.locator(`${REAL} .readout`).boundingBox();
  if (y < 0) throw new Error('the readout scrolled out of view');
}

async function focusTable(page) {
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expectSelection(page, REAL);
}

async function scrollTableRight(page) {
  await page.locator(`${REAL} .vis`).evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
}

const snapshots = [
  { name: 'light-rest', fullPage: true },
  { name: 'dark-rest', colorScheme: 'dark', fullPage: true },
  { name: 'light-month-selected',
    act: (page) => hoverActual(page, REAL, OCT_2016) },
  { name: 'dark-month-selected', colorScheme: 'dark',
    act: (page) => hoverActual(page, REAL, OCT_2016) },
  { name: 'light-chart-detail', scale: 2, element: `${REAL} svg.chart`,
    act: (page) => hoverActual(page, REAL, OCT_2016) },
  { name: 'light-cell-selected', act: hoverForecastCell },
  { name: 'light-lower-cell-selected', act: hoverLowerCell },
  { name: 'light-short-screen-selected', viewport: SHORT, act: readoutStaysInView },
  { name: 'light-keyboard-focus', act: focusTable },
  { name: 'light-perfect-selected',
    act: (page) => hoverActual(page, PERFECT, OCT_2016) },
  { name: 'dark-perfect-selected', colorScheme: 'dark',
    act: (page) => hoverActual(page, PERFECT, OCT_2016) },
  { name: 'tablet-scrolled-right', viewport: TABLET, act: scrollTableRight },
  { name: 'phone-rest', viewport: PHONE, fullPage: true },
  { name: 'phone-dark-rest', viewport: PHONE, colorScheme: 'dark', fullPage: true },
  { name: 'phone-month-tapped', viewport: PHONE, touch: true, act: tapActual },
];

async function takeSnapshot(browser, url, snapshot) {
  const { name, viewport = DESKTOP, colorScheme = 'light', scale = 1, touch } = snapshot;
  const context = await browser.newContext({
    viewport, colorScheme, deviceScaleFactor: scale, hasTouch: Boolean(touch),
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('response', (response) => {
    const isFavicon = response.url().endsWith('/favicon.ico');
    if (response.status() >= 400 && !isFavicon) {
      problems.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(url);
    await page.locator(`${PERFECT} td.value`).first().waitFor();
    if (snapshot.act) await snapshot.act(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth);
    if (overflows) problems.push('the page scrolls horizontally');

    const path = join(OUTPUT, `${name}.png`);
    if (snapshot.element) await page.locator(snapshot.element).screenshot({ path });
    else await page.screenshot({ path, fullPage: Boolean(snapshot.fullPage) });
  } catch (error) {
    problems.push(error.message);
  }

  await context.close();
  return problems;
}

const filter = process.argv[2] || '';
const selected = snapshots.filter((snapshot) => snapshot.name.includes(filter));

if (!filter) await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome' });

let failures = 0;
for (const snapshot of selected) {
  const problems = await takeSnapshot(browser, url, snapshot);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${snapshot.name}`);
  problems.forEach((problem) => console.log(`     ${problem}`));
  if (problems.length) failures += 1;
}

await browser.close();
server.close();

console.log(`\n${selected.length - failures}/${selected.length} passed, written to snapshots/`);
process.exitCode = failures ? 1 : 0;

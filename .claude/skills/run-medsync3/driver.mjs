// MedSync3 smoke driver: launches headless Chromium against a running
// Streamlit app, drives one real calculation, and screenshots each step.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node driver.mjs
//
// Env:
//   APP_URL    target Streamlit URL        (default http://127.0.0.1:8501)
//   SHOT_DIR   where screenshots are saved (default ./screenshots)
//   PLAYWRIGHT_NODE_MODULES  global node_modules holding playwright
//                            (default /opt/node22/lib/node_modules/)
import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire(
  process.env.PLAYWRIGHT_NODE_MODULES || '/opt/node22/lib/node_modules/'
);
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8501';
const OUT = process.env.SHOT_DIR || new URL('./screenshots', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.getByText('Medication Sync Calculator').waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/01_initial.png`, fullPage: true });

  // NOTE: "Number of existing medications" lives inside st.form, so changing
  // it does NOT add medication rows until submit — the dynamic-rows feature
  // is effectively dead. The working flow is: new medication + future date.
  await page.getByLabel('New Medication Name').fill('Metformin');
  const dose = page.getByLabel('New Medication Daily Dose');
  await dose.click();
  await dose.fill('2');

  // Streamlit's date_input opens a calendar popup; typing into the field
  // does not stick. Pick a guaranteed-future date: jump to next month and
  // click day 15. (Calculate errors out if the sync date isn't in the future.)
  await page.getByPlaceholder('YYYY/MM/DD').click();
  await page.getByRole('button', { name: 'Next month.' }).click();
  // Day numbers render as bare <div>s with no role/label — match exact text.
  await page.getByText('15', { exact: true }).first().click();
  await page.screenshot({ path: `${OUT}/02_filled.png`, fullPage: true });

  await page.getByRole('button', { name: 'Calculate' }).click();
  await page.getByText('Sync Plan').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/03_result.png`, fullPage: true });

  const plan = await page.getByText(/units needed to sync/).allInnerTexts();
  console.log('PLAN_LINES:', JSON.stringify(plan));
  console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
  if (plan.length === 0) { console.error('FAIL: no sync plan rendered'); process.exit(1); }
  console.log('OK: smoke flow passed, screenshots in', OUT);
} finally {
  await browser.close();
}

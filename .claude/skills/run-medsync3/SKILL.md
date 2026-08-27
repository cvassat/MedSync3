---
name: run-medsync3
description: Build, run, and drive MedSync3 — the Streamlit Medication Sync Calculator. Use when asked to start MedSync3, run it, screenshot its UI, drive the calculator, or interact with the running app.
---

MedSync3 is a single-file Streamlit web app (a medication refill-sync
calculator). You run it by launching the Streamlit server, then driving
headless Chromium against it with `.claude/skills/run-medsync3/driver.mjs`,
which fills the form, clicks Calculate, and saves screenshots.

All paths below are relative to the repo root (`MedSync3/`).

There are two entrypoints:
- **`med_sync_app_updated.py`** — the main, self-contained app. No external
  services. This is what the driver targets.
- **`med_sync_app_with_login_and_supabase.py`** — same calculator behind a
  Supabase email/password login. Secondary; see [Run: login app](#run-login-app).

## Prerequisites

No `apt-get` packages are needed. Python 3.11 and Node 22 are already
present. A Chromium build for Playwright is pre-installed at
`/opt/pw-browsers` (revision 1194), and the global `playwright@1.56.1`
(`/opt/node22/lib/node_modules`) targets exactly that revision — so the
driver works by pointing `PLAYWRIGHT_BROWSERS_PATH` at it. **Do not run
`playwright install`**: the download CDN is blocked by the network policy.

## Setup

Create a venv and install Streamlit. **Pin the version** — the driver's
selectors depend on Streamlit's DOM, and it has changed between releases
(1.57 rendered the date field as a text input with a calendar popup;
1.62 uses a native `<input type="date">`). This skill is verified against
`1.62.0`:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -q --upgrade pip
pip install -q streamlit==1.62.0
```

Only for the login app, also install the Supabase client:

```bash
pip install -q supabase
```

## Run (agent path)

Launch the app in the background and wait for it to actually serve (poll
the health endpoint — don't `sleep`):

```bash
. .venv/bin/activate
nohup streamlit run med_sync_app_updated.py \
  --server.port 8501 --server.headless true --server.address 127.0.0.1 \
  > /tmp/streamlit.log 2>&1 &
echo $! > /tmp/streamlit.pid
timeout 40 bash -c 'until curl -sf http://127.0.0.1:8501/_stcore/health >/dev/null; do sleep 1; done' && echo HEALTHY
```

Drive it. The driver launches headless Chromium, fills the new-medication
form, sets the sync date 30 days out, clicks Calculate, prints the
resulting plan line, and writes `01_initial.png` / `02_filled.png` /
`03_result.png`:

```bash
cd .claude/skills/run-medsync3
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node driver.mjs
```

Expected tail of output (date and unit count depend on the day you run;
30 days × 2 = 58–60 units is normal — dose × days-until-sync):

```
PLAN_LINES: ["Metformin (new): 58 units needed to sync by <YYYY-MM-DD>"]
OK: smoke flow passed, screenshots in /home/user/MedSync3/.claude/skills/run-medsync3/screenshots
```

Screenshots land in `.claude/skills/run-medsync3/screenshots/`. Override
the target with `APP_URL` and `SHOT_DIR` env vars.

Stop the server:

```bash
kill $(cat /tmp/streamlit.pid)
```

## Run: login app

Launch on a separate port (needs the `supabase` package from Setup):

```bash
. .venv/bin/activate
nohup streamlit run med_sync_app_with_login_and_supabase.py \
  --server.port 8502 --server.headless true --server.address 127.0.0.1 \
  > /tmp/streamlit2.log 2>&1 &
echo $! > /tmp/streamlit2.pid
timeout 40 bash -c 'until curl -sf http://127.0.0.1:8502/_stcore/health >/dev/null; do sleep 1; done' && echo HEALTHY
```

It renders a Login / Sign Up screen. The calculator only appears **after**
a successful login, which round-trips to Supabase and requires email
confirmation — that cannot complete headless in this container. So this
entrypoint is only verifiable up to the login screen here; use the main
app for driving the calculator.

## Run (human path)

`streamlit run med_sync_app_updated.py` opens the app at
`http://localhost:8501` and (on a desktop) launches a browser tab. Useless
headless — there's no display — which is why the agent path drives it with
Playwright instead.

## Direct invocation

The calculator logic is a pure function, importable without Streamlit's
server. Useful for testing changes to the math without a browser:

```bash
. .venv/bin/activate
python -c "
import importlib.util
spec = importlib.util.spec_from_file_location('m', 'med_sync_app_updated.py')
m = importlib.util.module_from_spec(spec)
import streamlit  # the module touches st at import time
spec.loader.exec_module(m)
print(m.calculate_sync_quantities(
    [{'name':'A','daily_dose':1,'remaining':10}],
    {'name':'B','daily_dose':2}, '2026-06-15'))
"
```

It prints the plan list (`[{'name': 'A', ...}, {'name': 'B (new)', ...}]`)
after a burst of `missing ScriptRunContext!` warnings — those are expected
when importing a Streamlit script outside the server and can be ignored.

## Gotchas

- **`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is mandatory.** Without it
  Playwright looks in `~/.cache/ms-playwright` (empty) and tries to
  download — which fails, the CDN host is blocked. The pre-installed build
  1194 only matches the **node** `playwright@1.56.1`; the venv's Python
  `playwright` wants revision 1223 and will not work. Drive with node.
- **"Number of existing medications" is a dead control.** It lives inside
  `st.form`, and Streamlit does not re-run on form-widget changes until the
  form is submitted — so increasing it never adds the per-medication input
  rows. The only working flow is the new-medication fields + a sync date.
  Don't waste time trying to drive the existing-meds rows; they never render.
- **The date field is a native `<input type="date">` with no aria-label,
  no placeholder, and no `name`** — `getByLabel('Desired Sync Date')` will
  not match it. The driver targets it as `input[type="date"]` and fills an
  ISO `YYYY-MM-DD` string, which the native control accepts directly (no
  calendar popup to click through).
- **Sync date must be in the future** or Calculate shows an error and
  returns no plan. The driver picks today + 30 days to guarantee this.
- **Console errors are expected and benign.** Streamlit's usage-metrics
  fetch fails (`ERR_CERT_AUTHORITY_INVALID` / "Failed to fetch metrics
  config") because outbound telemetry is blocked. This does not affect the
  app — the driver still passes. Don't treat these as failures.
- **Streamlit's DOM is not stable across versions.** 1.57 rendered the
  date field as a text input over a calendar popup (`aria-label="Select a
  date."`, placeholder `YYYY/MM/DD`, day cells were bare `<div>`s clicked
  by exact text); 1.62 replaced it with a native date input. That's why
  Setup pins `streamlit==1.62.0`. If you unpin and the driver breaks on
  the date field, that's the reason.

## Troubleshooting

- **`Named export 'chromium' not found`** — the global Playwright is
  CommonJS; the driver loads it via `createRequire`, don't `import` it
  directly as ESM.
- **Driver hangs on `getByText('Sync Plan')`** — the date is at today or
  earlier. Confirm `02_filled.png` shows a `Desired Sync Date` in the
  future; if it shows today, the `input[type="date"]` fill didn't take
  (usually because you're on an older Streamlit that still uses the popup
  calendar — pin `streamlit==1.62.0`).
- **`locator.click: Timeout … waiting for getByPlaceholder('YYYY/MM/DD')`**
  — Streamlit downgraded/upgraded to a version without that placeholder.
  Pin to `1.62.0` per Setup.
- **`EADDRINUSE` / port 8501 busy** — a previous server is still up.
  `kill $(cat /tmp/streamlit.pid)` or `pkill -f 'streamlit run'` first.

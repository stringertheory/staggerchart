# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A D3 v4 page showing Andy Grove's stagger chart from *High Output Management*: a table of forecasts, with a line chart above it. There is no build step or linter. npm is only used for the snapshot script.

## Commands

Regenerate the chart data from the CSV (the script prints to stdout):

```sh
python3 staggerchart.py "Stagger Chart - Sheet1.csv" > staggerchart.json
```

View the chart. It must be served over HTTP because `d3.json` fetches `staggerchart.json`, and it needs network access because D3 loads from a CDN:

```sh
python3 -m http.server   # then open http://localhost:8000
```

Take visual snapshots of the page's main states into `snapshots/` (gitignored). The script serves the page itself, uses the installed Chrome, and exits non-zero on page errors, horizontal page overflow, or a state that didn't render. It checks no pixels against a baseline, so look at the images:

```sh
npm install
npm run snapshots            # all of them
npm run snapshots -- dark    # only names containing "dark"
```

## Architecture

The pipeline is `Stagger Chart - Sheet1.csv` → `staggerchart.py` → `staggerchart.json` → `main.js`, which renders into `#vis-container` in `index.html`. Styling and all colors are in `style.css`.

**CSV layout:** the first row is ignored, and the second holds the "forecast for" months. Each later row is one "forecast made" month, with column 0 as its label. A cell is the value forecast in that row's month for that column's month, so the diagonal (`forecast_made == forecast_for`) is the actual value.

The CSV is sample data. Its forecasts started as steady 5% monthly growth from each actual, then had seeded wobble applied directly to the file, so it no longer matches the Google Sheet linked in `staggerchart.py`. The actuals were left as they were.

**JSON shape:** points are `[month, value]` pairs, with months as `"YYYY-MM"` strings.
- `actual`: a single series of the diagonal points.
- `prospective`: one series per month a forecast was made, sorted by month. `main.js` builds everything from this and `actual`, and takes each row's "made" month from its first point, so every row must include its diagonal value.
- `retrospective`: one series per month forecast for. Nothing reads this at the moment.

**Page:** `buildModel` turns the JSON into cell objects (row, column, value, actual, percent error, lead), and every view draws from those. The page renders two sections from `renderSection`: the real data, and `perfectModel`, which sets every forecast to its actual. They share one y-domain so they compare directly. Months with no actual yet keep the real chart's staircase but take values from `assumedValues` (the actuals' linear trend plus each month's distance from trend a year earlier). That assumed future appears only through the forecasts: those cells keep `actual: null`, so the actuals line stops at the last real actual and the cells read as "no actual yet".
- The chart and table share a month grid, set by `computeLayout`, so the table's month headers are also the chart's x-axis, and the chart deliberately has no x-axis of its own. Wider screens get full-size columns that scroll under a sticky y-axis and row labels. Below 700px, a compact layout fits all months on screen by hiding the cell numbers, which stay in the markup and appear in the readout.
- The chart has no modes. Thin gray lines are all the forecasts. Selecting a month draws two lines through its actual, under the actuals line: the estimates arriving at it (violet, x is the month each estimate was made) and the forecast leaving it (amber). Selecting an off-diagonal table cell draws its row's forecast and its column's estimates, which then start from different actuals. The perfect chart also keeps its flat estimates visible at rest, because its forecasts hide behind the actuals line.
- `connect` holds the single selected cell. Hovering or tapping a table cell or a row or month header, or moving focus through the table, selects it, and `highlightCell`, `markCell`, and the status line all follow. There's no tooltip: `renderStatus` shows values and the month-specific line keys in a sticky line above each chart, so nothing covers the data. It has a reserved height so selecting never shifts the page. Touch selections persist, because a lifted finger fires `pointerleave`. In the chart only actuals respond, anywhere in their column.
- Error bins: `binClass` in `main.js` assigns classes like `e-over-2`. Each class in `style.css` sets `--fill` and `--ink`, which table cells and legend swatches use. The chart deliberately doesn't use this scale, because a line's position already shows whether it was high or low. Thresholds are `ERROR_BINS`, with matching text in `BIN_LABELS`.

**Colors:** dark mode has its own steps, not an inversion. The red steps were derived to match the blue steps in OKLCH lightness, and each fill was checked for at least 4.5:1 contrast with its `--ink`, so recheck both if a color changes.

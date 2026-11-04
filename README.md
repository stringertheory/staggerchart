# stack o lee

An interactive version of the stagger chart from Andy Grove's *High Output Management*. Each month you forecast the next several months, then line those forecasts up against what actually happened.

The page has two parts:

- **The stagger chart:** rows are the month a forecast was made, columns are the month it was for, and actuals run down the diagonal with an asterisk. Cells are shaded by how far each forecast missed. A line chart above the table shares its months, and selecting a month shows the estimates arriving at its actual and the forecast leaving it.
- **What perfect forecasting would look like:** the same months and actuals, with every forecast replaced by what actually happened.

The numbers are sample data, not real results.

## Running it

The page has to be served over HTTP, and it needs network access because D3 loads from a CDN:

```sh
python3 -m http.server   # then open http://localhost:8000
```

## Changing the data

Forecasts live in `Stagger Chart - Sheet1.csv`. After editing it, regenerate the JSON the page reads:

```sh
python3 staggerchart.py "Stagger Chart - Sheet1.csv" > staggerchart.json
```

In the CSV, the first row is ignored and the second holds the months forecast for. Each later row starts with the month the forecast was made, and every row needs a value in its own month, which is that month's actual.

## Snapshots

This takes screenshots of the page's main states in light mode, dark mode, and at tablet and phone sizes. It needs Chrome installed and writes to `snapshots/`:

```sh
npm install
npm run snapshots            # all of them
npm run snapshots -- dark    # only names containing "dark"
```

It fails on page errors, sideways page scrolling, or a state that didn't render. It doesn't compare against saved images, so look at the screenshots to catch visual changes.

## Further reading

- [Andy Grove's stagger chart](http://tomtunguz.com/groves-stagger-chart/), Tom Tunguz
- [High Output Management](http://a16z.com/2015/11/13/high-output-management/), a16z
- [Budget forecasts compared with reality](http://www.nytimes.com/interactive/2010/02/02/us/politics/20100201-budget-porcupine-graphic.html), The New York Times
- [Japan fertility rate forecasts versus reality](https://flowingdata.com/2015/01/08/japan-fertility-rate-forecasts-versus-reality/), FlowingData

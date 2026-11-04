// Grove's stagger chart: rows are the months forecasts were made, columns are
// the months forecast for, and actuals fall on the diagonal. A line chart above
// the table shares its month grid. Selecting a month shows both readings from
// its actual: the forecast leaving it, and the estimates arriving at it.

// Wide screens get a readable table that scrolls if it must. Phones get a
// compact staircase that fits the screen, with values read by selecting a cell.
const COMPACT_QUERY = '(max-width: 699px)';
const FULL_LAYOUT = { compact: false, headerWidth: 100, columnWidth: 46, chartHeight: 280 };
const COMPACT_HEIGHT = 220;
const COMPACT_MIN_HEADER = 46;
const CHART_PADDING = { top: 16, bottom: 12 };

// Upper bound of each error bin, in percent of the actual.
const ERROR_BINS = [5, 15, 30];
const BIN_LABELS = ['±5%', '5–15%', '15–30%', '30%+'];

const parseMonth = d3.timeParse('%Y-%m');
const monthAndYear = (month) => d3.timeFormat('%b %Y')(parseMonth(month));
const monthOnly = (month) => d3.timeFormat('%b')(parseMonth(month));
const yearOnly = (month) => d3.timeFormat('%Y')(parseMonth(month));
const shortMonthAndYear = (month) => d3.timeFormat("%b '%y")(parseMonth(month));

const monthsAhead = (lead) => `${lead} ${lead === 1 ? 'month' : 'months'} ahead`;

function describeError(error) {
  const size = Math.abs(error).toFixed(1);
  if (size === '0.0') return 'on target';
  return `${size}% ${error > 0 ? 'high' : 'low'}`;
}

function binClass(cell) {
  if (cell.isActual) return 'e-actual';
  if (cell.error === null) return 'pending';
  const size = Math.abs(cell.error);
  const step = ERROR_BINS.filter((bound) => size >= bound).length;
  if (step === 0) return 'e-neutral';
  return `e-${cell.error > 0 ? 'over' : 'under'}-${step}`;
}

function buildModel(data) {
  const months = Array.from(
    new Set([].concat(...data.prospective).map((point) => point[0]))
  ).sort();
  const columnOf = new Map(months.map((month, index) => [month, index]));
  const actuals = new Map(data.actual);

  // Every forecast starts with the actual for the month it was made.
  const rows = data.prospective.map((series, row) => {
    const made = series[0][0];
    return series.map(([month, value]) => {
      const actual = actuals.has(month) ? actuals.get(month) : null;
      const column = columnOf.get(month);
      return {
        row,
        column,
        made,
        month,
        value,
        actual,
        isActual: made === month,
        lead: column - columnOf.get(made),
        error: actual === null ? null : (100 * (value - actual)) / actual,
      };
    });
  });

  const cells = [].concat(...rows);
  const columns = months.map((month, column) =>
    cells.filter((cell) => cell.column === column));

  return { months, rows, columns, cells };
}

// The value assumed for each month: the linear trend in the actuals, plus that
// month's distance from the trend a year earlier.
function assumedValues({ months, cells }) {
  const actuals = cells.filter((cell) => cell.isActual);
  const meanColumn = d3.mean(actuals, (cell) => cell.column);
  const meanValue = d3.mean(actuals, (cell) => cell.value);
  const slope =
    d3.sum(actuals, (cell) => (cell.column - meanColumn) * (cell.value - meanValue)) /
    d3.sum(actuals, (cell) => (cell.column - meanColumn) ** 2);
  const trend = (column) => meanValue + slope * (column - meanColumn);
  const offTrend = new Map(actuals.map((cell) =>
    [cell.column, cell.value - trend(cell.column)]));

  return months.map((month, column) => {
    const value = trend(column) + (offTrend.get(column - 12) || 0);
    return Math.round(value * 10) / 10;
  });
}

// The same staircase, with every forecast right. Forecasts for months with no
// actual yet use the assumed future, which only ever appears through them.
function perfectModel(model) {
  const assumed = assumedValues(model);
  const rows = model.rows.map((row) => row.map((cell) => Object.assign({}, cell,
    cell.actual === null
      ? { value: assumed[cell.column] }
      : { value: cell.actual, error: 0 })));
  const cells = [].concat(...rows);
  const columns = model.months.map((month, column) =>
    cells.filter((cell) => cell.column === column));

  return { months: model.months, rows, columns, cells, isPerfect: true };
}

function renderFinding({ cells }) {
  const scored = cells.filter((cell) => cell.error !== null && !cell.isActual);
  const leads = d3.extent(scored, (cell) => cell.lead);
  const parts = leads.map((lead) => {
    const errors = scored.filter((cell) => cell.lead === lead);
    const meanError = d3.mean(errors, (cell) => cell.error);
    return `${describeError(meanError)} ${monthsAhead(lead).replace(' ahead', ' out')}`;
  });
  document.getElementById('finding').textContent =
    `On average, forecasts ran ${parts[0]} and ${parts[1]}.`;
}

function renderTableKey() {
  const key = d3.select('#table-key');

  const actual = key.append('div').classed('key-item', true);
  actual.append('span').attr('class', 'swatch e-actual').text('*');
  actual.append('span').text('Actual');

  const scale = key.append('div').classed('scale', true);
  const ends = scale.append('div').classed('scale-ends', true);
  ends.append('span').text('Forecast too low');
  ends.append('span').text('Forecast too high');
  const swatches = scale.append('div').classed('scale-steps', true);
  const steps = [3, 2, 1].map((step) => [`e-under-${step}`, BIN_LABELS[step]])
    .concat([['e-neutral', BIN_LABELS[0]]])
    .concat([1, 2, 3].map((step) => [`e-over-${step}`, BIN_LABELS[step]]));
  steps.forEach(([className, label]) => {
    swatches.append('span').attr('class', className).text(label);
  });

  const pending = key.append('div').classed('key-item', true);
  pending.append('span').attr('class', 'swatch unshaded');
  pending.append('span').text('No actual yet');
}

// The line keys and readout above a chart. Selections show here, not in a
// tooltip, so they never cover the chart or table being read.
function renderStatus(status, restText) {
  status.selectAll('*').remove();
  const keys = status.append('div').classed('line-keys', true);

  const lineKey = (className, label) => {
    const item = keys.append('div').classed('key-item', true);
    item.append('span').attr('class', `line-key ${className}`);
    return item.append('span').text(label);
  };
  lineKey('actual', 'Actual');
  lineKey('forecast', 'Forecast');
  const estimatesKey = lineKey('selected-estimates', '');
  const forecastKey = lineKey('selected-forecast', '');
  const selectionKeys = [estimatesKey, forecastKey]
    .map((label) => d3.select(label.node().parentNode));

  const readout = status.append('p').classed('readout', true).attr('role', 'status');

  return function showCell(cell) {
    selectionKeys.forEach((item) => item.classed('hidden', !cell));
    readout.selectAll('*').remove();
    if (!cell) {
      readout.text(restText);
      return;
    }
    estimatesKey.text(`Estimates for ${monthAndYear(cell.month)}, by month made`);
    forecastKey.text(`Forecast from ${monthAndYear(cell.made)}, by month predicted`);
    const [value, ...details] = describeCell(cell);
    readout.text('');
    readout.append('strong').text(value + (cell.isActual ? '*' : ''));
    readout.append('span').text(details.join('. '));
  };
}

function renderChart(root, model, yDomain, layout) {
  const { months, rows, columns, cells, isPerfect } = model;
  const { headerWidth, columnWidth, chartHeight } = layout;

  const width = headerWidth + months.length * columnWidth;
  const columnCenter = (column) => headerWidth + (column + 0.5) * columnWidth;
  const y = d3.scaleLinear()
    .domain(yDomain)
    .range([chartHeight - CHART_PADDING.bottom, CHART_PADDING.top])
    .nice();

  // A forecast runs through the months it predicts. Estimates for one month run
  // through the months they were made, ending at its actual.
  const forecastLine = d3.line()
    .x((cell) => columnCenter(cell.column))
    .y((cell) => y(cell.value));
  const estimatesLine = d3.line()
    .x((cell) => columnCenter(cell.column - cell.lead))
    .y((cell) => y(cell.value));

  // The axis is its own layer so it stays put while the chart scrolls under it.
  const axis = root.append('svg').classed('y-axis', true)
    .attr('width', headerWidth)
    .attr('height', chartHeight)
    .attr('aria-hidden', true);

  const svg = root.append('svg').classed('chart', true)
    .classed('compact-chart', layout.compact)
    .attr('width', width)
    .attr('height', chartHeight)
    .style('margin-top', `-${chartHeight}px`)
    .attr('role', 'img')
    .attr('aria-label', 'Line chart of the actual series with thin lines for ' +
      'the forecasts. The table below holds the same values.');

  y.ticks(5).forEach((tick) => {
    svg.append('line').classed('grid-line', true)
      .attr('x1', headerWidth).attr('x2', width)
      .attr('y1', y(tick)).attr('y2', y(tick));
    axis.append('text').classed('tick', true)
      .attr('x', headerWidth - 8).attr('y', y(tick))
      .text(tick);
  });

  rows.forEach((row) => {
    svg.append('path').attr('class', 'line forecast').attr('d', forecastLine(row));
  });

  if (isPerfect) {
    // Perfect forecasts hide behind the actuals, so show the flat estimates too.
    columns.forEach((column) => {
      svg.append('path').attr('class', 'line forecast').attr('d', estimatesLine(column));
    });

    const future = cells.filter((cell) => cell.actual === null);
    svg.append('text').classed('direct-label', true)
      .attr('x', width - 4)
      .attr('y', y(d3.max(future, (cell) => cell.value)) - 10)
      .text('All forecasts agree');
  }

  // Selected lines sit under the actuals, and selected dots on top of them.
  const selectedLines = svg.append('g');

  const actualCells = cells.filter((cell) => cell.isActual);
  const dotRadius = layout.compact ? 2.5 : 4;
  svg.append('path').attr('class', 'line actual').attr('d', forecastLine(actualCells));
  actualCells.forEach((cell) => {
    svg.append('circle').classed('actual-dot', true)
      .attr('cx', columnCenter(cell.column)).attr('cy', y(cell.value))
      .attr('r', dotRadius);
  });

  const selectedDots = svg.append('g');

  const hitArea = svg.append('rect').classed('hit-area', true)
    .attr('x', headerWidth).attr('width', width - headerWidth)
    .attr('height', chartHeight);

  // Only actuals respond to the pointer, anywhere in their column of the chart.
  function actualAt(px) {
    const column = Math.floor((px - headerWidth) / columnWidth);
    return actualCells.find((cell) => cell.column === column) || null;
  }

  function highlightCell(cell) {
    selectedLines.selectAll('*').remove();
    selectedDots.selectAll('*').remove();
    if (!cell) return;

    selectedLines.append('path').attr('class', 'line selected-estimates')
      .attr('d', estimatesLine(columns[cell.column]));
    selectedLines.append('path').attr('class', 'line selected-forecast')
      .attr('d', forecastLine(rows[cell.row]));

    actualCells
      .filter((actual) => actual.row === cell.row || actual.column === cell.column)
      .forEach((actual) => {
        selectedDots.append('circle').classed('actual-dot', true)
          .attr('cx', columnCenter(actual.column)).attr('cy', y(actual.value))
          .attr('r', dotRadius + 2);
      });
  }

  return { hitArea, actualAt, highlightCell };
}

function renderTable(root, { months, rows, columns }, label, layout) {
  const { compact, headerWidth, columnWidth } = layout;
  const table = root.append('table')
    .classed('compact', compact)
    .attr('role', 'grid')
    .attr('aria-label', label);

  const colgroup = table.append('colgroup');
  colgroup.append('col').style('width', `${headerWidth}px`);
  months.forEach(() => colgroup.append('col').style('width', `${columnWidth}px`));

  const head = table.append('thead');
  const years = head.append('tr');
  const corner = years.append('th').classed('corner', true).attr('rowspan', 2);
  corner.append('div').text(compact ? 'For →' : 'Forecast for →');
  corner.append('div').text(compact ? 'Made ↓' : 'Forecast made ↓');

  d3.nest().key(yearOnly).entries(months).forEach((group) => {
    years.append('th').classed('year', true)
      .attr('scope', 'colgroup')
      .attr('colspan', group.values.length)
      .text(group.key);
  });

  const monthRow = head.append('tr');
  // Hovering a header selects the latest entry in that column: its actual, if any.
  const columnHeaders = months.map((month, column) =>
    monthRow.append('th').classed('selects', true).attr('scope', 'col')
      .datum(columns[column][columns[column].length - 1])
      .text(compact ? monthOnly(month)[0] : monthOnly(month)));

  const body = table.append('tbody');
  const rowHeaders = [];
  const cellNodes = new Map();

  rows.forEach((row) => {
    const tr = body.append('tr');
    rowHeaders.push(
      tr.append('th').classed('selects', true).attr('scope', 'row')
        .datum(row[0])
        .text((compact ? shortMonthAndYear : monthAndYear)(row[0].made)));

    months.forEach((month, column) => {
      const cell = row.find((candidate) => candidate.column === column);
      const td = tr.append('td');
      if (!cell) return;
      td.datum(cell)
        .attr('class', `value ${binClass(cell)}`)
        .attr('tabindex', -1)
        .attr('aria-label', describeCell(cell).join('. '))
        .text(cell.value.toFixed(1) + (cell.isActual ? '*' : ''));
      cellNodes.set(cell, td);
    });
  });

  cellNodes.get(rows[0][0]).attr('tabindex', 0);

  function markCell(selected) {
    table.classed('has-selection', Boolean(selected));
    cellNodes.forEach((td, cell) => {
      td.classed('in-row', Boolean(selected) && cell.row === selected.row)
        .classed('in-col', Boolean(selected) && cell.column === selected.column)
        .classed('current', cell === selected);
    });
    rowHeaders.forEach((th, index) =>
      th.classed('active', Boolean(selected) && index === selected.row));
    columnHeaders.forEach((th, index) =>
      th.classed('active', Boolean(selected) && index === selected.column));
  }

  return { node: table.node(), body, markCell };
}

function describeCell(cell) {
  const value = cell.value.toFixed(1);
  if (cell.isActual) return [value, `Actual for ${monthAndYear(cell.month)}`];
  const lines = [
    value,
    `Forecast for ${monthAndYear(cell.month)}, made ${monthAndYear(cell.made)}`,
  ];
  lines.push(cell.error === null
    ? `No actual yet, ${monthsAhead(cell.lead)}`
    : `Actual ${cell.actual.toFixed(1)}, ${describeError(cell.error)}, ` +
      monthsAhead(cell.lead));
  return lines;
}

// Hovering the table or an actual in the chart, or moving focus through the
// table, selects one cell.
function connect(chart, table, showCell) {
  let current = null;

  function select(cell) {
    if (cell === current) return;
    current = cell;
    chart.highlightCell(cell);
    table.markCell(cell);
    showCell(cell);
  }

  // A finger lifting counts as leaving, which would clear every tap at once.
  const clearUnlessTouch = (event) => {
    if (event.pointerType !== 'touch') select(null);
  };

  const body = table.body.node();

  table.node.addEventListener('pointerover', (event) => {
    const target = event.target.closest('td.value, th.selects');
    if (target) select(d3.select(target).datum());
  });
  table.node.addEventListener('pointerleave', clearUnlessTouch);

  body.addEventListener('focusin', (event) => {
    const td = event.target.closest('td.value');
    if (td) select(d3.select(td).datum());
  });
  body.addEventListener('focusout', () => select(null));

  const moves = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
  };

  body.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      select(null);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();

    // Step past the blank cells of the staircase to the next value.
    const from = d3.select(event.target).datum();
    let row = from.row + move[0];
    let column = from.column + move[1];
    while (row >= 0 && row < body.rows.length && column >= 0 &&
           column < body.rows[0].cells.length - 1) {
      const td = body.rows[row].cells[column + 1];
      if (td.classList.contains('value')) {
        event.target.tabIndex = -1;
        td.tabIndex = 0;
        td.focus();
        return;
      }
      row += move[0];
      column += move[1];
    }
  });

  function selectActualUnderPointer() {
    select(chart.actualAt(d3.mouse(this)[0]));
  }

  chart.hitArea
    .on('pointermove', selectActualUnderPointer)
    .on('pointerdown', selectActualUnderPointer)
    .on('pointerleave', () => clearUnlessTouch(d3.event));
}

function renderSection(sectionId, model, yDomain, label, restText, layout) {
  const section = d3.select(`#${sectionId}`);
  const showCell = renderStatus(section.select('.chart-status'), restText);
  showCell(null);

  const container = section.select('.vis');
  container.selectAll('*').remove();
  const root = container.append('div').classed('stagger', true);
  const chart = renderChart(root, model, yDomain, layout);
  const table = renderTable(root, model, label, layout);
  connect(chart, table, showCell);
}

function computeLayout(monthCount) {
  if (!window.matchMedia(COMPACT_QUERY).matches) return FULL_LAYOUT;
  const available = document.querySelector('#real .vis').clientWidth;
  const columnWidth = Math.floor((available - COMPACT_MIN_HEADER) / monthCount);
  return {
    compact: true,
    columnWidth,
    headerWidth: available - columnWidth * monthCount,
    chartHeight: COMPACT_HEIGHT,
  };
}

d3.json('staggerchart.json', (error, data) => {
  if (error) throw error;

  const model = buildModel(data);
  renderFinding(model);
  renderTableKey();

  const perfect = perfectModel(model);
  // Both charts share a y-axis so they can be compared directly.
  const yDomain = d3.extent(model.cells.concat(perfect.cells), (cell) => cell.value);

  let renderedLayout = null;

  function render() {
    const layout = computeLayout(model.months.length);
    if (JSON.stringify(layout) === JSON.stringify(renderedLayout)) return;
    renderedLayout = layout;

    renderSection('real', model, yDomain,
      'Forecasts by month made and month forecast for',
      'Hover or tap an actual, or anything in the table, to see how the estimates ' +
      'for that month arrived and what was forecast from it.',
      layout);
    renderSection('perfect', perfect, yDomain,
      'Perfect forecasts by month made and month forecast for',
      'Each month is known from its first forecast, so its estimates stay flat ' +
      'until it arrives. The forecasts themselves run behind the actual line, and ' +
      'past it they all agree on one path.',
      layout);
  }

  render();
  window.addEventListener('resize', render);
});

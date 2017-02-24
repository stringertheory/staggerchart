// http://peterbeshai.com/scatterplot-in-d3-with-voronoi-interaction.html

d3.json('staggerchart.json', function (error, data) {

  var xAll = [];
  var yAll = [];
  var parseTime = d3.timeParse("%Y-%m");
  data['actual'].forEach(function (d) {
    d[0] = parseTime(d[0]);
    xAll.push(d[0]);
    yAll.push(d[1]);
  });
  data['prospective'].forEach(function (arr) {
    arr.forEach(function (d) {
      d[0] = parseTime(d[0]);
      xAll.push(d[0]);
      yAll.push(d[1]);
    });
  });
  data['retrospective'].forEach(function (arr) {
    arr.forEach(function (d) {
      d[0] = parseTime(d[0]);
      xAll.push(d[0]);
      yAll.push(d[1]);
    });
  });
  console.log(data);

  // outer svg dimensions
  const width = 1000;
  const height = 400;
  
  // padding around the chart where axes will go
  const padding = {
    top: 50,
    right: 50,
    bottom: 50,
    left: 50,
  };

  // inner chart dimensions, where the dots are plotted
  const squish = 1;
  const plotAreaWidth = width - padding.left - padding.right;
  const plotAreaHeight = height - padding.top - padding.bottom;

  // initialize scales
  const xScale = d3.scaleTime().range([0, plotAreaWidth])
        .domain(d3.extent(xAll));
  const yScale = d3.scaleLinear().range([plotAreaHeight, 0])
        .domain([0, d3.max(yAll)]);

  var line = d3.line()
      .x(function(d) { return xScale(d[0]); })
      .y(function(d) { return yScale(d[1]); });
  
  // select the root container where the chart will be added
  const container = d3.select('#vis-container');

  // initialize main SVG
  const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);

  // the main <g> where all the chart content goes inside
  const g = svg.append('g')
        .attr('transform', `translate(${padding.left} ${padding.top})`);

  // add in axis groups
  const xAxisG = g.append('g').classed('x-axis', true)
        .attr('transform', `translate(0 ${plotAreaHeight})`);

  const yAxisG = g.append('g').classed('y-axis', true);

  // set up axis generating functions
  const xTicks = Math.round(plotAreaWidth / 100);
  const yTicks = Math.round(plotAreaHeight / 50);

  const xAxis = d3.axisBottom(xScale)
        .ticks(xTicks);

  const yAxis = d3.axisLeft(yScale)
        .ticks(yTicks);

  // draw the axes
  yAxisG.call(yAxis);
  xAxisG.call(xAxis);

  g.append("path")
    .datum(data['actual'])
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("stroke-width", 3)
    .attr("d", line);
  
  data['prospective'].forEach(function (d) {
    g.append("path")
      .datum(d)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 0.5)
      .attr("d", line);
  });

  data['retrospective'].forEach(function (d) {
    g.append("path")
      .datum(d)
      .attr("fill", "none")
      .attr("stroke", "tomato")
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 0.5)
      .attr("d", line);
  });
  
});


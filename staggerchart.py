"""
Try to make a nice viz of a stagger chart.

http://a16z.com/2015/11/13/high-output-management/

http://tomtunguz.com/groves-stagger-chart/

http://www.nytimes.com/interactive/2010/02/02/us/politics/20100201-budget-porcupine-graphic.html

https://flowingdata.com/2015/01/08/japan-fertility-rate-forecasts-versus-reality/

"""
import sys
import csv
import json

def create_json(filename):
    """Create a JSON output from a CSV of the following data:
    https://docs.google.com/spreadsheets/d/11iqi_mjr5POMKEEVRQv1DwIQO7WBgnLP7qhzRFOd2mc/edit#gid=0

    """
    actual = []
    prospective = {}
    retrospective = {}

    with open(filename, newline='') as infile:

        reader = csv.reader(infile)

        # ignore first row
        next(reader)

        # pick out row with "forecast for" labels
        forecast_for_row = next(reader)

        for row in reader:
            forecast_made = row[0]
            for forecast_for, value in list(zip(forecast_for_row, row))[1:]:
                if value:
                    value = float(value)
                    prospective_item = [forecast_for, value]
                    retrospective_item = [forecast_made, value]
                    prospective.setdefault(forecast_made, []).append(prospective_item)
                    retrospective.setdefault(forecast_for, []).append(retrospective_item)

                    if forecast_made == forecast_for:
                        actual.append(prospective_item)

    actual_points = set(d[0] for d in actual)
    retrospective = {
        forecast_for: data
        for forecast_for, data in retrospective.items()
        if forecast_for in actual_points
    }

    data = {
        'actual': actual,
        'prospective': sorted(prospective.values()),
        'retrospective': sorted(retrospective.values()),
    }

    return json.dumps(data)

print(create_json(sys.argv[1]))

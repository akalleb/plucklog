
// get colors array from the string
function getChartColorsArray(chartId) {
    if (document.getElementById(chartId) !== null) {
        var colors = document.getElementById(chartId).getAttribute("data-colors");
        if (colors) {
            colors = JSON.parse(colors);
            return colors.map(function (value) {
                var newValue = value.replace(" ", "");
                if (newValue.indexOf(",") === -1) {
                    var color = getComputedStyle(document.documentElement).getPropertyValue(newValue);
                    if (color) return color;
                    else return newValue;
                } else {
                    var val = value.split(',');
                    if (val.length == 2) {
                        var rgbaColor = getComputedStyle(document.documentElement).getPropertyValue(val[0]);
                        rgbaColor = "rgba(" + rgbaColor + "," + val[1] + ")";
                        return rgbaColor;
                    } else {
                        return newValue;
                    }
                }
            });
        }
    }
}

// Sales Figures-100% Stacked Column Chart

var chartColumnStacked100Colors = getChartColorsArray("sales_figures");
if (chartColumnStacked100Colors) {
    var options = {
        series: [{
            name: 'New users',
            data: [44, 55, 41, 67, 22, 43, 21, 49, 30, 18, 46, 78, 34, 52],
        }, {
            name: 'Unique users',
            data: [13, 23, 20, 8, 13, 27, 33, 12, 10, 18, 22, 5, 10, 14]
        }],
        dataLabels: {
            enabled: false
        },
        chart: {
            type: 'bar',
            height: 400,
            stacked: true,
            stackType: '100%',
            toolbar: {
                show: false,
            },
            borderRadius: 30,
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                animateGradually: {
                    enabled: true,
                    delay: 150
                },
                dynamicAnimation: {
                    enabled: true,
                    speed: 350
                }
            }
        },
        stroke: {
            width: 3,
            colors: ['#fff']
        },

        plotOptions: {
            bar: {
                borderRadius: 6,
                columnWidth: '20%'
            },

        },
        responsive: [{
            breakpoint: 850,
            options: {
                chart: {
                    height: 300,
                },
                plotOptions: {
                    bar: {
                        columnWidth: '30%'
                    }
                }
            }
        },
        {
            breakpoint: 620,
            options: {
                series: [
                    {
                        data: [44, 55, 41, 67, 22, 43, 21, 49, 30],
                    },
                    {
                        data: [13, 23, 20, 8, 13, 27, 33, 12, 10]
                    }
                ],
                plotOptions: {
                    bar: {
                        columnWidth: '40%'
                    }
                }
            }
        },
        {
            breakpoint: 480,
            options: {
                legend: {
                    position: 'bottom',
                    offsetX: -10,
                    offsetY: 0
                }
            }
        },
        {
            breakpoint: 350,
            options: {
                series: [
                    {
                        data: [44, 55, 41, 67, 22, 43, 21],
                    },
                    {
                        data: [13, 23, 20, 8, 13, 27, 33]
                    }
                ],
                plotOptions: {
                    bar: {
                        columnWidth: '50%'
                    }
                }
            }
        }],
        xaxis: {
            categories: ['Jan', 'Feb', 'March', 'April', 'May', 'June',
                'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
            ],
        },
        fill: {
            opacity: 1
        },
        legend: {
            show: false
        },
        colors: chartColumnStacked100Colors,
    };

    var chart = new ApexCharts(document.querySelector("#sales_figures"), options);
    chart.render();
}

// Pattern Donut chart
var chartPiePatternColors = getChartColorsArray("pattern_chart");
if (chartPiePatternColors) {
    var options = {
        series: [44, 55, 41, 17, 15],
        chart: {
            height: 200,
            type: 'donut',
            dropShadow: {
                enabled: true,
                color: '#111',
                top: -1,
                left: 3,
                blur: 3,
                opacity: 0.2
            }
        },
        stroke: {
            width: 0,
        },
        plotOptions: {
            pie: {
                donut: {
                    labels: {
                        show: true,
                        total: {
                            showAlways: true,
                            show: true
                        }
                    }
                }
            }
        },
        labels: ["Comedy", "Action", "SciFi", "Drama", "Horror"],
        dataLabels: {
            enabled: false
        },
        fill: {
            type: 'pattern',
            opacity: 1,
            pattern: {
                enabled: true,
                style: ['circles', 'squares', 'horizontalLines', 'verticalLines', 'slantedLines'],
            },
        },
        states: {
            hover: {
                filter: 'none'
            }
        },
        theme: {
            palette: 'palette2'
        },
        legend: {
            show: false
        },
        colors: chartPiePatternColors,
        responsive: [
            {
                breakpoint: 1461,
                options: {
                    chart: {
                        height: '160px'
                    }
                }
            },
            {
                breakpoint: 1487,
                options: {
                    chart: {
                        height: '170px'
                    }
                }
            },
            {
                breakpoint: 1517,
                options: {
                    chart: {
                        height: '184px'
                    }
                }
            },

        ]
    };

    var chart = new ApexCharts(document.querySelector("#pattern_chart"), options);
    chart.render();
}

//semi_donut_chart
var chartSemiDonutColors = getChartColorsArray("semi_donut_chart");
if (chartSemiDonutColors) {
    var options = {
        series: [68, 55],
        chart: {
            height: 200,
            type: 'donut',
        },
        plotOptions: {
            pie: {
                startAngle: -90,
                endAngle: 90
            }
        },
        dataLabels: {
            enabled: false
        },
        legend: {
            show: false
        },
        labels: ['Earnings', 'Expenses'],
        colors: chartSemiDonutColors,
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    width: 200
                }
            }
        }]
    };

    if (document.querySelector("#semi_donut_chart")) {
        var chart = new ApexCharts(document.querySelector("#semi_donut_chart"), options);
        chart.render();
    }
}

// Basic Bar chart
var chartBarColors = getChartColorsArray("bar_chart");
if (chartBarColors) {
    var options = {
        chart: {
            height: 100,
            type: 'bar',
            toolbar: {
                show: false,
            }
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '20%'
            }
        },
        dataLabels: {
            enabled: false
        },
        series: [{
            data: [380, 430, 450, 475, 550, 584, 780, 1100, 1220, 1365]
        }],
        colors: chartBarColors,
        grid: {
            show: false,
        },
        xaxis: {
            labels: {
                show: false,
            }
        },
        yaxis: {
            show: false,
        }
    }
    var chart = new ApexCharts(document.querySelector("#bar_chart"), options);
    chart.render();
}

// Gradient Donut Chart
var chartPieGradientColors = getChartColorsArray("gradient_chart");
if (chartPieGradientColors) {
    var options = {
        series: [44, 55, 41, 17, 15, 40, 32, 28],
        chart: {
            height: 250,
            type: 'donut',
        },
        labels: ['Clothes', 'Decor ', 'Kitchen', 'Dining', 'Outdoor', 'Lighting', 'Men', 'Women '],
        plotOptions: {
            pie: {
                startAngle: -90,
                endAngle: 270,
            }
        },
        stroke: {
            width: 5,
            colors: ['#fff']
        },
        dataLabels: {
            enabled: false
        },
        fill: {
            type: 'gradient',
        },
        legend: {
            formatter: function (val, opts) {
                return val + " - " + opts.w.globals.series[opts.seriesIndex]
            }
        },
        legend: {
            show: false
        },
        colors: chartPieGradientColors
    };

    var chart = new ApexCharts(document.querySelector("#gradient_chart"), options);
    chart.render();
}

// Column with Negative Values
var chartNagetiveValuesColors = getChartColorsArray("monthly_states");
if (chartNagetiveValuesColors) {
    var options = {
        series: [{
            name: 'Cash Flow',
            data: [1.45, 5.42, -0.42, -12.6, -18.1, -11.1, -6.09, 3.88, 13.07,
                5.8, 8.1, -13.57, 15.75, 17.1, -27.03, -47.2, -43.3, -18.6, -
                48.6, -41.1, -39.6, -29.4
            ]
        }],
        chart: {
            type: 'bar',
            height: 228,
            toolbar: {
                show: false,
            }

        },
        plotOptions: {
            bar: {
                colors: {
                    ranges: [{
                        from: -100,
                        to: -46,
                        color: chartNagetiveValuesColors[1]
                    }, {
                        from: -45,
                        to: 0,
                        color: chartNagetiveValuesColors[2]
                    }]
                },
                columnWidth: '100%',

            }
        },
        dataLabels: {
            enabled: false,
        },
        colors: chartNagetiveValuesColors[0],
        yaxis: {
            labels: {
                formatter: function (y) {
                    return y.toFixed(0) + "k";
                }
            }
        },
        xaxis: {
            type: 'datetime',
            categories: [
                '2021-07-01', '2021-08-01', '2021-09-01', '2021-10-01', '2021-11-01',
                '2022-01-01', '2022-02-01', '2022-03-01', '2022-04-01', '2022-05-01',
                '2022-07-01', '2022-08-01', '2022-09-01', '2022-10-01', '2022-11-01',
                '2023-01-01', '2023-02-01', '2023-03-01', '2023-04-01', '2023-05-01',
                '2023-07-01', '2023-08-01', '2023-09-01'
            ],
            labels: {
                rotate: -90
            }
        },
        responsive: [{
            breakpoint: 1399,
            options: {
                chart: {
                    height: '268px',
                }
            }
        },
        {
            breakpoint: 1461,
            options: {
                chart: {
                    height: '190px',
                }
            }
        },
        {
            breakpoint: 1565,
            options: {
                chart: {
                    height: '200px',
                }
            }
        },
        {
            breakpoint: 1599,
            options: {
                chart: {
                    height: '210px',
                }
            }
        },

        {
            breakpoint: 1609,
            options: {
                chart: {
                    height: '220px',
                }
            }
        },

        ]
    };

    var chart = new ApexCharts(document.querySelector("#monthly_states"), options);
    chart.render();
}

// Products - Poly Radar Charts
var chartRadarPolyradarColors = getChartColorsArray("products");
if (chartRadarPolyradarColors) {
    var options = {
        series: [{
            name: 'Series 1',
            data: [48, 100, 40, 68, 56, 80, 92],
        }],
        chart: {
            height: 400,
            type: 'radar',
            toolbar: {
                show: false
            },
        },
        dataLabels: {
            enabled: false
        },
        plotOptions: {
            radar: {
                size: 140,
                polygons: {
                    strokeColor: '#e8e8e8',
                    fill: {
                        colors: ['#f8f8f8', '#fff']
                    }
                }
            }
        },
        colors: chartRadarPolyradarColors,
        markers: {
            size: 7,
            colors: ['#fff'],
            strokeColors: ['#38c66c', '#74788d', '#fe5b5b', '#4e7adf', '#41c3a9', '#ffd166', '#343a40'],
            strokeWidth: 5,
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    return val
                }
            }
        },
        xaxis: {
            categories: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        },
        yaxis: {
            tickAmount: 7,
            labels: {
                formatter: function (val, i) {
                    if (i % 2 === 0) {
                        return val
                    } else {
                        return ''
                    }
                }
            }
        },
        responsive:[{
            breakpoint: 420,
            options: {
                chart: {
                    height: '300',
                },
                plotOptions: {
                    radar: {
                        size: 110,
                    }
                },
            }
        }]
    };

    var chart = new ApexCharts(document.querySelector("#products"), options);
    chart.render();
}


// dumbbell_chart

var chartColumnDumbellColors = getChartColorsArray("user_traffic");
if (chartColumnDumbellColors) {
    var options = {
        series: [
            {
                data: [
                    {
                        x: '4am',
                        y: [2800, 4500]
                    },
                    {
                        x: '5am',
                        y: [3200, 4100]
                    },
                    {
                        x: '6am',
                        y: [2950, 7800]
                    },
                    {
                        x: '7am',
                        y: [3000, 4600]
                    },
                    {
                        x: '8am',
                        y: [3500, 4100]
                    },
                    {
                        x: '9am',
                        y: [4500, 6500]
                    },
                    {
                        x: '10am',
                        y: [4100, 5600]
                    }
                ]
            }
        ],
        chart: {
            height: 400,
            type: 'rangeBar',
            zoom: {
                enabled: false
            }
        },
        plotOptions: {
            bar: {
                isDumbbell: true,
                columnWidth: 3,
                dumbbellColors: [chartColumnDumbellColors]
            }
        },
        legend: {
            show: false
        },
        fill: {
            type: 'gradient',
            gradient: {
                type: 'vertical',
                gradientToColors: [chartColumnDumbellColors[1]],
                inverseColors: true,
                stops: [0, 100]
            }
        },
        grid: {
            xaxis: {
                lines: {
                    show: true
                }
            },
            yaxis: {
                lines: {
                    show: false
                }
            }
        },
        xaxis: {
            tickPlacement: 'on'
        }
    };

    var chart = new ApexCharts(document.querySelector("#user_traffic"), options);
    chart.render();
}
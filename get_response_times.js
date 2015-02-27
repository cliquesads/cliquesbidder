var winston = require('winston');
var math = require('mathjs');

var filename = process.argv[2];

// Set up winston logger instance
var logfile = path.join(
    process.env['HOME'],
    'logs',
    filename
);

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.File)({filename:logfile,timestamp:true})
    ]
});

var options = {
    start: 0,
    order: 'asc',
    fields: ['time'],
    limit: 1000000000000
};

var times = [];
logger.query(options, function(err, results){
    results.file.forEach(function(item) {
        if (item.time) {
            times.push(+item.time.replace('ms', ''));
        }
    });
    console.log("Mean (ms): " + math.mean(times));
    console.log("Median (ms): " + math.median(times));
    console.log("Min (ms): " + math.min(times));
    console.log("Max (ms): " + math.max(times));
});

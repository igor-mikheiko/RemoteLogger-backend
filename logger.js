
var cluster = require('cluster');
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./logger.conf', 'utf8'));

if (cluster.isMaster) {	
	console.log('Booting...');	

	if (!fs.existsSync(config.logs_directory)) {
		fs.mkdirSync(config.logs_directory, 0777);
	}
	
	var maxNodes = 1;

	if (config.maxNodes != undefined) {
		maxNodes = config.max_nodes;

		if (maxNodes == 0) {
			maxNodes = require('os').cpus().length;
		}		
	}

    for (var i = 0; i < maxNodes; i++) {
        cluster.fork();
    }
} else {
	var express = require('express');
	var bodyParser = require('body-parser')
	var dateFormat = require('dateformat');		
	var util = require('util');
	var multipart = require('connect-multiparty');
	var app = express();	
	
	var now = function () {
		return dateFormat(Date.now(), "yyyy-mm-dd h:MM:ss");
	};

	var contains = function (array, value) {
		for (var index in array) {
			if (value == array[index]) {
				return true;
			}
		}

		return false;
	}

	var llog = function (message) {
		var err = fs.appendFileSync(config.logs_directory + '/logger.log', message);
			
		if (err) {
			console.log(err.toString());
		}
	};

	app.use(bodyParser.urlencoded({extended: false}));
	app.use(bodyParser.json());
    
	app.post('/sync/:udid', function (req, res) {		
		if (req.is('json')) {
			var warnings = (req.body.warnings) ? req.body.warnings.toString() : '??';
			var errors = (req.body.errors) ? req.body.errors.toString() : '??';

			llog(util.format('%s [%s]\tLast stat for device, warnings: %s, errors: %s\n', now(), req.params.udid, warnings, errors));
			if (contains(config.watch, req.params.udid) && req.body.logs && req.body.logs.length > 0) {
				if (!fs.existsSync(config.logs_directory + '/' + req.params.udid)) {
					res.send({get_logs:req.body.logs});
				} else {
					var logsToObtain = [];
					var existingLogs = fs.readdirSync(config.logs_directory + '/' + req.params.udid);

					for (var index in req.body.logs) {
						if (req.body.logs[index].indexOf(".archived") < 0 || !contains(existingLogs, req.body.logs[index])) {
							logsToObtain.push(req.body.logs[index]);
						}
					}

					if (logsToObtain.length > 0) {
						res.send({get_logs:logsToObtain});
					} else {
						res.send({get_logs:[]});
					}
				}
				return;
			}				
			res.send({get_logs:[]});
		} else {
			res.send(400, {error: "Bad request."});
		}
	});

	app.post('/log/:udid', multipart(), function (req, res) {
		if (req.files && req.files.log) {
			var targetLogFilePath = config.logs_directory + '/' + req.params.udid + '/' + req.files.log.originalFilename;

			if (!fs.existsSync(config.logs_directory + '/' + req.params.udid)) {
				fs.mkdirSync(config.logs_directory + '/' + req.params.udid, 0777);
			} else {
				if (fs.existsSync(targetLogFilePath)) {
					fs.unlinkSync(targetLogFilePath)
				}
			}

			fs.createReadStream(req.files.log.path).pipe(fs.createWriteStream(targetLogFilePath));						
			res.send({});

			llog(util.format('%s [%s]\tObtained log file: %s\n', now(), req.params.udid, req.files.log.originalFilename));			
		} else {
			res.send(400, {error: "Bad request."});
		}
	});

	app.listen(config.listen);
	console.log('Worker ' + cluster.worker.id + ' running.');
}
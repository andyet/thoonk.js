var EventEmitter = require("events").EventEmitter;
var fs = require('fs');
var checkmark = '\033[1;32m.\033[0m';
var failmark = '\033[1;31mx\033[0m';
var failcolor = '\033[1;31m';
var assert = require('assert');

function LoadConfig(callback) {
    fs.readFile('testconfig.json', 'utf-8', function(err, data) {
        if(err) throw err;
        var config = JSON.parse(data);
        if(config.enabled) {
            callback(config);
        } else {
            callback(false);
        }
    });
}

function TestObject(should_events, start_function) {
    EventEmitter.call(this);
    this.check_events = should_events;
    this.error_events = [];
    this.good_events = [];
    this.manual_errors = [];
    this.time = 0;
    this.extra_tests = 0;
    this.start_function = start_function;
    this.configobj = {};

    this.config = function(config) {
        this.configobj = config;
    }

    this.start = function() {
        this.start_function(this.configobj);
    }

    this.add = function(eevent) {
        this.check_events.push(eevent);
    }

    this.test = function(success, msg) {
        this.extra_tests++;
        if(success) {
            process.stdout.write(checkmark);
            process.stdout.flush();
        } else {
            process.stdout.write(failmark);
            process.stdout.flush();
            this.manual_errors.push(msg);
        }
    }

    this.compare = function(item1, item2) {
        var pass = true;
        try {
            assert.deepEqual(item1, item2);
        } catch(err) {
            pass = false;
        }
        if(pass) {
            process.stdout.write(checkmark);
            process.stdout.flush();
            this.extra_tests += 1;
        } else {
            this.manual_errors.push(JSON.stringify(item1) + " != " + JSON.stringify(item2));
            process.stdout.write(failmark);
            process.stdout.flush();
        }
    }

    this.should = function(eevent) {
        if(this.check_events.indexOf(eevent) == -1) {
            this.error_events.push(eevent); 
            process.stdout.write(failmark);
            process.stdout.flush();
        } else {
            this.good_events.push(eevent);
            process.stdout.write(checkmark);
            process.stdout.flush();
        }
    }

    this.done = function(timeout) {
        if(this.error_events.length || this.manual_errors.length) {
            console.log(':');
            this.error_events.forEach(function(eevent, idx) {
               console.log('Event "' + eevent + '" should not have happened.'); 
            });
            this.manual_errors.forEach(function(msg, idx) {
                console.log(msg);
            });
            this.emit("done", this.configobj);
        } else if (this.good_events.length == this.check_events.length) {
            console.log(': ' + (this.extra_tests + this.good_events.length) + ' Successful tests.');
            this.emit("done", this.configobj);
        } else {
            if(this.time > timeout) {
                console.log(':');
                this.good_events.forEach(function(eevent, idx) {
                    delete(this.check_events[this.check_events.indexOf(eevent)]);
                }.bind(this));
                this.check_events.forEach(function(eevent, idx) {
                    console.log('Event "' + eevent + '" should have happened.'); 
                });
                this.emit("done", this.configobj);
            } else {
                var that = this;
                setTimeout(function() {
                    this.time += 1;
                    this.done(timeout);
                }.bind(that), 1000);
            }
        }
    }

}

TestObject.super_ = EventEmitter;
TestObject.prototype = Object.create(EventEmitter.prototype, {
    constructor: {
        value: TestObject,
        enumerable: false
    }
});

exports.TestObject = TestObject;
exports.LoadConfig = LoadConfig;

var EventEmitter = require("events").EventEmitter;

function TestObject(should_events) {
    EventEmitter.call(this);
    this.check_events = should_events;
    this.error_events = [];
    this.good_events = [];
    this.manual_errors = [];
    this.time = 0;
    this.extra_tests = 0;

    this.error = function(msg) {
        process.stdout.write("X");
        process.stdout.flush();
        this.manual_errors.push(msg);
    }

    this.compare = function(item1, item2) {
        if(item1 == item2) {
            process.stdout.write(".");
            process.stdout.flush();
            this.extra_tests += 1;
        } else {
            process.stdout.write("X");
            process.stdout.flush();
            this.manual_errors.push(item1 + " != " + item2);
        }
    }

    this.should = function(eevent) {
        if(this.check_events.indexOf(eevent) == -1) {
            this.error_events.push(eevent); 
            process.stdout.write("X");
            process.stdout.flush();
        } else {
            this.good_events.push(eevent);
            process.stdout.write(".");
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
            this.emit("done");
        } else if (this.good_events.length == this.check_events.length) {
            console.log(': ' + (this.extra_tests + this.good_events.length) + ' Successful tests.');
            console.log("Done!");
            this.emit("done");
        } else {
            if(this.time > timeout) {
                console.log(':');
                this.good_events.forEach(function(eevent, idx) {
                    delete(this.check_events[this.check_events.indexOf(eevent)]);
                }.bind(this));
                this.check_events.forEach(function(eevent, idx) {
                    console.log('Event "' + eevent + '" should have happened.'); 
                });
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

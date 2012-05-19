var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk,
    Job = require("../job").Job;

var tests = new TestObject([
    "publish: item1",
    "publish: item2",
    "publish: item3",
    "publish: item4",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    thoonk.registerType('Job', Job, function() {
        tests.on("done", function() {
            thoonk.quit();
        });
        thoonk.redis.flushdb();
        var testjob = thoonk.objects.Job("testjob1", {});
        testjob.init_subscribe();
        testjob.once("subscribe_ready", function () {
            //test publish and get
            testjob.publish("item1", function(err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("job: " + id);
            });
            testjob.get(0, function(err, item, id) {
                // console.log('item1 job.get cb:', arguments);
                tests.should("job: " + id);
                testjob.finish(id);
            });
            //test publish->get->cancel->get->finish
            testjob.publish("item2", function(err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("cancel: " + id);
                tests.add("job: " + id);
            });
            testjob.get(0, function(err, item, id) {
                // console.log('item2 job get cb', arguments);
                tests.should("cancel: " + id);
                testjob.cancel(id, function(err_msg, id) {
                    tests.test(!err_msg, err_msg);
                    testjob.get(0, function(err, item, id) {
                        tests.should("job: " + id);
                        testjob.finish(id);
                    });
                });
            });
        });
        var testjob1 = thoonk.objects.Job("testjob2", {});
        testjob1.init_subscribe();
        testjob1.once("subscribe_ready", function () {
            //test publish->get->stall->retry->get->finish
            testjob1.publish("item3", function(err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("job: " + id);
                tests.add("stall: " + id);
                tests.add("retry: " + id);
                tests.add("finish: " + id);
                tests.add("finished: " + id);
            }, null, null, function(err, id, result) {
                tests.should('finished: ' + id);
            });
            testjob1.get(0, function(err, item, id) {
                tests.should("stall: " + id);
                testjob1.stall(id, function(err_msg, id) {
                    tests.test(!err_msg, err_msg);
                    tests.should("retry: " + id)
                    testjob1.retry(id, function(err_msg, id) {
                        tests.test(!err_msg, err_msg);
                        tests.should("job: " + id);
                        tests.should("finished: " + id);
                        tests.should("finish: " + id);
                        testjob1.get(0, function(err, item, id) {
                            tests.add("finished: " + id);
                            testjob1.finish(id, function(err_msg, id, result) {
                                tests.test(!err_msg, err_msg);
                                tests.test(result, "expected result: 'weee'");
                            }, "weee");
                        });
                    });
                });
            });
        });
        var testjob2 = thoonk.objects.Job("testjob3", {});
        testjob2.init_subscribe();
        testjob2.once("subscribe_ready", function () {
            // test cancel -> getNumOfFailures -> retract
            testjob2.publish("item4", function (err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("job: " + id);
                tests.add("cancel: " + id);
                tests.add("retract: " + id);
            });
            testjob2.get(0, function (err, item, id) {
                tests.should("job: " + id);
                testjob2.cancel(id, function (err_msg, id) {
                    tests.test(!err_msg, err_msg);
                    tests.should("cancel: " + id);
                    testjob2.getNumOfFailures(id, function (err_msg, count) {
                        tests.compare(1, count);
                        testjob2.retract(id, function (err_msg, id) {
                            tests.should("retract: " + id);
                        });
                    });
                });
            });
        });
    });
});

exports.tests = tests;



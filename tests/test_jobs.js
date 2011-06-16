var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;

var tests = new TestObject([
    "publish: item1",
    "publish: item2",
    "publish: item3",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    tests.on("done", function() {
        thoonk.quit();
    });
    thoonk.mredis.flushdb();
    var testjob = thoonk.job("testjob1", {});
    testjob.once("ready", function() {
        //test publish and get
        testjob.publish("item1", function(item, id) {
            tests.should("publish: " + item);
            tests.add("job: " + id);
        });
        testjob.get(0, function(item, id) {
            tests.should("job: " + id);
            testjob.finish(id);
        });
        //test publish->get->cancel->get->finish
        testjob.publish("item2", function(item, id) {
            tests.should("publish: " + item);
            tests.add("cancel: " + id);
            tests.add("job: " + id);
        });
        testjob.get(0, function(item, id) {
            tests.should("cancel: " + id);
            testjob.cancel(id, function(id, err_msg) {
                tests.test(!err_msg, err_msg);
                testjob.get(0, function(item, id) {
                    tests.should("job: " + id);
                    testjob.finish(id);
                });
            });
        });
        //test publish->get->stall->retry->get->finish
        testjob.publish("item3", function(item, id) {
            tests.should("publish: " + item);
            tests.add("stall: " + id);
            tests.add("job: " + id);
            tests.add("finish: " + id);
        });
        testjob.get(0, function(item, id) {
            tests.should("stall: " + id);
            testjob.stall(id, function(id, err_msg) {
                tests.test(!err_msg, err_msg);
                testjob.retry(id, function(id, err_msg) {
                    tests.test(!err_msg, err_msg);
                    tests.should("job: " + id);
                    testjob.get(0, function(item, id) {
                        testjob.finish(id, function(id, err_msg) {
                            tests.test(!err_msg, err_msg);
                            tests.should("finish: " + id);
                        });
                    });
                });
            });
        });
    });
});

exports.tests = tests;



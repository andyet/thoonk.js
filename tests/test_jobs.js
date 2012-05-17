var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk,
    Job = require("../job").Job;

var tests = new TestObject([
    "publish: item1",
    "publish: item2",
    "publish: item3",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    thoonk.registerType('Job', Job, function() {
        tests.on("done", function() {
            thoonk.quit();
        });
        thoonk.redis.flushdb();
        var testjob = thoonk.objects.Job("testjob1", {});
        testjob.init_subscribe();
            //test publish and get
            testjob.publish("item1", function(err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("job: " + id);
            });
            testjob.get(1, function(err, item, id) {
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
            //test publish->get->stall->retry->get->finish
            testjob.publish("item3", function(err, item, id) {
                tests.should("publish: " + JSON.parse(item));
                tests.add("stall: " + id);
                tests.add("job: " + id);
                tests.add("finish: " + id);
                tests.add("finished:" + id);
            }, null, null, function(err, feed, id, result) {
                tests.should('finished:' + id);
            });
            testjob.get(0, function(err, item, id) {
                tests.should("stall: " + id);
                testjob.stall(id, function(err_msg, id) {
                    tests.test(!err_msg, err_msg);
                    testjob.retry(id, function(err_msg, id) {
                        tests.test(!err_msg, err_msg);
                        tests.should("job: " + id);
                        testjob.get(0, function(err, item, id) {
                            testjob.finish(id, function(err_msg, id) {
                                tests.test(!err_msg, err_msg);
                                tests.should("finish: " + id);
                            }, "weee");
                        });
                    });
                });
            });
        // });
    });
});

exports.tests = tests;



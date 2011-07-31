var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;

var tests = new TestObject([
    "publish:1: neehaw",
    "publish:2: neehaw2",
    "publish:3: neehaw3",
    "publish:4: neehaw4",
    "publish:5: neehaw5",
    "publish:6: neehaw6",
    "retract:1",
    "retract:2",
    "ids:3,4,5,6",
    "retract:6",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    tests.on("done", function() {
        thoonk.quit();
    });
    thoonk.mredis.flushdb();
    var testfeed = thoonk.feed("testfeed1", {'max_length': 4});
    testfeed.once("ready", function() {
        testfeed.subscribe({
            publish: function(feed, id, msg) {
                //console.log("publish:" + id + ": " + msg);
                tests.should("publish:" + id + ": " + msg);
            },
            edit: function(feed, id, msg) {
                console.log("updated");
            },
            retract: function(feed, id) {
                tests.should("retract:" + id);
            }, 
            position: function() {
                //position placeholder
            },
            done: function() {
                testfeed.publish("neehaw", "1");
                testfeed.publish("neehaw2", "2");
                testfeed.publish("neehaw3", "3");
                testfeed.publish("neehaw4", "4");
                testfeed.publish("neehaw5", "5");
                testfeed.publish("neehaw6", "6", function() {
                    testfeed.getIds(function(err, ids) {
                        tests.should("ids:" + ids.join(','));
                    });
                    testfeed.getAll(function(err, all) {
                        var other = {'3': "neehaw3", '4': "neehaw4", '5': "neehaw5", '6': "neehaw6"};
                        tests.compare(all, other);
                        testfeed.retract("6", function(id, err) {
                        });
                    });
                });
            }
        });
    });
});

exports.tests = tests;



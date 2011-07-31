var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;

var tests = new TestObject([
    "publish:1: neehaw",
    "publish:2: neehaw2",
    "publish:3: neehaw3",
    "publish:4: neehaw4",
    "publish:5: neehaw5",
    "publish:6: neehaw6",
    "ids:1,2,3,4,5,6",
    "move:2,3,4,5,6,1",
    "position:1 :end",
    "position:1 :end",
    "position:2 :end",
    "position:3 :end",
    "position:4 :end",
    "position:5 :end",
    "position:6 :end",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    tests.on("done", function() {
        thoonk.quit();
    });
    thoonk.mredis.flushdb();
    var testfeed = thoonk.sortedFeed("testfeed1", {'max_length': 4});
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
            position: function(feed, id, position) {
                tests.should("position:" + id + " " + position);
            },
            done: function() {
                testfeed.publish("neehaw");
                testfeed.publish("neehaw2");
                testfeed.publish("neehaw3");
                testfeed.publish("neehaw4");
                testfeed.publish("neehaw5");
                testfeed.publish("neehaw6", function() {
                    testfeed.getIds(function(err, ids) {
                        tests.should("ids:" + ids.join(','));
                    });
                    testfeed.getAll(function(err, all) {
                        var other = {'1': 'neehaw', '2': 'neehaw2', '3': "neehaw3", '4': "neehaw4", '5': "neehaw5", '6': "neehaw6"};
                        tests.compare(all, other);
                        testfeed.moveEnd("1", function(err_msg, id, placement) {
                            testfeed.getIds(function(err, ids) {
                                tests.should("move:" + ids.join(','));
                            });
                        });
                    });
                });
            }
        });
    });
});

exports.tests = tests;

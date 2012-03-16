var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;
var Feed  = require('../feed').Feed;

var tests = new TestObject([
    "publish:1: neehaw",
    "publish:2: neehaw2",
    "publish:3: neehaw3",
    "publish:4: neehaw4",
    "publish:5: neehaw5",
    "publish:6: neehaw6",
    'publishid:4: 4neehaw4',
    "retract:1",
    "retract:2",
    "ids:3,4,5,6",
    "retract:6",
    "hasId4:true",
    "hasId1:false",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    thoonk.registerType('Feed', Feed, function() {});
    tests.on("done", function() {
        thoonk.quit();
    });
    thoonk.redis.flushdb();
    var testfeed = thoonk.objects.Feed('testfeed1');//thoonk.feed("testfeed1", {'max_length': 4});
    testfeed.init_subscribe();
    testfeed.on('publish', function(id, item) {
        tests.should("publish:" + id +": " + item);
    });
    testfeed.once('publishid:4', function(id, item) {
        tests.should('publishid:4: ' + id + item);
    });
    testfeed.once("subscribe_ready", function() {
        /*
        testfeed.subscribeId('4', {
            publish: function(feed, id, msg) {
                tests.should('publishid:4: ' + id + msg);
            }
        });
        */
        /*
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
        */
           // done: function() {
        testfeed.create({max_length:4}, function() {
                testfeed.publish("neehaw", "1");
                testfeed.publish("neehaw2", "2");
                testfeed.publish("neehaw3", "3");
                testfeed.publish("neehaw4", "4");
                testfeed.publish("neehaw5", "5");
                testfeed.publish("neehaw6", "6", function() {
                    testfeed.get('4', function() {
                        //console.log(arguments);
                    });
                    testfeed.getIds(function(err, ids) {
                        tests.should("ids:" + ids.join(','));
                    });
                    testfeed.hasId('4', function(err, result) {
                        console.log(arguments);
                        tests.should('hasId4:' + result);
                    });
                    testfeed.hasId('1', function(err, result) {
                        console.log(arguments);
                        tests.should('hasId1:' + result);
                    });
                    /*
                    testfeed.getAll(function(err, all) {
                        var other = [{id: '3', item: "neehaw3"}, {id:'4', item: "neehaw4"}, {id: '5', item: "neehaw5"}, {id:'6',item: "neehaw6"}];
                        tests.compare(all, other);
                        testfeed.retract("6", function(id, err) {
                        });
                    });
                    */
                });
            //}
        });
    });
});

exports.tests = tests;



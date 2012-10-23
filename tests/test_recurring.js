var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;
var Recurring  = require('../recurring').Recurring;

var tests = new TestObject([
    "create_err:null",
    "add:a",
    "add:b",
    "add:c",
    "add:whatever yo http://google.com",
    "length:4",
    "remove:null",
    "get_err:null",
    "behind:3",
], function(config) {
    var thoonk = new Thoonk(config.host, config.port, config.db);
    thoonk.registerType('Recurring', Recurring, function() {
    //});
        tests.on("done", function() {
            thoonk.quit();
        });
        thoonk.redis.flushdb();
        var testrec = thoonk.objects.Recurring('testrecurring1');
        testrec.create({timeout: 0}, function(err) {
            tests.should('create_err:' + err);
            testrec.add("a", function(err, task, time) {
                tests.should('add:' + task);
            });
            testrec.add("b", function(err, task, time) {
                tests.should('add:' + task);
            });
            testrec.add("c", function(err, task, time) {
                tests.should('add:' + task);
            });
            testrec.add("whatever yo http://google.com", function(err, task, time) {
                tests.should('add:' + task);
                testrec.length(function(err, length) {
                    tests.should("length:" + length);
                    testrec.remove("c", function(err) {
                        tests.should("remove:"+err);
                        testrec.get(function(err, task, time) {
                            tests.should("get_err:"+err);
                            setTimeout(function() {
                                testrec.behind(function(err, behind) {
                                    tests.should("behind:"+behind);
                            })}, 2000);
                        });
                    });
                });
            });
        });
    });
});

exports.tests = tests;

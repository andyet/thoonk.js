var TestObject = require("./testcore").TestObject,
    Thoonk = require("../thoonk").Thoonk;

var tests = new TestObject([
    "publish:1: neehaw",
]);


var thoonk = new Thoonk();
tests.on("done", function() {
    thoonk.quit();
});
thoonk.mredis.flushdb();
var testfeed = thoonk.feed("testfeed1", {'max_length': 4});
testfeed.once("ready", function() {
    testfeed.subscribe(
        function(id, msg) {
            //console.log("publish:" + id + ": " + msg);
            tests.should("publish:" + id + ": " + msg);
        },
        function(id, msg) {
        },
        function(id, msg) {
        }, 
        function() {
            testfeed.publish("neehaw", "1");
        }
    );
});
tests.done(1);



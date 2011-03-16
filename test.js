var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var happy = thoonk.feed("happy", {'type': 'feed'});
happy.once("ready", function () {
    console.log(thoonk.feeds);
    happy.subscribe(
        function(id, msg) {
            console.log("happy -> [" + id + "]: " + msg);
        },
        function(id) {
            //retract callback required
        }
    );
    console.log("starting...");
    happy.publish("neehaw", "1");
    happy.publish("neehaw2", "1");
    happy.publish("neehaw3", "1");
    happy.publish("neehaw4", "1");
    happy.publish("neehaw5", "1");
    happy.get_item("1", function(err, reply) {
        console.log(reply);
    });
    happy.publish("neehaw6", "1");
    happy.get_item("1", function(err, reply) {
        console.log(reply);
    });
});

var queue = thoonk.queue("queue", {'type': 'queue'});
queue.once("ready", function () {
    console.log(thoonk.feeds);
    console.log("---> " + queue.name);
    queue.put("crraaaaap");
    queue.get(0, function(item, id) {
        console.log("Got!!!! [" + id + "]: " + item);
    });
});

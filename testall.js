var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var happy = thoonk.feed("happy", {'type': 'feed', 'max_length': 4});
happy.once("ready", function () {
    console.log(thoonk.feeds);
    console.log("ready?");
    happy.subscribe(
        function(id, msg) {
            console.log("published -> happy[" + id + "]: " + msg);
        },
        function(id, msg) {
            console.log("updated -> happy[" + id + "]: " + msg);
        },
        function(id) {
            console.log("retracted -> happy[" + id + "]");
        },
        function() {
            happy.publish("neehaw", "1");
            happy.publish("neehaw2", "2");
            happy.publish("neehaw3", "3");
            happy.publish("neehaw4", "4");
            happy.publish("neehaw5", "5");
            console.log("starting...");
            happy.getItem("1", function(err, reply) {
                console.log("getting one", reply);
            });
            happy.publish("neehaw6", "1");
            happy.getItem("1", function(err, reply) {
                console.log("getting one", reply);
            });
            happy.publish("neehaw7", "1");
            happy.publish("neehaw8", "1");
            happy.publish("neehaw9", "1");
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

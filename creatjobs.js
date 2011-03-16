var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var job = thoonk.job("testjobs", {'type': 'job'});
job.once("ready", function() {
    var d = new Date();
    var start = d.getTime();
    for(var i=0; i<40000; i++) {
        job.publish(i);
    }
    var ed = new Date();
    var end = ed.getTime();
    console.log(end - start);
    thoonk.quit();
});

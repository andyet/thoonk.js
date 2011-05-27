var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var job = thoonk.job("testjobs", {'type': 'job'});
job.once("ready", function() {
    var d = new Date();
    var start = d.getTime();
    var thecall = function (id, item, err) {
        if(item % 100 == 0) {
            console.log(item);
        }
        if(item == 39999) {
            var ed = new Date();
            var end = ed.getTime();
            var finish = end - start;
            console.log(finish, 40000/(finish/1000));
            console.log("done ", i);
            thoonk.quit();
        }

    }
    for(var i=0; i<40000; i++) {
        job.publish(i, thecall);
    }
});

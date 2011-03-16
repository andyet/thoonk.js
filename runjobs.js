var thoonk_module = require("./thoonk");
var thoonk = new thoonk_module.Thoonk();
var job = thoonk.job("testjobs", {'type': 'job'});
job.once("ready", function() {
    var idx = 0;
    var start;
    var end;
    function getjob() {
        if(idx == 0) {
           var d = new Date();
           start = d.getTime();
        }
        idx++;
        job.get(0, function(item, id) {
            job.finish(id);
            if(idx < 39999) {
                getjob();
            } else {
                var de = new Date();
                end = de.getTime();
                console.log(end - start);
                console.log(idx);
                thoonk.quit();
            }
        }, function() {
            console.log("error?");
        });
    }
    setTimeout(getjob(), 1000);
});

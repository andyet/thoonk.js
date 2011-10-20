var Thoonk = require('../thoonk').Thoonk;
var thoonk = new Thoonk();

var jobs = {};
var stats = thoonk.feed('thoonk_job_stats');


thoonk.mredis.smembers('feeds', function(err, feeds) {
    feeds.forEach(function(name) {

        thoonk.mredis.hget('feed.config:' + name, 'type', function(err, reply) {
            if(reply == 'job') {
                jobs[name] = thoonk.job(name);
            }
        });
    });
});

thoonk.on('create', function(name, instance) {
    thoonk.mredis.hget('feed.config:' + name, 'type', function(err, reply) {
        if(reply == 'job') {
            jobs[name] = thoonk.job(name);
        }
    });
});

thoonk.on('delete', function(name, instance) {
    if(jobs.hasOwnProperty(name)) {
        jobs[name].quit();
        delete jobs[name];
    };
});

var update = function() {
    for(key in jobs) { //function(job, key) {
        (function(key, jobs) {
            var multi = thoonk.mredis.multi();
            multi.llen('feed.ids:' + key);
            multi.getset('feed.publishes:' + key, '0');
            multi.getset('feed.finishes:' + key, '0');
            multi.zcount('feed.claimed:' + key,'0', '999999999999999');
            multi.hlen('feed.items:' + key);
            multi.exec(function(err, reply) {
                console.log('----' + key + '----');
                console.log('available:', reply[0]);
                console.log('publishes:', reply[1]);
                console.log('finishes:', reply[1]);
                console.log('claimed:', reply[3]);
                console.log('total:', reply[4]);
                stats.publish(JSON.stringify({available: reply[0], publishes: reply[1], finishes: reply[2], claimed: reply[3], total:reply[4]}), key)
            });
        })(key, jobs);
    }
    setTimeout(update, 1000);
};

update();

var http = require('http');
var static = require('node-static');
var fileServer = new(static.Server)('./monitor-html');

var server = http.createServer(function(request, response) {
    request.addListener('end', function () {
        fileServer.serve(request, response);
    });
});
server.listen(8000);

var io = require('socket.io').listen(8001);

io.sockets.on('connection', function (socket) {
    var thissocket = socket;
    var statupdate = function(feed, id, item) {
        var uitem = JSON.parse(item);
        uitem.id = id;
        console.log('msg', feed, item, id);
        socket.emit('message', uitem);
    };

    stats.subscribe({
        edit: statupdate,
        publish: statupdate
    });

    socket.once('disconnect', function() {
        stats.unsubscribe({edit: statupdate, publish: statupdate});
    });
});


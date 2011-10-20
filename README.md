# Thoonk #

Thoonk is a persistent (and fast!) system for push feeds, queues, and jobs which
leverages Redis. Thoonk.js is the Node.js implementation of Thoonk, and is
interoperable with other versions of Thoonk (currently Thoonk.py for Python).

# Feed Types #

## Feed ##

The core of Thoonk is the feed. A feed is a subject that you can publish items
to (string, binary, json, xml, whatever), each with a unique id (assigned or
generated). Other apps and services may subscribe to your feeds and recieve
new/update/retract notices on your feeds. Each feed persists published items
that can later be queried. Feeds may also be configured for various behaviors,
such as max number of items, default serializer, friendly title, etc.

Feeds are useful for clustering applications, delivering data from different
sources to the end user, bridged peering APIs (pubsub hubbub, XMPP Pubsub,
maintaining ATOM and RSS files, etc), persisting, application state,
passing messages between users, taking input from and serving multiple APIs
simultaneously, and generally persisting and pushing data around.

## Queue ##

Queues are stored and interacted with in similar ways to feeds, except instead
of publishes being broadcast, clients may do a "blocking get" to claim an item,
ensuring that they're the only one to get it. When an item is delivered, it is
deleted from the queue.

Queues are useful for direct message passing.

## Sorted Feed ##

Sorted feeds are unbounded, manually ordered collections of items. Sorted feeds
behave similarly to plain feeds except that items may be edited in place or
inserted in arbitrary order.

## Job ##

Jobs are like Queues in that one client claims an item, but that client is also
required to report that the item is finished or cancel execution. Failure to to
finish the job in a configured amount of time or canceling the job results in
the item being reintroduced to the available list. Unlike queues, job items are
not deleted until they are finished.

Jobs are useful for distributing load, ensuring a task is completed regardless
of outages, and keeping long running tasks away from synchronous interfaces.

# Installation #

    npm install thoonk


## Running the Tests ##

After checking out a copy of the source code, you need to edit the
testconfig.json file to enable it. The test suite will DESTROY the database
configured. Then run:

    node testall.js


# Using Thoonk #

## Initializing ##

    var Thoonk = require("thoonk").Thoonk;
    var thoonk = new Thoonk(host, port, db)

Or, you can use:

    var thoonk = require("thoonk").createClient(host, port, db);

## Creating a Feed ##

    feed = thoonk.feed(feed_name, {"max_length": 50})
    //will create a feed if it doesn't exist -- config optional.
    feed.once("ready", function() {
        //manipulate the feed
    });

The same is true for queues, jobs, and sorted feeds:
    
    test_queue = thoonk.queue('queue name');
    test_job = thoonk.job('job channel name');
    test_list = thoonk.sortedFeed('sorted feed name');

## Re-configuring a Feed ##

    thoonk.setConfig(feed_name, json_config)

### Supported Configuration Options ###

* type: feed/queue/job
* max\_length: maximum number of items to keep in a feed


## Using a Feed ##

    feed = thoonk.feed('test_feed');


## Subscribing to a Feed ##

    feed.subscribe({
        publish: function(feed, id, item) {
            //publish event
        },
        edit: function(feed, id, item) {
            //edit event
        },
        retract: function(feed, id) {
            //retract event
        },
        position: function(feed, id, position) {
            //position event for sorted feed
            //position is begin:, :end, :X, X: where X is the relative id
        },
        done: function() {
            //subscription ready
        }
    });

## Subscribing to Pattern/Namespace  ##

Just like subscribing to a feed, you can subscribe to a series of feeds using a pattern.
The pattern uses asterisks (*) for matching.

    thoonk.namespaceSubscribe('somepattern*', {
        publish: function(feed, id, item) {
            //publish event
        },
        edit: function(feed, id, item) {
            //edit event
        },
        retract: function(feed, id) {
            //retract event
        },
        position: function(feed, id, position) {
            //position event for sorted feed
            //position is begin:, :end, :X, X: where X is the relative id
        },
        done: function() {
            //subscription ready
        }
    });

### Position Events 

- `:42`    -- Moved before existing item ID 42.
- `42:`    -- Moved after existing item ID 42.
- `begin:` -- Moved to beginning of the feed.
- `:end`   -- Moved to the end of the feed.

### Publishing to a Feed ###

Publishing to a feed adds an item to the end of the feed, sorted by publish time.

    feed.publish('item contents', 'optional id', function(item, id) {
        //done publishing!
    });

Editing an existing item in the feed can be done by publishing with the same ID as
the item to replace. The edited version will be moved to the end of the feed.

Since IDs are unique within the feed, it is possible to use a feed as a basic set
structure by only working the IDs and not with the item contents.

### Retracting an Item ###

Removing an item is done through retraction, which simply requires the ID of the
item to remove.

    feed.retract('item id', function(id, error) {
        //success?
    });

### Retrieving a List of Item IDs ###

Retrieving all of the IDs in the feed provides the order in which items appear.
   
    feed.getIds(function(err, reply) {
        //check the reply object
    });

### Retrieve a Dictionary of All Items ###

Retrieving a dictionary of all items, keyed by item ID is doable using:

    items = feed.getAll(function(err, reply) {
    });

### Retrieving a Specific Item ###

A single item may be retrieved from the feed if its ID is known.

    item = feed.getItem('item id', function(err, reply) {
        //
    });

## Using a Sorted Feed ##

A sorted feed is similar to a normal feed, except that the ordering of the
items can be modified, and there is no bound on the number of items.

Sorted feeds do not automatically rearrange items for you, ordering is
performed manually.

    sorted_feed = thoonk.sortedFeed('sortedfeed_name')

### Inserting an Item in a Sorted Feed ###

Inserting an item may be done in four places:

At the beginning of the feed.

    sorted_feed.prepend('new first item', function(item, id) {
        //done callback
    });

At the end of the feed.

    sorted_feed.append('new last item', function(item, id) {
    });
    sorted_feed.publish('another new last item', function(item, id) {
    });

Before an existing item.

    sorted_feed.publishBefore('existing id', 'new item', function(item, id) {
    });

After an existing item.

    sorted_feed.publishAfter('existing id', 'new item', function(item, id) {
    });

### Moving an Item ###

    sorted_feed.moveBefore('existing id', 'relative id', function(err_msg, id, placement) {
    });
    sorted_feed.moveAfter('existing id', 'relative id', function(err_msg, id, placement) {
    });
    sorted_feed.moveBegin('existing id', function(err_msg, id, placement) {
    });
    sorted_feed.moveEnd('existing id', function(err_msg, id, placement) {
    });

## Using a Queue ##

    queue = thoonk.queue('queue_feed')

### Publishing To a Queue ###

A normal put is FIFO while setting the last attrib to true, it is LIFO

    queue.put('item', function(item, id) {
    }, false);
    queue.put('priority item', function(item, id) {
    }, true);

### Popping a Queue ###
    A timeout of null or 0 will wait forever.

    queue.get(0, function(item, id, error) {
    });
    //wait up to 5 seconds, will get error if no items are published
    queue.get(5, function(item, id, error) {
    });

## Using a Job Feed ##

A job feed is a queue of individual jobs; there is no inherent relationship between jobs from the
same job feed.

    job = thoonk.job('job_feed')

### Publishing a Job ###

Creating new jobs is done by putting them in the job queue. New items are placed at the end of the
queue, but it is possible to insert high priority jobs at the front.

    job.put('job contents', function(item, id) {
    });
    job.put('priority job', function(item, id) {
    }, true);

### Claiming a Job ###

Workers may pull jobs from the queue by claiming them using the `get()` method. The default behaviour
is to block indefinitely while waiting for a job, but a timeout value in seconds may be supplied
instead.

    data = job.get(0, function(item, id, timedout) {
    });
    timed_data = job.get(5, function(item, id, timedout) {
    });

### Cancelling a Job Claim ###

Cancelling a job is done by a worker who has claimed the job. Cancellation relinquishes the claim to
the job and puts it back in the queue to be given to another worker.

    job.cancel('job id', function(id, err_msg) {
    });

### Stalling a Job ###

Stalling a job removes it from the queue to prevent it from executing, but does not completely
delete it. A stalled job is effectively paused, waiting for whatever issue that required the
stall to be resolved.

    job.stall('job id', function(id, err_msg) {
    });

### Retrying a Stalled Job ###

Once a job jas been stalled, it can be retried once the issue requiring stalling has been
resolved.

    job.retry('job id', function(id, err_msg) {
    });

### Retracting a Job ###

Retracting a job completely removes it from the queue, preventing it from being executed.

    job.retract('job id', function(id, err_msg) {
    });

### Finishing a Job ###

Finishing a job can be done in three ways. The first is as a simple acknowledgment that the task
has been completed.

    job.finish('job id', function(id, err_msg) {
    });

The second is when there is result data that should be returned to the job owner. The `result=True`
parameter is used since it is possible for `None` to be an actual job result.

    job.finish('job id', function(id, err_msg) {
    }, 'result contents')

It may also be desired to only keep job results around for a short period of time. In which case,
a timeout parameter may be added.

    job.finish('job id', function(id, err_msg) {
    }, 'result contents', 300)

### Check Job Results ###

Checking the result of a job can require knowing what the original job request actually was.
Thus, the `get_result` method will return both values.

    job.getResult('job id', 300, function(id, result, error_bool) {
    });

# The Future of Thoonk #

* Examples and functions for Job Maintainance
* Live Sets
* Live Queries of Feeds based on Live Sets
* Advanced "Job Requirements" Job Feed
* Lots of examples of clustering, distributing concerns, and tools.
* SleekPubsub2 (XMPP XEP-0600 Publish-Subscribe) process to interact with your feeds.
* More implementations like Ruby, Java, C, .NET -- please contribute!

# Writing Your Own Implementation or Peer #

See contract.txt for generating your own implementation that will work with Thoonk.py and Thoonk.js.

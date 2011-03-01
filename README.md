# Thoonk #

Thoonk is a persistent (and fast!) system for push feeds, queues, and jobs which leverages Redis. Thoonk.js is the node.js implementation of Thoonk, and is interoperable with other versions of Thoonk (currently Thoonk.py).

# Feed Types #

## Feed ##

The core of Thoonk is the feed. A feed is a subject that you can publish items to (string, binary, json, xml, whatever), each with a unique id (assigned or generated). Other apps and services may subscribe to your feeds and recieve new/update/retract notices on your feeds. Each feed persists published items that can later be queried. Feeds may also be configured for various behaviors, such as max number of items, default serializer, friendly title, etc.

Feeds are useful for clustering node.js apps, delivering data from different sources to the end user (possibly through socket.io), bridged peering APIs (pubsub hubbub, XMPP Pubsub, maintaining ATOM and RSS files, etc), persisting node.js app state, passing messages between users, taking input from and serving multiple APIs simultaneously, and generally persisting and pushing data around.

## Queue ##
Queues are stored and interacted with in similar ways to feeds, except instead of publishes being broadcast, clients may do a "blocking get" to claim an item, ensuring that they're the only one to get it. When an item is delivered, it is deleted from the queue.

Queues are useful for direct message passing.

## Job ##

Jobs are like Queues in that one client claims an item, but that client is also required to report that the item is finished or cancel execution. Failure to to finish the job in a configured amount of time or canceling the job results in the item being reintroduced to the available list. Unlike queues, job items are not deleted until they are finished.

Jobs are useful for distributing load, ensuring a task is completed regardless of outages, and keeping long running tasks away from synchronous interfaces.

# Installation #

In theory, if I publish the package correctly, then this should work.

    npm install thoonk

## Requirements ##

Thoonk requires npm packages node-uuid & redis. I strongly recommend installing the hiredis package as well, since it should significantly increase performance.

    npm install node-uuid hiredis redis

## Running the Tests ##

After you install, you should really run the test suite.

# Using Thoonk #

## Initializing ##

## Creating a Feed ##

## Configuring a Feed ##

### Supported Configuration Options ###

## Using a Feed ##

### Publishing to a Feed ###

### Subscribing to a Feed ###

### Retracting an Item ###

### Retrieving a List of Items ###

### Retrieving a Specific Item ###

## Using a Queue ##

### Publishing To a Queue ###

### Popping a Queue ###

## Using a Job Feed ##

### Publishing a Job ###

### Claiming a Job ###

### Cancelling a Job Claim ###

### Stalling a Job ###

### Retrying a Stalled Job ###

### Retracting a Job ###

# Writing Your Own Implementation or Peer #

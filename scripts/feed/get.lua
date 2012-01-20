--name, id
return redis.call('hget', 'feed.items:'..ARGV[1], ARGV[2]);

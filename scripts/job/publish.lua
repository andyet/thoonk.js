-- ARGV: name, id, item, time, priority
if ARGV[5] == nil then
    redis.call('lpush', 'feed.ids:'..ARGV[1], ARGV[2]);
else
    redis.call('rpush', 'feed.ids:'..ARGV[1], ARGV[2]);
end
redis.call('incr', 'feed.publishes:'..ARGV[1]);
redis.call('hset', 'feed.items:'..ARGV[1], ARGV[2], ARGV[3]);
return redis.call('zadd', 'feed.published:'..ARGV[1], ARGV[4], ARGV[2]);

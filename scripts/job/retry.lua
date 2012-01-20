-- ARGV: name, id, time
if redis.call('srem', 'feed.stalled:'..ARGV[1], ARGV[2]) == 0 then
    return false;
end
redis.call('lpush', 'feed.ids:'..ARGV[1], ARGV[2]);
redis.call('zadd', 'feed.published:'..ARGV[1], ARGV[3], ARGV[2]);
return true

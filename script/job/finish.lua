--TODO check for id in feed.claimed
redis.call('zrem', 'feed.claimed:'..ARGV[1], ARGV[2]);
redis.call('hdel', 'feed.cancelled:'..ARGV[1], ARGV[2]);
redis.call('zrem', 'feed.published:'..ARGV[1], ARGV[2]);
redis.call('incr', 'feed.finishes:'..ARGV[1]);
if ARGV[3] then
    redis.call('publish', 'job.finish:'..ARGV[1], ARGV[2]..string.char(0x00)..ARGV[3]);
end
redis.call('hdel', 'feed.items:'..ARGV[1], ARGV[2]);
return ARGV[2];

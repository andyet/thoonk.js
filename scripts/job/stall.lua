-- ARGV: name, id
if redis.call('zrem', 'feed.claimed:'..ARGV[1], ARGV[2]) == 0 then
    return false;
end
redis.call('hdel', 'feed.cancelled:'..ARGV[1], ARGV[2]);
redis.call('sadd', 'feed.stalled:'..ARGV[1], ARGV[2]);
redis.call('zrem', 'feed.published'..ARGV[1], ARGV[2]);
return true

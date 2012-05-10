-- ARGV: name, id
if redis.call('zrem', 'job.claimed:'..ARGV[1], ARGV[2]) == 0 then
    return false;
end
redis.call('hdel', 'job.cancelled:'..ARGV[1], ARGV[2]);
redis.call('sadd', 'job.stalled:'..ARGV[1], ARGV[2]);
redis.call('zrem', 'job.published'..ARGV[1], ARGV[2]);
return true

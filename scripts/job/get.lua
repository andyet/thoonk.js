-- ARGV: name, id, time
local r1 = redis.call('zadd', 'job.claimed:'..ARGV[1], ARGV[3], ARGV[2]);
local r2 = redis.call('hget', 'job.items:'..ARGV[1], ARGV[2]);
return {r1, r2}

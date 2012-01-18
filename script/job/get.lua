--ARGV na,e timeout, date
local id = redis.call('brpop', 'feed.ids:'..ARGV[1], 0);
if id[2] then
redis.call('zadd', 'feed.claimed:'..ARGV[1], ARGV[3], id[2]);
local item = redis.call('hget', 'feed.items:'..ARGV[1], id[2]);
return {item, id[2], false};
else
return {'', '', true};
end

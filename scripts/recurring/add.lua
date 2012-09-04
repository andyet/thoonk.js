local name, task, curtime = unpack(ARGV)
local timeout = redis.call('HGET', 'recurring.config:'..name, 'timeout');
redis.call('ZADD', 'recurring:'..name, curtime + timeout, task);
return {false, task, curtime + timeout}

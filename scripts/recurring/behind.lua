local name, curtime = unpack(ARGV)
local behind = redis.call('ZCOUNT', 'recurring:'..name, '-inf', curtime);
return {false, behind}

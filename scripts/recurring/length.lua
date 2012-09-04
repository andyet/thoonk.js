local name = ARGV[1];

local length = redis.call('ZCOUNT', 'recurring:'..name, '-inf', '+inf');
return {false, length};

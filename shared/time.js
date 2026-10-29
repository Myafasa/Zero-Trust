const config = require('./config');

function currentHour(now = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', hourCycle: 'h23', timeZone: config.access.tz,
  }).format(now);
  return Number(h);
}

// 07.00 <= jam < 21.00 (nilai 20:59 masih boleh, 21:00 ditolak). Atur lewat .env.
function withinAccessHours(now = new Date()) {
  const { start, end } = config.access;
  const h = currentHour(now);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

module.exports = { withinAccessHours, currentHour };

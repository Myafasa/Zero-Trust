const config = require('./config');

function currentHour(now = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', hourCycle: 'h23', timeZone: config.access.tz,
  }).format(now);
  return Number(h);
}

function withinAccessHours(now = new Date()) {
  const { start, end } = config.access;
  const h = currentHour(now);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

module.exports = { withinAccessHours, currentHour };

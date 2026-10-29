require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} belum diset. Jalankan "npm run setup" atau salin .env.example ke .env`);
  return v;
}

module.exports = {
  ports: { gateway: 3000, nilai: 3001, transkrip: 3002 },
  urls: {
    gateway: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
    nilai: process.env.NILAI_URL || 'http://127.0.0.1:3001',
    transkrip: process.env.TRANSKRIP_URL || 'http://127.0.0.1:3002',
  },
  jwtSecret: must('JWT_SECRET'),
  refreshSecret: must('REFRESH_SECRET'),
  gatewaySecret: must('GATEWAY_SECRET'),
  serviceClient: { id: must('SERVICE_CLIENT_ID'), secret: must('SERVICE_CLIENT_SECRET') },
  ttl: { access: '10m', refresh: '1d', service: '5m' },
  access: {
    start: Number(process.env.ACCESS_HOUR_START ?? 7),
    end: Number(process.env.ACCESS_HOUR_END ?? 21),
    tz: process.env.ACCESS_TZ || 'Asia/Jakarta',
  },
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || './db/nilai.sqlite'),
};

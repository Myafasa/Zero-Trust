const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
  console.log('.env sudah ada, tidak ditimpa.');
  process.exit(0);
}

const rand = () => crypto.randomBytes(32).toString('hex');
const out = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  .replace(/=ganti-dengan-string-acak-panjang-\d/g, () => `=${rand()}`);

fs.writeFileSync(target, out);
console.log('.env dibuat dengan secret acak.');

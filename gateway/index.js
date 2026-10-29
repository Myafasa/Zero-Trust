const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../shared/config');
const authRoutes = require('./authRoutes');
const pep = require('./pep');

const app = express();
app.disable('x-powered-by');

// Body parser HANYA untuk /auth/*; request ke service diteruskan sebagai stream apa adanya.
app.use('/auth', express.json({ limit: '10kb' }), authRoutes);

// Proxy ke service. X-Gateway-Secret ditambahkan di sini (nilai kiriman client otomatis tertimpa).
const makeProxy = (target) =>
  createProxyMiddleware({
    target,
    changeOrigin: false,
    on: {
      proxyReq: (proxyReq) => proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret),
      error: (err, req, res) => {
        if (res.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        if (res.end) res.end(JSON.stringify({ error: 'Service tidak dapat dihubungi' }));
      },
    },
  });
const proxies = { nilai: makeProxy(config.urls.nilai), transkrip: makeProxy(config.urls.transkrip) };

// Semua selain /auth/* -> PEP -> (allow) -> proxy
app.use(pep);
app.use((req, res, next) => proxies[req.proxyTarget](req, res, next));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal gateway' });
});

app.listen(config.ports.gateway, () => console.log(`[gateway] PEP + Policy Engine di :${config.ports.gateway}`));

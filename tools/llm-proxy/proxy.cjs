const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

const TARGET = process.env.LLM_TARGET || 'http://localhost:11434';

app.use('/api', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  pathRewrite: { '^/api': '/api' },
  onProxyReq(proxyReq, req, res) {
    proxyReq.setHeader('origin', TARGET);
  },
  onError(err, req, res) {
    console.error('Proxy error', err && err.message);
    res.status(500).json({ error: 'Proxy error', message: err && err.message });
  }
}));

app.use('/v1', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  pathRewrite: { '^/v1': '/v1' },
  onProxyReq(proxyReq, req, res) {
    proxyReq.setHeader('origin', TARGET);
  }
}));

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  onProxyReq(proxyReq, req, res) {
    proxyReq.setHeader('origin', TARGET);
  }
}));

const port = process.env.PORT || 11435;
app.listen(port, () => console.log(`LLM proxy listening on http://localhost:${port}, forwarding to ${TARGET}`));

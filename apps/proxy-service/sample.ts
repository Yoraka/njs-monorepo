// src/server.ts

import express, { Request, Response } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

// 后端服务器列表
const targets = [
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
];

// 当前目标索引，用于轮询
let currentTarget = 0;

// 选择下一个目标服务器（轮询算法）
const getNextTarget = (): string => {
  const target = targets[currentTarget];
  currentTarget = (currentTarget + 1) % targets.length;
  console.log(`Forwarding request to: ${target}`);
  return target;
};

// 创建 Express 应用
const app = express();

// 配置代理中间件
const proxyOptions: Options = {
  target: targets[0], // 初始目标
  changeOrigin: true,
  // 动态设置目标服务器
  router: () => {
    return getNextTarget();
  },
  //logLevel: 'debug', // 可选，调试时启用
  on: {
    error: (err, req, res: any) => {
      console.error('Proxy error:', err);
      res.status(500).send('代理服务器错误');
    },
  }

};

// 使用代理中间件
app.use(
  '/',
  createProxyMiddleware(proxyOptions)
);

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`反向代理服务器已启动，监听 wm-proxy.com:${PORT}`);
});

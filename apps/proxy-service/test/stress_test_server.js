const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
    console.log(`主进程 ${process.pid} 正在运行`);

    // 启动工作进程
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`工作进程 ${worker.process.pid} 已退出`);
        // 如果工作进程退出，立即启动新的工作进程
        cluster.fork();
    });
} else {
    // 工作进程可以共享任何 TCP 连接
    http.createServer((req, res) => {
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 如果是 OPTIONS 请求，直接返回
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 模拟一些 CPU 密集型操作
        const start = Date.now();
        while (Date.now() - start < 10) {} // 模拟10ms的CPU计算

        // 返回响应
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Server': 'StressTestServer'
        });
        
        res.end(JSON.stringify({
            success: true,
            worker: process.pid,
            time: new Date().toISOString(),
            path: req.url
        }));
    }).listen(6000);

    console.log(`工作进程 ${process.pid} 已启动`);
} 
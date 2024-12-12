import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SystemMetrics } from '../types';

const execAsync = promisify(exec);

// 使用 Map 存储上次的测量值，避免全局变量可能的竞争条件
const metricsCache = new Map<string, any>();

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const currentCPUInfo = os.cpus();
  const currentTime = Date.now();
  
  let cpuUsage = 0;
  
  // 获取上次的测量值
  const lastCPUInfo = metricsCache.get('lastCPUInfo');
  const lastMeasureTime = metricsCache.get('lastMeasureTime');
  
  if (lastCPUInfo) {
    let totalUsage = 0;
    const cpuCount = currentCPUInfo.length;
    
    for (let i = 0; i < cpuCount; i++) {
      const lastCPU = lastCPUInfo[i];
      const currentCPU = currentCPUInfo[i];
      
      // 计算总的 CPU 时间差
      const lastTotal = lastCPU.times.user + lastCPU.times.nice + 
                       lastCPU.times.sys + lastCPU.times.idle + 
                       lastCPU.times.irq;
      const currentTotal = currentCPU.times.user + currentCPU.times.nice + 
                          currentCPU.times.sys + currentCPU.times.idle + 
                          currentCPU.times.irq;
      
      // 计算空闲时间差
      const idleDiff = currentCPU.times.idle - lastCPU.times.idle;
      const totalDiff = currentTotal - lastTotal;
      
      // 计算使用率
      if (totalDiff !== 0) {
        const usage = 100 * (1 - idleDiff / totalDiff);
        totalUsage += usage;
      }
    }
    
    cpuUsage = totalUsage / cpuCount;
  } else {
    // 第一次收集时，计算当前 CPU 使用率
    const cpuCount = currentCPUInfo.length;
    let totalUsage = 0;
    
    currentCPUInfo.forEach(cpu => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      const usage = 100 * (1 - idle / total);
      totalUsage += usage;
    });
    
    cpuUsage = totalUsage / cpuCount;
  }
  
  // 更新缓存
  metricsCache.set('lastCPUInfo', currentCPUInfo);
  metricsCache.set('lastMeasureTime', currentTime);
  
  // 内存使用情况 (以 MB 为单位)
  const totalMemory = os.totalmem() / (1024 * 1024);
  const freeMemory = os.freemem() / (1024 * 1024);
  const usedMemory = totalMemory - freeMemory;
  const memoryPercentage = (usedMemory / totalMemory) * 100;
  
  // 磁盘使用率
  let diskUsage = 0;
  try {
    if (process.platform !== 'win32') {
      // Linux/Unix 系统
      const { stdout } = await execAsync("df / | tail -1 | awk '{print $5}'");
      diskUsage = parseInt(stdout.trim().replace('%', ''));
    } else {
      // Windows 系统
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n').slice(1);
      let totalSize = 0;
      let totalFree = 0;
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const freeSpace = parseInt(parts[1]);
          const size = parseInt(parts[2]);
          if (!isNaN(size) && !isNaN(freeSpace)) {
            totalSize += size;
            totalFree += freeSpace;
          }
        }
      }
      
      if (totalSize > 0) {
        diskUsage = ((totalSize - totalFree) / totalSize) * 100;
      }
    }
  } catch (error) {
    console.error('Error collecting disk metrics:', error);
  }

  // 添加时间戳和更多日志
  const metrics = {
    cpuUsage: Math.round(cpuUsage * 100) / 100,
    memoryUsage: Math.round(usedMemory), // MB
    memoryPercentage: Math.round(memoryPercentage * 100) / 100,
    diskUsage: Math.round(diskUsage * 100) / 100,
    timestamp: new Date().toISOString()
  };

  // 添加调试日志
  // console.log('Debug - 系统指标收集:', {
  //   ...metrics,
  //   totalMemory: Math.round(totalMemory),
  //   freeMemory: Math.round(freeMemory),
  //   platform: process.platform,
  //   cpuCount: os.cpus().length
  // });

  return metrics;
}

/**
 * 用于测试的辅助函数
 */
export function mockSystemMetrics(metrics: Partial<SystemMetrics>): SystemMetrics {
  return {
    cpuUsage: metrics.cpuUsage ?? 0,
    memoryUsage: metrics.memoryUsage ?? 0,
    memoryPercentage: metrics.memoryPercentage ?? 0,
    diskUsage: metrics.diskUsage ?? 0
  };
}
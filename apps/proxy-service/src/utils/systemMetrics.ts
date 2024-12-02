import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SystemMetrics } from '../types';

const execAsync = promisify(exec);

let lastCPUInfo = os.cpus();
let lastMeasureTime = Date.now();

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  // 改进的 CPU 使用率计算
  const currentCPUInfo = os.cpus();
  const currentTime = Date.now();
  
  let totalUsage = 0;
  const cpuCount = currentCPUInfo.length;
  
  for (let i = 0; i < cpuCount; i++) {
    const lastCPU = lastCPUInfo[i];
    const currentCPU = currentCPUInfo[i];
    
    const lastTotal = Object.values(lastCPU.times).reduce((a, b) => a + b, 0);
    const currentTotal = Object.values(currentCPU.times).reduce((a, b) => a + b, 0);
    
    const lastIdle = lastCPU.times.idle;
    const currentIdle = currentCPU.times.idle;
    
    const totalDiff = currentTotal - lastTotal;
    const idleDiff = currentIdle - lastIdle;
    
    const usage = 100 * (1 - idleDiff / totalDiff);
    totalUsage += usage;
  }
  
  // 更新上次的测量值
  lastCPUInfo = currentCPUInfo;
  lastMeasureTime = currentTime;
  
  const cpuUsage = totalUsage / cpuCount;
  
  // 内存使用情况
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryPercentage = (usedMemory / totalMemory) * 100;
  
  // 磁盘使用率
  let diskUsage = 0;
  try {
    // 在 Linux/Unix 系统上使用 df 命令
    if (process.platform !== 'win32') {
      const { stdout } = await execAsync("df / | tail -1 | awk '{print $5}'");
      diskUsage = parseInt(stdout.trim().replace('%', ''));
    } else {
      // Windows 系统上使用 wmic 命令
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n').slice(1);
      let totalSize = 0;
      let totalFree = 0;
      
      lines.forEach(line => {
        const [caption, freeSpace, size] = line.trim().split(/\s+/);
        if (size && freeSpace) {
          totalSize += parseInt(size);
          totalFree += parseInt(freeSpace);
        }
      });
      
      diskUsage = ((totalSize - totalFree) / totalSize) * 100;
    }
  } catch (error) {
    console.error('Error collecting disk metrics:', error);
    diskUsage = 0;
  }

  return {
    cpuUsage: Math.round(cpuUsage * 100) / 100,
    memoryUsage: Math.round(usedMemory / 1024 / 1024), // MB
    memoryPercentage: Math.round(memoryPercentage * 100) / 100,
    diskUsage: Math.round(diskUsage * 100) / 100
  };
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
import { SystemMetrics } from '../types';
import * as os from 'os';

/**
 * 收集系统硬件指标
 * @returns SystemMetrics 包含CPU使用率、内存使用和磁盘IO的系统指标
 */
export function collectSystemMetrics(): SystemMetrics {
  // 获取CPU使用率
  const cpuUsage = getCPUUsage();
  
  // 获取内存使用情况
  const memory = getMemoryUsage();
  
  // 获取磁盘IO
  const diskIO = getDiskIO();
  
  return {
    cpuUsage,
    memoryUsage: memory.used,
    memoryPercentage: memory.percentage,
    diskIO
  };
}

// 存储上一次的 CPU 时间
let lastCPUInfo: {
  idle: number;
  total: number;
} | null = null;

/**
 * 计算CPU使用率
 * @returns number CPU使用率百分比(0-100)
 */
function getCPUUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;

  if (lastCPUInfo === null) {
    // 第一次调用，保存当前值并返回0
    lastCPUInfo = { idle, total };
    return 0;
  }

  // 计算时间差
  const idleDiff = idle - lastCPUInfo.idle;
  const totalDiff = total - lastCPUInfo.total;

  // 更新上次的值
  lastCPUInfo = { idle, total };

  // 计算 CPU 使用率
  const usage = totalDiff === 0 ? 0 : 100 * (1 - idleDiff / totalDiff);

  return Math.round(usage * 100) / 100;
}

/**
 * 获取内存使用情况
 * @returns { used: number, percentage: number } 返回已使用内存(字节)和使用百分比
 */
function getMemoryUsage(): { used: number, percentage: number } {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const used = totalMem - freeMem;
  const percentage = Math.round((used / totalMem) * 10000) / 100; // 保留两位小数的百分比
  
  return {
    used,
    percentage
  };
}

/**
 * 获取磁盘IO速率
 * 注意：这是一个简化的实现，实际生产环境中应该使用更复杂的逻辑来计算真实的磁盘IO
 * @returns number 磁盘IO速率(字节/秒)
 */
let lastIOBytes = 0;
let lastIOTime = Date.now();

function getDiskIO(): number {
  // 这里使用模拟数据，实际应该从 /proc/diskstats (Linux) 或其他系统API获取
  const currentIOBytes = Math.random() * 1000000; // 模拟的IO字节数
  const currentTime = Date.now();
  
  const ioRate = (currentIOBytes - lastIOBytes) / ((currentTime - lastIOTime) / 1000);
  
  lastIOBytes = currentIOBytes;
  lastIOTime = currentTime;
  
  return Math.round(ioRate);
}

/**
 * 用于测试的辅助函数
 */
export function mockSystemMetrics(metrics: Partial<SystemMetrics>): SystemMetrics {
  return {
    cpuUsage: metrics.cpuUsage ?? 0,
    memoryUsage: metrics.memoryUsage ?? 0,
    memoryPercentage: metrics.memoryPercentage ?? 0,
    diskIO: metrics.diskIO ?? 0
  };
}
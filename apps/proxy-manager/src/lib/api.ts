// 添加类型检查和数据转换函数
export function normalizeServers(data: unknown): Array<any> {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    // 如果是对象，尝试转换为数组
    return Object.entries(data as Record<string, any>).map(([name, info]) => ({
      name,
      ...info,
    }));
  }
  return [];
} 
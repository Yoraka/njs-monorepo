// 修改服务器数据获取和处理方式
async function getServers() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/proxy-stats/servers`, {
      next: { revalidate: 5 },
    });
    const data = await response.json();
    // 确保返回的是数组
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    return [];
  }
} 
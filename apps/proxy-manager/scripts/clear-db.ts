const { PrismaClient } = require('@prisma/client')

async function clearDb() {
    const prisma = new PrismaClient()
  
    try {
      // 清空所有表的数据，但保留 User 表
      await prisma.$transaction([
        prisma.$executeRaw`DELETE FROM ServerMetrics`,
        prisma.$executeRaw`DELETE FROM SystemMetrics`
      ])
  
      console.log('数据库清理成功')
    } catch (error) {
      if (error instanceof Error) {
        console.error('清理数据库失败:', error.message)
      } else {
        console.error('清理数据库失败:', error)
      }
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }

clearDb()
  .catch((error) => {
    if (error instanceof Error) {
      console.error('执行失败:', error.message)
    } else {
      console.error('执行失败:', error)
    }
    process.exit(1)
})


module.exports = {}
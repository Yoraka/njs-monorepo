const { PrismaClient } = require('@prisma/client')

async function destroyDb() {
  const prisma = new PrismaClient()

  try {
    // 删除所有表,但保留 User 表
    await prisma.$transaction([
      prisma.$executeRaw`DROP TABLE IF EXISTS AccessLogRecord`,
      prisma.$executeRaw`DROP TABLE IF EXISTS DefaultLogRecord`, 
      prisma.$executeRaw`DROP TABLE IF EXISTS LogPosition`
    ])

    console.log('数据库表删除成功')
  } catch (error) {
    if (error instanceof Error) {
      console.error('删除数据库表失败:', error.message)
    } else {
      console.error('删除数据库表失败:', error)
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

destroyDb()
  .catch((error) => {
    if (error instanceof Error) {
      console.error('执行失败:', error.message)
    } else {
      console.error('执行失败:', error)
    }
    process.exit(1)
})

module.exports = {}

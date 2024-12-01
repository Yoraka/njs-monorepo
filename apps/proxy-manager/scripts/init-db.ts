const { PrismaClient } = require('@prisma/client')
const fs = require('fs').promises
const path = require('path')

async function initDb() {
  // 确保数据库目录存在
  const dbDir = path.join(process.cwd(), 'prisma')
  await fs.mkdir(dbDir, { recursive: true })

  // 删除旧的数据库文件（如果存在）
  const dbPath = path.join(dbDir, 'database.sqlite')
  try {
    await fs.unlink(dbPath)
    console.log('已删除旧的数据库文件')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message !== 'ENOENT') {
        console.error('删除数据库文件时出错:', error.message)
      }
    }
  }

  // 初始化 Prisma Client
  const prisma = new PrismaClient()

  try {
    // 创建 User 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        userName TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        email TEXT NOT NULL UNIQUE,
        image TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL
      )
    `

    // 创建 ServerMetrics 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS ServerMetrics (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        serverName TEXT NOT NULL,
        requestCount INTEGER NOT NULL DEFAULT 0,
        inboundTraffic REAL NOT NULL DEFAULT 0,
        outboundTraffic REAL NOT NULL DEFAULT 0,
        connections INTEGER NOT NULL DEFAULT 0
      )
    `

    // 创建 SystemMetrics 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS SystemMetrics (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        cpuUsage REAL NOT NULL,
        memoryUsage REAL NOT NULL,
        diskIO REAL NOT NULL
      )
    `

    // 创建索引
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_servermetrics_timestamp 
      ON ServerMetrics(timestamp)
    `

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_servermetrics_servername_timestamp 
      ON ServerMetrics(serverName, timestamp)
    `

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_systemmetrics_timestamp 
      ON SystemMetrics(timestamp)
    `

    // 创建默认管理员用户
    await prisma.user.create({
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        userName: 'admin',
        password: 'admin123', // 注意：实际应用中应该使用加密密码
        role: 'admin',
        email: 'admin@example.com',
        updatedAt: new Date()
      }
    })

    console.log('数据库初始化成功')
  } catch (error) {
    if (error instanceof Error) {
      console.error('数据库初始化失败:', error.message)
    } else {
      console.error('数据库初始化失败:', error)
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

initDb()
  .catch((error) => {
    if (error instanceof Error) {
      console.error('执行失败:', error.message)
    } else {
      console.error('执行失败:', error)
    }
    process.exit(1)
  })
  .finally(() => process.exit(0))

module.exports = {}
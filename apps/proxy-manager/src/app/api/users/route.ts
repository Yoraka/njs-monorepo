import { NextResponse } from 'next/server'
import { listUsers, createUser } from '@/lib/db'
import { auth } from '@/auth'
import { saltAndHashPassword } from '@/lib/utils'

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const skip = parseInt(searchParams.get('skip') || '0')
    const take = parseInt(searchParams.get('take') || '10')
    
    const users = await listUsers(skip, take)
    return NextResponse.json(users)
  } catch (error) {
    console.error('Error in GET /api/users:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (session?.user?.role !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const body = await request.json()
    
    // 对密码进行加密
    const hashedPassword = saltAndHashPassword(body.password || "123")  // 使用默认密码 "123"
    
    // 创建新用户
    const user = await createUser({
      userName: body.userName,
      email: body.email,
      role: body.role,
      password: hashedPassword,  // 存储加密后的密码
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error("Error in POST /api/users:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
} 
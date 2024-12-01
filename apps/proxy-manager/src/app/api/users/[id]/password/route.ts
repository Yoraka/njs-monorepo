import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/prisma'
import { verifyPassword, saltAndHashPassword } from '@/lib/utils'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    const { currentPassword, newPassword } = await request.json()

    // 检查权限：必须是管理员或者是用户本人
    if (session?.user?.role !== "admin" && session?.user?.id !== params.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { 
        id: true,
        password: true 
      }
    })

    if (!user) {
      return new NextResponse('User not found', { status: 404 })
    }

    // 如果是用户本人修改密码，需要验证当前密码
    if (session?.user?.role !== "admin") {
      const isValid = verifyPassword(currentPassword, user.password)
      if (!isValid) {
        return new NextResponse('Invalid current password', { status: 400 })
      }
    }

    // 对新密码进行加密
    const hashedPassword = saltAndHashPassword(newPassword)
    
    // 更新密码
    await prisma.user.update({
      where: { id: params.id },
      data: { password: hashedPassword }
    })

    return new NextResponse(null, { status: 200 })
  } catch (error) {
    console.error("Error in PUT /api/users/[id]/password:", error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 
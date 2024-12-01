import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { updateUser, deleteUser } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (session?.user?.role !== "admin") {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const user = await updateUser(params.id, {
      userName: body.userName,
      email: body.email,
      role: body.role,
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error("Error in PUT /api/users/[id]:", error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (session?.user?.role !== "admin") {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    await deleteUser(params.id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("Error in DELETE /api/users/[id]:", error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 
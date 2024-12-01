import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { countUsers } from '@/lib/db'

export async function GET() {
  try {
    const session = await auth()
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const count = await countUsers()
    return NextResponse.json({ count })
  } catch (error) {
    console.error("Error in GET /api/users/count:", error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 
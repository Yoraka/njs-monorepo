import "next-auth"

declare module "next-auth" {
  interface User {
    id: string
    email: string
    userName: string
    role: string
    image?: string | null
  }

  interface Session {
    user: {
      id: string
      email: string
      userName: string
      role: string
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    userName: string
    role: string
    image?: string | null
  }
} 
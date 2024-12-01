import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { findUserByEmail } from "./lib/db"
import { verifyPassword } from "@/lib/utils"
// admin: 944c76e550d705da2c2165b246e9c8e7:d7cf0f3119267b1b94c53192ed0541334221fcd8ba131b60f2dabd2b2e80d522f0df2a06b3b61473838838bd437eef448f155eef334fc0841be226dad87cf273
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { email, password } = credentials
        const user = await findUserByEmail(email as string)

        console.log(user)
        
        if (user) {
          const verified = verifyPassword(password as string, user.password)
          if (verified) {
            return {
              id: user.id,
              email: user.email,
              userName: user.userName,
              role: user.role,
              image: user.image
            }
          }
        }
        return null
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.userName = user.userName
        token.role = user.role
        token.image = user.image
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.userName = token.userName as string
        session.user.role = token.role as string
        session.user.image = token.image as string | null
      }
      return session
    },
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnAuth = nextUrl.pathname.startsWith('/login')
      
      if (isOnAuth) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', nextUrl))
        }
        return true
      }

      if (!isLoggedIn) {
        return Response.redirect(new URL('/login', nextUrl))
      }
      
      return true
    },
  },
  // adapter: TypeORMAdapter(process.env.AUTH_TYPEORM_CONNECTION as string),
})
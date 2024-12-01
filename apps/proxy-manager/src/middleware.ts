import { auth } from "@/auth"

// 直接导出 auth 中间件
export default auth

export const config = {
  matcher: [
    /*
     * 匹配所有路径，但排除以下路径：
     * - /login (登录页面)
     * - /_next (Next.js 内部路由)
     * - /api (API 路由)
     * - /static (静态文件)
     * - .*\..*$ (文件，如 favicon.ico)
     */
    '/((?!login|register|_next|api|static|.*\\..*$).*)',
    '/'
  ]
}
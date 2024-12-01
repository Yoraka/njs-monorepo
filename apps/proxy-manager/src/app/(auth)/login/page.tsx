"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const result = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      })

      if (result?.error) {
        toast({
          variant: "destructive",
          title: "登录失败",
          description: "邮箱或密码错误"
        })
        return
      }

      // 登录成功，手动重定向
      router.refresh() // 刷新路由状态
      router.push("/") // 重定向到首页
    } catch (error) {
      toast({
        variant: "destructive",
        title: "登录失败",
        description: error instanceof Error ? error.message : "请重试"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto flex h-screen items-center justify-center">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>
            输入您的凭据以访问仪表板
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="输入邮箱"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="输入密码"
                disabled={isLoading}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "登录中..." : "登录"}
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground">
            还没有账户？{" "}
            <Link 
              href="/register" 
              className="text-primary underline-offset-4 hover:underline"
            >
              注册
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { handleRegister } from "../actions"
import Link from "next/link"

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      await handleRegister(formData)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('NEXT_REDIRECT')) {
        toast({
          variant: "destructive",
          title: "注册失败",
          description: error instanceof Error ? error.message : "请重试"
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto flex h-screen items-center justify-center">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>注册账户</CardTitle>
          <CardDescription>
            创建一个新账户以访问仪表板
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="userName">用户名</Label>
              <Input
                id="userName"
                name="userName"
                required
                placeholder="输入用户名"
                disabled={isLoading}
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                placeholder="再次输入密码"
                disabled={isLoading}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "注册中..." : "注册"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              已有账户？{" "}
              <Link 
                href="/login" 
                className="text-primary underline-offset-4 hover:underline"
              >
                登录
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
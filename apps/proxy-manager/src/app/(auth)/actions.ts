"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { saltAndHashPassword } from "@/lib/utils"
import { prisma } from "@/prisma"

export async function handleSignIn(formData: FormData) {
  try {
    const result = await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirect: false
    })

    if (result?.error) {
      throw new Error("邮箱或密码错误")
    }

    redirect("/")
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error("邮箱或密码错误")
    }
    throw error
  }
}

export async function handleRegister(formData: FormData) {
  const userName = formData.get("userName") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirmPassword") as string

  if (!userName || !email || !password || !confirmPassword) {
    throw new Error("请填写所有必填字段")
  }

  if (password !== confirmPassword) {
    throw new Error("两次输入的密码不一致")
  }

  // 检查邮箱是否已被注册
  const existingUser = await prisma.user.findUnique({
    where: { email }
  })

  if (existingUser) {
    throw new Error("该邮箱已被注册")
  }

  // 创建新用户
  await prisma.user.create({
    data: {
      userName,
      email,
      password: saltAndHashPassword(password)
    }
  })

  redirect("/login")
}

import { signOut } from "@/auth"

export async function handleSignOut() {
  await signOut({ redirectTo: "/login" })
}
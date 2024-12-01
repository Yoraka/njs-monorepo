"use server"

import { signOut } from "@/auth"
import { redirect } from "next/navigation"

export async function handleSignOut() {
  try {
    await signOut({
      redirectTo: "/login",
    })
  } catch (error: any) {
    if (error?.digest?.includes("NEXT_REDIRECT")) {
      throw error
    }
    console.error("登出失败:", error)
    redirect("/login")
  }
} 
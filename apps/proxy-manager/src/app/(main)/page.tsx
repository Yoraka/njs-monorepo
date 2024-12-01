"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Dashboard from "@/app/components/dashboard"
import ProxyManagement from "@/app/components/proxy-management"
import TrafficMonitor from "@/app/components/traffic-monitor"
import UserManagement from "@/app/components/user-management"

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard")

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="dashboard" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">仪表盘</TabsTrigger>
          <TabsTrigger value="proxy">代理管理</TabsTrigger>
          <TabsTrigger value="traffic">流量监控</TabsTrigger>
          <TabsTrigger value="users">用户管理</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="dashboard">
            <Dashboard />
          </TabsContent>
          <TabsContent value="proxy">
            <ProxyManagement />
          </TabsContent>
          <TabsContent value="traffic">
            <TrafficMonitor />
          </TabsContent>
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

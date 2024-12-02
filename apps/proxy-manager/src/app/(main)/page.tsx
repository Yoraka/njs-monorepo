"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Dashboard from "@/app/components/dashboard"
import ProxyManagement from "@/app/components/proxy-management"
import TrafficMonitor from "@/app/components/traffic-monitor"
import UserManagement from "@/app/components/user-management"
import { useTranslation } from "react-i18next"

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard")
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="dashboard" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">{t('menu.dashboard')}</TabsTrigger>
          <TabsTrigger value="proxy">{t('menu.proxyList')}</TabsTrigger>
          <TabsTrigger value="traffic">{t('menu.traffic')}</TabsTrigger>
          <TabsTrigger value="users">{t('menu.users')}</TabsTrigger>
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

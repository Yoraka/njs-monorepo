"use client"

import { SessionProvider } from "next-auth/react"
import '../i18n/config'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n/config'
import { useState, useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    setIsI18nInitialized(true)
  }, [])

  if (!isI18nInitialized) {
    return null
  }

  return (
    <SessionProvider>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </SessionProvider>
  )
} 
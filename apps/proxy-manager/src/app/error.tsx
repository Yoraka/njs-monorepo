'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('应用错误:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest
    })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h2 className="text-2xl font-bold mb-4">出现了一些问题</h2>
      <p className="text-gray-600 mb-4">
        {error.message || '加载失败，请稍后重试'}
      </p>
      <div className="space-x-4">
        <button
          onClick={() => {
            // 重置错误边界
            reset()
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          重试
        </button>
        <button
          onClick={() => {
            // 完全重新加载页面
            window.location.reload()
          }}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          刷新页面
        </button>
      </div>
    </div>
  )
} 
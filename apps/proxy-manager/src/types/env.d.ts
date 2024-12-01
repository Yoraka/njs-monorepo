declare global {
    namespace NodeJS {
      interface ProcessEnv {
        PROXY_CONFIG_PATH: string
        ACCESS_LOG_PATH: string
        DEFAULT_LOG_PATH: string
        DATABASE_URL: string
        NODE_ENV: 'development' | 'production' | 'test'
      }
    }
  }
  
  export {}
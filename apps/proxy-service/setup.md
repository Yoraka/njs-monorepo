* 项目1 *

PS E:\njsproxy-test> Get-ChildItem -Force


    Directory: E:\njsproxy-test


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d--h--        2024/11/13      1:17                .git
d-----        2024/11/12     14:38                config
d-----        2024/11/12      1:23                dist
d-----        2024/11/12     19:24                instructionMarkdown
d-----        2024/11/14     10:45                logs
d-----        2024/11/12     19:54                node_modules
d-----        2024/11/12     14:20                src
d-----        2024/11/12     14:38                ssl
-a----        2024/11/12     19:24            202 .gitignore
-a----        2024/11/12     19:54          57190 package-lock.json
-a----        2024/11/12     19:54            608 package.json
-a----        2024/11/12     13:15           1334 sample.ts
-a----        2024/11/12      1:02            256 server.test.py
-a----        2024/11/12     13:15            328 tsconfig.json


PS E:\njsproxy-test> git remote -v
PS E:\njsproxy-test> Get-Content package.json
{
  "name": "njsproxy-test",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.1",
    "express-rate-limit": "^7.4.1",
    "http-proxy-middleware": "^3.0.3",
    "winston": "^3.17.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/http-proxy-middleware": "^1.0.0",
    "@types/ws": "^8.5.13",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  }
}
PS E:\njsproxy-test> Get-ChildItem -Recurse -File | Where-Object {$_.Name -match '(webpack\.config|tsconfig\.json|vite\.config).*'}


    Directory: E:\njsproxy-test


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12     13:15            328 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\@tsconfig\node10


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55            266 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\@tsconfig\node12


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55            388 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\@tsconfig\node14


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55            336 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\@tsconfig\node16


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55            334 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\define-data-property


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55           4883 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\es-define-property


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55           3195 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\es-errors


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55           3170 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\express-rate-limit


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12     13:55            150 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\has-proto


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55           3611 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\hasown


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55             73 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\logform


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12     13:34            384 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\set-function-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55            116 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\side-channel


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55           3195 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\ts-node\node10


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55             50 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\ts-node\node12


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55             51 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\ts-node\node14


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55             50 tsconfig.json


    Directory: E:\njsproxy-test\node_modules\ts-node\node16


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/12      0:55             50 tsconfig.json


PS E:\njsproxy-test> 

* 项目2 *

PS E:\ProxyManager\frontend\proxymanager>Get-ChildItem -Force


    Directory: E:\ProxyManager\frontend\proxymanager


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d--h--        2024/11/19      1:02                .git
d-----        2024/11/20     19:27                .next
d-----        2024/11/10     17:42                node_modules
d-----        2024/11/21     11:14                prisma
d-----         2024/11/6     22:28                public
d-----        2024/11/13     17:13                scripts
d-----        2024/11/10      0:18                src
d-----         2024/11/9     23:49                test
-a----         2024/11/6     22:40           2169 .cursorrules
-a----        2024/11/13     17:48            762 .env
-a----         2024/11/8     22:55            116 .env.local
-a----         2024/11/6     22:25             61 .eslintrc.json
-a----        2024/11/19      1:03            544 .gitignore
-a----         2024/11/6     22:29            448 components.json
-a----         2024/11/8     14:36          18856 instruction.md
-a----         2024/11/6     22:25            228 next-env.d.ts
-a----         2024/11/6     22:25            133 next.config.ts
-a----        2024/11/10     17:42         275226 package-lock.json
-a----        2024/11/13     17:17           1849 package.json
-a----         2024/11/7     22:38            157 postcss.config.mjs
-a----         2024/11/6     22:25           1450 README.md
-a----        2024/11/18     16:05           2448 stage.md
-a----         2024/11/8     19:10           2159 tailwind.config.ts
-a----         2024/11/8     16:53            673 tsconfig.json
-a----        2024/11/18     16:41           4213 types.ts


PS E:\ProxyManager\frontend\proxymanager> git remote -v
PS E:\ProxyManager\frontend\proxymanager> Get-Content package.json
{
  "name": "proxymanager",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "init-db": "ts-node --transpile-only scripts/init-db.ts",
    "clear-db": "ts-node --transpile-only scripts/clear-db.ts",
    "destroy-db": "ts-node --transpile-only scripts/destroy-db.ts"
  },
  "dependencies": {
    "@auth/typeorm-adapter": "^2.7.3",
    "@iarna/toml": "^2.2.5",
    "@prisma/client": "^5.22.0",
    "@radix-ui/react-accordion": "^1.2.1",
    "@radix-ui/react-avatar": "^1.1.1",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "autoprefixer": "^10.4.20",
    "axios": "^1.7.7",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "lucide-react": "^0.454.0",
    "next": "15.0.2",
    "next-auth": "^5.0.0-beta.25",
    "next-theme": "^0.1.5",
    "next-themes": "^0.4.3",
    "react": "19.0.0-rc-02c0e824-20241028",
    "react-dom": "19.0.0-rc-02c0e824-20241028",
    "recharts": "^2.13.3",
    "reflect-metadata": "^0.2.2",
    "tailwind-merge": "^2.5.4",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.17.6",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "eslint": "^8",
    "eslint-config-next": "15.0.2",
    "postcss": "^8.4.47",
    "prisma": "^5.22.0",
    "tailwindcss": "^3.4.14",
    "ts-node": "^10.9.2",
    "typescript": "^5"
  }
}
PS E:\ProxyManager\frontend\proxymanager> Get-ChildItem -Recurse -File | Where-Object {$_.Name -match '(webpack\.config|tsconfig\.json|vite\.config).*'}


    Directory: E:\ProxyManager\frontend\proxymanager


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/8     16:53            673 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\@tsconfig\node10


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03            266 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\@tsconfig\node12


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03            388 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\@tsconfig\node14


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03            336 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\@tsconfig\node16


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03            334 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\array-buffer-byte-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\available-typed-arrays


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\data-view-buffer


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3195 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\data-view-byte-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            242 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\data-view-byte-offset


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3195 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\define-data-property


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           4883 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\es-define-property


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3195 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\es-errors


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3170 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\es-object-atoms


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28             81 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\es-set-tostringtag


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3173 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\eslint-module-utils


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            175 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\fast-equals\build


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:33           1206 webpack.config.js


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\fastq\test


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            154 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\has-proto


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\has-tostringtag


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\hasown


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28             73 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-array-buffer


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-data-view


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-map


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-negative-zero


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-set


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-shared-array-buffer


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-typed-array


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-weakmap


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\is-weakset


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\possible-typed-array-names


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3170 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\safe-array-concat


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            125 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\set-function-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            116 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\set-function-name


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           4887 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\side-channel


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3195 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\ts-node\node10


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03             50 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\ts-node\node12


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03             51 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\ts-node\node14


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03             50 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\ts-node\node16


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        2024/11/10      3:03             50 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\typed-array-buffer


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3173 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\typed-array-byte-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\typed-array-byte-offset


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\typed-array-length


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            125 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\which-collection


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28           3611 tsconfig.json


    Directory: E:\ProxyManager\frontend\proxymanager\node_modules\which-typed-array


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----         2024/11/6     22:28            123 tsconfig.json


PS E:\ProxyManager\frontend\proxymanager> 

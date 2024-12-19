# 清理压力测试遗留的进程和资源

Write-Host "开始清理压力测试遗留资源..."

# 1. 清理 PowerShell 任务
Write-Host "正在清理 PowerShell Jobs..."
Get-Job | Stop-Job
Get-Job | Remove-Job

# 2. 清理 PowerShell Runspace
Write-Host "正在清理 PowerShell Runspaces..."
[System.Management.Automation.Runspaces.Runspace]::DefaultRunspace = $null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

# 3. 清理相关的 Node.js 进程
Write-Host "正在清理 Node.js 进程..."
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }
foreach ($process in $nodeProcesses) {
    try {
        $process.Kill()
        $process.WaitForExit()
        Write-Host "已终止 Node.js 进程 (PID: $($process.Id))"
    } catch {
        Write-Host "无法终止进程 (PID: $($process.Id)): $_"
    }
}

# 4. 清理占用 6000 端口的进程
Write-Host "正在清理占用 6000 端口的进程..."
$netstat = netstat -ano | Select-String ":6000"
foreach ($line in $netstat) {
    try {
        $processId = ($line -split '\s+')[-1]
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            $process.Kill()
            $process.WaitForExit()
            Write-Host "已终止占用 6000 端口的进程 (PID: $processId)"
        }
    } catch {
        Write-Host "无法终止进程 (PID: $processId): $_"
    }
}

# 5. 清理占用 9003 端口的进程
Write-Host "正在清理占用 9003 端口的进程..."
$netstat = netstat -ano | Select-String ":9003"
foreach ($line in $netstat) {
    try {
        $processId = ($line -split '\s+')[-1]
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            $process.Kill()
            $process.WaitForExit()
            Write-Host "已终止占用 9003 端口的进程 (PID: $processId)"
        }
    } catch {
        Write-Host "无法终止进程 (PID: $processId): $_"
    }
}

Write-Host "清理完成！"
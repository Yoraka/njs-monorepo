# 压力测试配置
$concurrentUsers = 100  # 并发用户数
$testDurationSeconds = 10  # 测试持续时间（秒）
$targetUrl = "http://stresstest.local:9003"  # 目标URL
$requestTimeout = 30  # 请求超时时间（秒）

# 初始化计数器
$totalRequests = 0
$successfulRequests = 0
$failedRequests = 0
$totalResponseTime = 0
$minResponseTime = [double]::MaxValue
$maxResponseTime = 0
$responseTimeList = New-Object System.Collections.ArrayList

# 创建停止标志
$stopFlag = $false

# 开始测试
Write-Host "开始压力测试..."
Write-Host "目标URL: $targetUrl"
Write-Host "并发用户数: $concurrentUsers"
Write-Host "测试持续时间: $testDurationSeconds 秒"
Write-Host "请求超时时间: $requestTimeout 秒"
Write-Host ""

$startTime = [DateTime]::Now
$lastProgressUpdate = [DateTime]::Now

# 创建并发任务
$runspaces = [System.Collections.ArrayList]@()
$runspacePool = [runspacefactory]::CreateRunspacePool(1, $concurrentUsers)
$runspacePool.Open()

$scriptBlock = {
    param($targetUrl, $requestTimeout)
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri $targetUrl -TimeoutSec $requestTimeout -UseBasicParsing
        $stopwatch.Stop()
        @{
            Success = $true
            ResponseTime = $stopwatch.Elapsed.TotalMilliseconds
        }
    }
    catch {
        $stopwatch.Stop()
        @{
            Success = $false
            ResponseTime = $stopwatch.Elapsed.TotalMilliseconds
        }
    }
}

# 创建并启动所有 runspace
for ($i = 0; $i -lt $concurrentUsers; $i++) {
    $powershell = [powershell]::Create().AddScript($scriptBlock).AddArgument($targetUrl).AddArgument($requestTimeout)
    $powershell.RunspacePool = $runspacePool

    [void]$runspaces.Add(@{
        PowerShell = $powershell
        Handle = $powershell.BeginInvoke()
    })
}

# 收集结果直到时间到
while (([DateTime]::Now - $startTime).TotalSeconds -lt $testDurationSeconds) {
    # 收集完成的请求结果
    for ($i = $runspaces.Count - 1; $i -ge 0; $i--) {
        $runspace = $runspaces[$i]
        if ($runspace.Handle.IsCompleted) {
            $results = $runspace.PowerShell.EndInvoke($runspace.Handle)
            
            # 处理结果
            foreach ($result in $results) {
                if ($null -ne $result) {
                    $totalRequests++
                    if ($result.Success) {
                        $successfulRequests++
                    } else {
                        $failedRequests++
                    }
                    
                    $responseTime = $result.ResponseTime
                    $totalResponseTime += $responseTime
                    [void]$responseTimeList.Add($responseTime)
                    
                    if ($responseTime -lt $minResponseTime) { $minResponseTime = $responseTime }
                    if ($responseTime -gt $maxResponseTime) { $maxResponseTime = $responseTime }
                }
            }

            # 重新启动新的请求
            $runspace.PowerShell = [powershell]::Create().AddScript($scriptBlock).AddArgument($targetUrl).AddArgument($requestTimeout)
            $runspace.PowerShell.RunspacePool = $runspacePool
            $runspace.Handle = $runspace.PowerShell.BeginInvoke()
        }
    }

    # 每秒更新一次进度
    if (([DateTime]::Now - $lastProgressUpdate).TotalSeconds -ge 1) {
        $currentTime = [Math]::Round(([DateTime]::Now - $startTime).TotalSeconds)
        $remainingTime = $testDurationSeconds - $currentTime
        $avgResponseTime = if ($totalRequests -gt 0) { $totalResponseTime / $totalRequests } else { 0 }
        
        $percentComplete = [Math]::Min(100, [Math]::Floor(($currentTime / $testDurationSeconds) * 100))
        Write-Progress -Activity "压力测试进行中" `
            -Status "已发送请求: $totalRequests | 成功: $successfulRequests | 失败: $failedRequests | 平均响应时间: $([Math]::Round($avgResponseTime, 2))ms | 剩余时间: $remainingTime 秒" `
            -PercentComplete $percentComplete
            
        $lastProgressUpdate = [DateTime]::Now
    }
    
    Start-Sleep -Milliseconds 10
}

# 立即停止所有请求
Write-Host "`n测试时间到，正在停止所有请求..."
foreach ($runspace in $runspaces) {
    try {
        $runspace.PowerShell.Stop()
        $runspace.PowerShell.Dispose()
    } catch {
        # 忽略停止过程中的错误
    }
}

# 清理资源
Write-Host "正在清理资源..."
$runspacePool.Close()
$runspacePool.Dispose()

# 计算最终统计数据
$testDuration = ([DateTime]::Now - $startTime).TotalSeconds
$avgResponseTime = if ($totalRequests -gt 0) { $totalResponseTime / $totalRequests } else { 0 }
$successRate = if ($totalRequests -gt 0) { ($successfulRequests / $totalRequests) * 100 } else { 0 }

# 计算百分位数
if ($responseTimeList.Count -gt 0) {
    $sortedResponseTimes = $responseTimeList.ToArray()
    [Array]::Sort($sortedResponseTimes)
    $p50Index = [Math]::Floor($sortedResponseTimes.Length * 0.5)
    $p90Index = [Math]::Floor($sortedResponseTimes.Length * 0.9)
    $p95Index = [Math]::Floor($sortedResponseTimes.Length * 0.95)
    $p99Index = [Math]::Floor($sortedResponseTimes.Length * 0.99)

    # 输出测试结果
    Write-Host "`n压力测试完成！"
    Write-Host "==============================================="
    Write-Host "测试持续时间: $([Math]::Round($testDuration, 2)) 秒"
    Write-Host "总请求数: $totalRequests"
    Write-Host "成功请求数: $successfulRequests"
    Write-Host "失败请求数: $failedRequests"
    Write-Host "成功率: $([Math]::Round($successRate, 2))%"
    Write-Host "每秒请求数 (RPS): $([Math]::Round($totalRequests / $testDuration, 2))"
    Write-Host ""
    Write-Host "响应时间统计 (毫秒):"
    Write-Host "  最小: $([Math]::Round($minResponseTime, 2))"
    Write-Host "  最大: $([Math]::Round($maxResponseTime, 2))"
    Write-Host "  平均: $([Math]::Round($avgResponseTime, 2))"
    Write-Host "  P50: $([Math]::Round($sortedResponseTimes[$p50Index], 2))"
    Write-Host "  P90: $([Math]::Round($sortedResponseTimes[$p90Index], 2))"
    Write-Host "  P95: $([Math]::Round($sortedResponseTimes[$p95Index], 2))"
    Write-Host "  P99: $([Math]::Round($sortedResponseTimes[$p99Index], 2))"
    Write-Host "==============================================="
} else {
    Write-Host "`n压力测试完成，但没有收集到任何有效结果！"
} 
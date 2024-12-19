# 存储进程 ID
$PIDS = @()

# 清理函数
function Cleanup {
    Write-Host "正在清理..."
    # 终止所有 Python 服务器
    foreach ($pid in $PIDS) {
        Stop-Process -Id $pid -ErrorAction SilentlyContinue
    }
    exit
}

# 设置清理钩子
$null = Register-ObjectEvent -InputObject ([Console]) -EventName CancelKeyPress -Action {
    Cleanup
}

# 启动测试服务器
Write-Host "启动测试服务器..."
$process1 = Start-Process python -ArgumentList "balance_server.test.py", "5001" -PassThru -WindowStyle Hidden
$PIDS += $process1.Id

$process2 = Start-Process python -ArgumentList "balance_server.test.py", "5002" -PassThru -WindowStyle Hidden
$PIDS += $process2.Id

$process3 = Start-Process python -ArgumentList "balance_server.test.py", "5003" -PassThru -WindowStyle Hidden
$PIDS += $process3.Id

# 等待服务器启动
Start-Sleep -Seconds 2

# 检查端口
Write-Host "检查端口..."
Write-Host "检查 5001 端口..."
Test-NetConnection -ComputerName 127.0.0.1 -Port 5001
Write-Host "检查 5002 端口..."
Test-NetConnection -ComputerName 127.0.0.1 -Port 5002
Write-Host "检查 5003 端口..."
Test-NetConnection -ComputerName 127.0.0.1 -Port 5003
Write-Host "检查 9002 端口..."
Test-NetConnection -ComputerName 127.0.0.1 -Port 9002

# 测试负载均衡
Write-Host "`n开始测试负载均衡..."
Write-Host "请求 http://loadtest.local:9002/"

try {
    1..10 | ForEach-Object {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:9002/" -Headers @{"Host"="loadtest.local"} -UseBasicParsing -ErrorAction Stop
        Write-Host "请求 $_`: $($response.Content)"
        Start-Sleep -Milliseconds 100
    }
} catch {
    Write-Host "错误: $_"
    Write-Host "详细错误信息:"
    $_.Exception | Format-List -Force
}

Write-Host "`n测试完成。按 Ctrl+C 结束测试..."
while ($true) {
    Start-Sleep -Seconds 1
} 
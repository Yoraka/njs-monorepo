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


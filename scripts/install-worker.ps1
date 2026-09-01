# 安装 Python worker 依赖（pymupdf + pytest）
$ErrorActionPreference = 'Stop'
python -m pip install -r "$PSScriptRoot\..\worker\requirements.txt"
# Windows PowerShell 5.1 的 ErrorActionPreference 不拦截原生命令非零退出，需显式检查
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "worker 依赖已安装；验证：python -c 'import pymupdf as fitz'"

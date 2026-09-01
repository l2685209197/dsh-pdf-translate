# 安装 Python worker 依赖（pymupdf + pytest）
$ErrorActionPreference = 'Stop'
python -m pip install -r "$PSScriptRoot\..\worker\requirements.txt"
Write-Host "worker 依赖已安装；验证：python -c 'import pymupdf as fitz'"

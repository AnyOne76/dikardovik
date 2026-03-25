# Подключить GitHub и отправить main (один раз настроить remote).
# 1) Создайте пустой репозиторий на https://github.com/new (без README, если уже есть код локально).
# 2) Запуск:
#    .\scripts\push-to-github.ps1 -RepoUrl "https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПО.git"
#
# При запросе логина GitHub: используйте Personal Access Token вместо пароля.
# Токен: GitHub → Settings → Developer settings → Personal access tokens.

param(
  [Parameter(Mandatory = $true)]
  [string] $RepoUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Remote origin уже есть: $existing"
  Write-Host "Отправка: git push -u origin main"
  git push -u origin main
} else {
  git remote add origin $RepoUrl
  git push -u origin main
}

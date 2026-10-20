@echo off
rem Vault Hub - build src/ into main.js, then copy to your Obsidian plugin dir.
rem Pure ASCII on purpose: cmd.exe mangles UTF-8 batch files with non-ASCII paths.
rem
rem Setup: set VWB_VAULT_DIR once, e.g.
rem   setx VWB_VAULT_DIR "D:\MyVault\.obsidian\plugins\vault-hub"

setlocal
if "%VWB_VAULT_DIR%"=="" (
  echo VWB_VAULT_DIR is not set.
  echo Run: setx VWB_VAULT_DIR "D:\MyVault\.obsidian\plugins\vault-hub"
  echo Then open a new terminal and run this script again.
  exit /b 1
)

pushd "%~dp0"
node build.js
if errorlevel 1 goto :fail

if not exist "%VWB_VAULT_DIR%" mkdir "%VWB_VAULT_DIR%"
copy /Y "main.js" "%VWB_VAULT_DIR%\main.js" >nul
copy /Y "manifest.json" "%VWB_VAULT_DIR%\manifest.json" >nul
copy /Y "styles.css" "%VWB_VAULT_DIR%\styles.css" >nul
echo Synced to %VWB_VAULT_DIR%
echo Press Ctrl+R inside Obsidian.
popd
exit /b 0

:fail
popd
exit /b 1

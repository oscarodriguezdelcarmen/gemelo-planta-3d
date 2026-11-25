@echo off
chcp 65001 >nul
cd /d "%~dp0"
curl -s http://localhost:11434/api/tags >nul 2>nul
if %errorlevel% equ 0 goto ollama_ok
echo Iniciando Ollama en segundo plano...
set OLLAMA_ORIGINS=*
start /b ollama serve
timeout /t 5 /nobreak >nul
:ollama_ok
call start /b npm start
start "" http://localhost:4200
echo.
echo Gemelo 3D listo. Cierra esta ventana para detener el servidor.
pause

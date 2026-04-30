@echo off
REM Verifica si se ha pasado un parámetro
if "%~1"=="" (
    echo Error: No se proporciono un mensaje.
    echo Uso: %0 "Tu mensaje de commit"
    pause
    exit /b
)

REM Ejecuta el comando git con el parámetro recibido
git add .
git commit -m "%~1"
git push origin main

echo.
echo Commit realizado con el mensaje: %~1
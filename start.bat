@echo off
rem GpuHedger one-command launcher (Windows).
rem
rem   start.bat            Local demo. Starts a local chain (Anvil) in its own window, deploys and seeds the
rem                        contracts if needed, runs the frontend with an auto-connected test wallet, and opens
rem                        your browser. The chain is saved between runs, so positions survive a restart.
rem   start.bat testnet    Frontend only, pointed at Monad testnet. Needs MetaMask and a Monad testnet deployment.
rem
rem Options (set before running, e.g. "set WALLET=metamask"):
rem   PORT=5173         Frontend port.
rem   WALLET=metamask   Local demo with MetaMask instead of the auto-connected test wallet.
rem   FRESH=1           Local demo from a clean chain: wipes the saved state and redeploys.
rem   OPEN=0            Don't open the browser.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
if "%PORT%"=="" set "PORT=5173"
set "RPC=http://127.0.0.1:8545"
set "STATE_DIR=%CD%\contracts\cache"
set "DEPLOY_JSON=frontend\src\contracts\deployments\31337.json"
rem Anvil dev account #0: a public, well-known test key. Local chain only; never use it anywhere else.
set "ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
set "OPEN_FLAG=--open"
if "%OPEN%"=="0" set "OPEN_FLAG="

if /I not "%MODE%"=="local" if /I not "%MODE%"=="testnet" (
  echo [x] Unknown mode "%MODE%". Use: start.bat [local^|testnet]
  exit /b 1
)

rem ---- Prerequisites ----
where node >nul 2>nul || (echo [x] Node.js 20+ is required: https://nodejs.org & exit /b 1)
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" || (echo [x] Node.js 20+ is required. & exit /b 1)

if not exist node_modules (
  echo ^> Installing root dependencies...
  call npm install --no-audit --no-fund || exit /b 1
)
if not exist frontend\node_modules (
  echo ^> Installing frontend dependencies...
  call npm --prefix frontend install --no-audit --no-fund || exit /b 1
)

if /I "%MODE%"=="testnet" goto :testnet

rem ---- Local demo ----
set "PATH=%PATH%;%USERPROFILE%\.foundry\bin"
where anvil >nul 2>nul || goto :nofoundry
where forge >nul 2>nul || goto :nofoundry
where cast >nul 2>nul || goto :nofoundry

if not exist contracts\lib\forge-std\src\Test.sol (
  echo ^> Fetching contract libraries ^(git submodules^)...
  git submodule update --init --recursive || exit /b 1
)
rem Deploy.s.sol writes here; the folders hold only gitignored files, so a fresh clone lacks them.
if not exist contracts\deployments mkdir contracts\deployments
if not exist frontend\src\contracts\deployments mkdir frontend\src\contracts\deployments
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"

if "%FRESH%"=="1" (
  echo ^> FRESH=1: wiping the saved local chain.
  del /q "%STATE_DIR%\anvil-state.json" 2>nul
  del /q "%DEPLOY_JSON%" 2>nul
  del /q contracts\deployments\31337.json 2>nul
)

cast chain-id --rpc-url %RPC% >nul 2>nul
if not errorlevel 1 (
  echo ^> Using the local chain already running on %RPC%.
  goto :checkchain
)

echo ^> Starting the local chain ^(Anvil^) in a separate window. Keep that window open while you use the app.
start "GpuHedger local chain (Anvil) - close to stop" /min anvil --block-time 1 --state "%STATE_DIR%\anvil-state.json" --state-interval 10
set /a TRIES=0
:waitanvil
cast chain-id --rpc-url %RPC% >nul 2>nul
if not errorlevel 1 goto :checkchain
set /a TRIES+=1
if %TRIES% GEQ 60 (
  echo [x] Anvil didn't start in time. Check the Anvil window for errors.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :waitanvil

:checkchain
for /f "usebackq delims=" %%c in (`cast chain-id --rpc-url %RPC%`) do set "CHAIN_ID=%%c"
if not "%CHAIN_ID%"=="31337" (
  echo [x] Something else is running on port 8545 ^(chain %CHAIN_ID%^). Stop it and try again.
  exit /b 1
)

set "NEED_DEPLOY=1"
if exist "%DEPLOY_JSON%" (
  for /f "usebackq delims=" %%a in (`node -p "require('./frontend/src/contracts/deployments/31337.json').optionFactory"`) do set "FACTORY=%%a"
  set "CODESIZE=0"
  for /f "usebackq delims=" %%s in (`cast codesize !FACTORY! --rpc-url %RPC% 2^>nul`) do set "CODESIZE=%%s"
  if not "!CODESIZE!"=="0" set "NEED_DEPLOY=0"
)

if "%NEED_DEPLOY%"=="1" (
  echo ^> Deploying and seeding the contracts. The first run compiles them, which takes a minute...
  pushd contracts
  forge script script/Deploy.s.sol --rpc-url %RPC% --private-key %ANVIL_KEY% --broadcast > "%STATE_DIR%\deploy.log" 2>&1
  if errorlevel 1 (
    popd
    echo [x] Deploy failed. Full log: contracts\cache\deploy.log
    exit /b 1
  )
  popd
  echo ^> Contracts deployed: 11 option series, 3 futures markets and the LP vault are live.
) else (
  echo ^> Contracts already deployed on the local chain.
)

set "VITE_CHAIN_ID=31337"
set "VITE_MONAD_RPC_URL=%RPC%"
set "VITE_E2E_MOCK_WALLET=true"
if /I "%WALLET%"=="metamask" set "VITE_E2E_MOCK_WALLET=false"
if "%VITE_E2E_MOCK_WALLET%"=="true" (
  echo ^> Test wallet: Anvil account #0 connects automatically ^(it holds every admin role^).
) else (
  echo ^> MetaMask: add network "Localhost 8545" ^(chain 31337^) and import Anvil account #0 ^(local only^).
)
echo ^> Opening GpuHedger in your browser. Press Ctrl+C to stop the app; close the Anvil window to stop the chain.
call npm --prefix frontend run dev -- --port %PORT% %OPEN_FLAG%
exit /b %errorlevel%

rem ---- Monad testnet ----
:testnet
if not exist frontend\src\contracts\deployments\10143.json if "%VITE_OPTION_FACTORY_ADDRESS%"=="" (
  echo [warn] No Monad testnet deployment found ^(frontend\src\contracts\deployments\10143.json^).
  echo     The app will open, but markets stay empty until the contracts are deployed and that file is pulled.
)
set "VITE_CHAIN_ID=10143"
if "%MONAD_RPC_URL%"=="" (set "VITE_MONAD_RPC_URL=https://testnet-rpc.monad.xyz") else (set "VITE_MONAD_RPC_URL=%MONAD_RPC_URL%")
set "VITE_E2E_MOCK_WALLET=false"
echo ^> Starting the frontend on Monad testnet ^(chain 10143^). Connect MetaMask in the app. Ctrl+C to stop.
call npm --prefix frontend run dev -- --port %PORT% %OPEN_FLAG%
exit /b %errorlevel%

:nofoundry
echo [x] Foundry is required for the local demo.
echo     Install Git for Windows, then in Git Bash run:  curl -L https://foundry.paradigm.xyz ^| bash
echo     followed by:  foundryup
echo     Or run "start.bat testnet" to use Monad testnet instead.
exit /b 1

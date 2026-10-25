#requires -Version 7
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot/rodar.mjs" @args
exit $LASTEXITCODE

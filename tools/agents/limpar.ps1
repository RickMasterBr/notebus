#requires -Version 7
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot/limpar.mjs" @args
exit $LASTEXITCODE

#requires -Version 7
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot/pre-despacho.mjs" @args
exit $LASTEXITCODE

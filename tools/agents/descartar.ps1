#requires -Version 7
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot/descartar.mjs" @args
exit $LASTEXITCODE

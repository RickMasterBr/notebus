#requires -Version 7
$ErrorActionPreference = 'Stop'
node "$PSScriptRoot/comparar-feed.mjs" @args
exit $LASTEXITCODE

[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-BitCraftNode {
    $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }

    foreach ($directory in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }) {
        $candidate = Join-Path $directory 'nodejs\node.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }

    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        $runtimes = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Version -Descending
        foreach ($runtime in $runtimes) {
            $candidate = Join-Path $runtime.InstallLocation 'dependencies\node\bin\node.exe'
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        }
    }
}

try {
    $bitcraftNode = Find-BitCraftNode
    if (!$bitcraftNode) { throw 'Node.js не найден. Установите Node.js и снова откройте Start-Web.cmd.' }

    $previewArgs = @((Join-Path $PSScriptRoot 'serve-web.mjs'))
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist-web\release.json') -PathType Leaf)) {
        $previewArgs += '--dev'
    }
    if (!$NoBrowser) { $previewArgs += '--open' }
    & $bitcraftNode @previewArgs
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

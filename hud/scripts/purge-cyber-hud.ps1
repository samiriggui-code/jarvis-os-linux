$root = "c:\laragon\www\jarvis-os-linux\hud\src"
$files = Get-ChildItem -Path $root -Recurse -Include *.ts,*.tsx,*.jsx,*.css,*.mjs
$pairs = @(
  @('#00f5ff', '#0A84FF'),
  @('#00F5FF', '#0A84FF'),
  @('#00e5ff', '#0A84FF'),
  @('#00E5FF', '#0A84FF'),
  @('#19f0d8', '#0A84FF'),
  @('#19F0D8', '#0A84FF'),
  @('rgba(0, 245, 255', 'rgba(10, 132, 255'),
  @('rgba(0,245,255', 'rgba(10,132,255'),
  @('rgb(0, 245, 255', 'rgb(10, 132, 255'),
  @('rgb(0,245,255)', 'rgb(10,132,255)'),
  @('0, 245, 255', '10, 132, 255'),
  @('0,245,255', '10,132,255'),
  @('Orbitron, sans-serif', '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'),
  @('"Share Tech Mono", monospace', 'ui-monospace, "SF Mono", Menlo, monospace'),
  @('Share Tech Mono, monospace', 'ui-monospace, SFMono-Regular, Menlo, monospace'),
  @('Rajdhani, sans-serif', '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif')
)
$changed = 0
foreach ($f in $files) {
  $c = [IO.File]::ReadAllText($f.FullName)
  $orig = $c
  foreach ($p in $pairs) { $c = $c.Replace($p[0], $p[1]) }
  if ($c -ne $orig) {
    [IO.File]::WriteAllText($f.FullName, $c)
    $changed++
    Write-Output $f.FullName.Replace($root, '')
  }
}
Write-Output "files_changed=$changed"

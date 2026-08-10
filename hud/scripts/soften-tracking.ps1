# Soften cyber ALL-CAPS tracking still left after font purge
$root = "c:\laragon\www\jarvis-os-linux\hud\src"
$files = Get-ChildItem -Path $root -Recurse -Include *.ts,*.tsx,*.jsx
$pairs = @(
  @("letterSpacing: '0.4em'", "letterSpacing: '0.12em'"),
  @('letterSpacing: "0.4em"', 'letterSpacing: "0.12em"'),
  @("letterSpacing: '0.35em'", "letterSpacing: '0.1em'"),
  @("letterSpacing: '0.32em'", "letterSpacing: '0.1em'"),
  @("letterSpacing: '0.3em'", "letterSpacing: '0.1em'"),
  @("letterSpacing: '0.28em'", "letterSpacing: '0.1em'"),
  @("letterSpacing: '0.25em'", "letterSpacing: '0.08em'"),
  @("letterSpacing: '0.22em'", "letterSpacing: '0.08em'"),
  @("letterSpacing: '0.2em'", "letterSpacing: '0.08em'"),
  @("letterSpacing: '0.18em'", "letterSpacing: '0.06em'"),
  @("letterSpacing: '0.16em'", "letterSpacing: '0.06em'"),
  @("letterSpacing: '0.14em'", "letterSpacing: '0.06em'")
)
$n = 0
foreach ($f in $files) {
  $c = [IO.File]::ReadAllText($f.FullName)
  $o = $c
  foreach ($p in $pairs) { $c = $c.Replace($p[0], $p[1]) }
  if ($c -ne $o) { [IO.File]::WriteAllText($f.FullName, $c); $n++; Write-Output $f.Name }
}
Write-Output "files_changed=$n"

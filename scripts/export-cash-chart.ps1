# Export the homepage cash chart from the pinned Lumbridge workbook.
#
# Desktop Excel opens the workbook read-only over COM, sets the receipt delay
# to 45 days in memory, adds a line chart from the stored chart's SERIES
# formulas, styles it with the site tokens and exports a PNG. The workbook is
# closed without saving, so its hash never changes. Colours are read from
# assets/tokens.css so the chart follows the palette. IBM Plex Sans must be
# installed for the user running Excel.
#
# Usage, from the repository root with Excel closed, once per variant:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-cash-chart.ps1 -Variant wide
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/export-cash-chart.ps1 -Variant narrow
# Then record the printed PNG hashes in assets/examples/lumbridge/preview-record.txt.
#
# The wide chart serves the full-size link and wide hero columns; the narrow
# chart serves phones and the tighter two-column widths. Both size their text
# so the rendered labels stay at about 12px or more where the page shows them.

param(
  [ValidateSet('wide', 'narrow')]
  [string]$Variant = 'wide'
)

$ErrorActionPreference = 'Stop'

$layout = @{
  wide   = @{ Width = 957; Height = 479.5; Text = 22; Title = 22; DateStep = 14; File = 'cash-preview.png' }
  narrow = @{ Width = 640; Height = 533.5; Text = 24; Title = 24; DateStep = 28; File = 'cash-preview-narrow.png' }
}[$Variant]

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$src = Join-Path $root 'assets\examples\lumbridge\lumbridge.xlsx'
$out = Join-Path $root "assets\examples\lumbridge\$($layout.File)"
$tokensPath = Join-Path $root 'assets\tokens.css'
$fontName = 'IBM Plex Sans'

if (Get-Process EXCEL -ErrorAction SilentlyContinue) {
  throw 'Excel is already running; refusing to attach to a live instance.'
}

function Rgb([string]$hex) {
  $h = $hex.TrimStart('#')
  $r = [Convert]::ToInt32($h.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($h.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($h.Substring(4, 2), 16)
  return $r + ($g * 256) + ($b * 65536)
}

$tokens = @{}
foreach ($line in Get-Content $tokensPath) {
  if ($line -match '^\s*--colour-([a-z-]+):\s*(#[0-9a-fA-F]{6});') {
    $tokens[$Matches[1]] = $Matches[2]
  }
}
foreach ($name in 'canvas', 'rule', 'rule-strong', 'ink', 'ink-soft', 'stamp', 'alert') {
  if (-not $tokens.ContainsKey($name)) { throw "tokens.css has no --colour-$name" }
}

$paper = Rgb $tokens['canvas']
$rule = Rgb $tokens['rule']
$ruleStrong = Rgb $tokens['rule-strong']
$ink = Rgb $tokens['ink']
$inkSoft = Rgb $tokens['ink-soft']
$stamp = Rgb $tokens['stamp']
$alert = Rgb $tokens['alert']

Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
'@

$xl = New-Object -ComObject Excel.Application
# The process behind this COM instance, so cleanup can never touch another
# Excel automation that starts while the export runs.
[uint32]$excelPid = 0
[void][Win32.Native]::GetWindowThreadProcessId([IntPtr]$xl.Hwnd, [ref]$excelPid)
try {
  $xl.Visible = $false
  $xl.DisplayAlerts = $false
  $xl.AutomationSecurity = 3

  $wb = $xl.Workbooks.Open($src, 0, $true)
  $wb.Worksheets.Item('Assumptions').Range('B2').Value2 = 45
  $xl.CalculateFullRebuild()

  $ws = $wb.Worksheets.Item('Cash 13 weeks')
  $closing = @()
  for ($r = 2; $r -le 14; $r++) { $closing += [double]$ws.Range("F$r").Value2 }
  $buffer = [double]$ws.Range('G14').Value2
  $lastDate = [double]$ws.Range('B14').Value2
  $minIndex = 0
  for ($i = 1; $i -lt $closing.Count; $i++) { if ($closing[$i] -lt $closing[$minIndex]) { $minIndex = $i } }

  # The wide 957 by 479.5 points export at 1282 by 639 pixels on this display
  # scale, the intrinsic size index.html and the browser spec pin.
  $co = $ws.ChartObjects().Add(400, 20, $layout.Width, $layout.Height)
  $ch = $co.Chart
  $ch.ChartType = 65

  $s1 = $ch.SeriesCollection().NewSeries()
  $s1.Formula = "=SERIES('Cash 13 weeks'!`$F`$1,'Cash 13 weeks'!`$B`$2:`$B`$14,'Cash 13 weeks'!`$F`$2:`$F`$14,1)"
  $s2 = $ch.SeriesCollection().NewSeries()
  $s2.Formula = "=SERIES('Cash 13 weeks'!`$G`$1,'Cash 13 weeks'!`$B`$2:`$B`$14,'Cash 13 weeks'!`$G`$2:`$G`$14,2)"

  $ch.HasLegend = $false
  $ch.ChartArea.Format.Fill.ForeColor.RGB = $paper
  $ch.ChartArea.Format.Line.ForeColor.RGB = $rule
  $ch.PlotArea.Format.Fill.Visible = 0
  $ch.PlotArea.Format.Line.Visible = 0

  $font = $ch.ChartArea.Format.TextFrame2.TextRange.Font
  $font.Name = $fontName
  $font.Size = $layout.Text
  $font.Fill.ForeColor.RGB = $inkSoft

  $ch.HasTitle = $true
  $ch.ChartTitle.Text = 'Lumbridge Services: weekly closing cash after a 45-day receipt delay (AUD)'
  $tf = $ch.ChartTitle.Format.TextFrame2.TextRange.Font
  $tf.Name = $fontName
  $tf.Size = $layout.Title
  $tf.Bold = 0
  $tf.Fill.ForeColor.RGB = $ink

  $vax = $ch.Axes(2)
  $vax.HasMajorGridlines = $true
  $vax.MajorGridlines.Format.Line.ForeColor.RGB = $rule
  $vax.Format.Line.Visible = 0
  # Negative amounts in parentheses, as the site writes them.
  $vax.TickLabels.NumberFormat = '$#,##0;($#,##0)'
  $vax.Crosses = 4
  $vax.CrossesAt = 0
  # A fixed step and one spare step below the trough leave room for the
  # two-line lowest-cash label above the date labels. Scale only; no value moves.
  $vax.MajorUnit = 20000
  $vax.MinimumScale = [math]::Floor(($closing[$minIndex] - 25000) / 20000) * 20000

  $cax = $ch.Axes(1)
  $cax.CategoryType = 2
  $cax.BaseUnit = 0
  $cax.MajorUnit = $layout.DateStep
  $cax.MajorUnitScale = 0
  $cax.MaximumScale = $lastDate + 21
  $cax.TickLabelPosition = -4134
  $cax.TickLabels.NumberFormat = "[<=$lastDate]d mmm;"
  $cax.Format.Line.ForeColor.RGB = $ruleStrong
  $cax.HasMajorGridlines = $false

  $s1.Format.Line.ForeColor.RGB = $stamp
  $s1.Format.Line.Weight = 4
  $s1.MarkerStyle = 8
  $s1.MarkerSize = 8
  $s1.MarkerForegroundColor = $stamp
  $s1.MarkerBackgroundColor = $stamp

  $s2.Format.Line.ForeColor.RGB = $alert
  $s2.Format.Line.Weight = 3
  $s2.Format.Line.DashStyle = 4
  $s2.MarkerStyle = -4142

  $lowPoint = $s1.Points($minIndex + 1)
  $lowPoint.HasDataLabel = $true
  $lowPoint.DataLabel.Text = 'Lowest cash' + [char]10 + '($' + ('{0:N0}' -f [math]::Abs($closing[$minIndex])) + ')'
  $lowPoint.DataLabel.Position = 1
  $lf = $lowPoint.DataLabel.Format.TextFrame2.TextRange.Font
  $lf.Name = $fontName
  $lf.Size = $layout.Text
  $lf.Fill.ForeColor.RGB = $alert

  $endPoint = $s1.Points(13)
  $endPoint.HasDataLabel = $true
  $endPoint.DataLabel.Text = 'Closing cash' + [char]10 + '$' + ('{0:N0}' -f $closing[12])
  $endPoint.DataLabel.Position = -4152
  $ef = $endPoint.DataLabel.Format.TextFrame2.TextRange.Font
  $ef.Name = $fontName
  $ef.Size = $layout.Text
  $ef.Fill.ForeColor.RGB = $stamp

  $bufPoint = $s2.Points(13)
  $bufPoint.HasDataLabel = $true
  $bufPoint.DataLabel.Text = 'Buffer' + [char]10 + '$' + ('{0:N0}' -f $buffer)
  $bufPoint.DataLabel.Position = -4152
  $bf = $bufPoint.DataLabel.Format.TextFrame2.TextRange.Font
  $bf.Name = $fontName
  $bf.Size = $layout.Text
  $bf.Fill.ForeColor.RGB = $alert

  if (Test-Path $out) { Remove-Item $out }
  $null = $ch.Export($out, 'PNG')

  'closing: ' + ($closing -join ', ')
  "buffer: $buffer lastDate: $lastDate minIndex: $minIndex"
  'title font: ' + $ch.ChartTitle.Format.TextFrame2.TextRange.Font.Name
} finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  Start-Sleep -Seconds 2
  # Quit() leaves this build's EXCEL.EXE behind; stop only the process this
  # script created, and only if it is still there.
  if ($excelPid -ne 0) {
    Get-Process -Id $excelPid -ErrorAction SilentlyContinue | Stop-Process -Force
  }
}

$hash = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($out)
"png: $($img.Width) x $($img.Height) bytes $((Get-Item $out).Length) sha256 $hash"
$img.Dispose()
'workbook sha256: ' + (Get-FileHash $src -Algorithm SHA256).Hash.ToLower()

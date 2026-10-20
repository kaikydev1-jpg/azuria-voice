# Optional typography source export. The committed outlined SVG needs no fonts.
# Requires Windows and the Segoe UI system font; never redistributes font files.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../assets/brand'))
$culture = [System.Globalization.CultureInfo]::InvariantCulture
function Number([single]$value) { return $value.ToString('0.###', $culture) }
function Outline([string]$text, [System.Drawing.FontStyle]$style) {
    $glyphPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $fontFamily = [System.Drawing.FontFamily]::new('Segoe UI')
    try {
        $glyphPath.AddString($text, $fontFamily, [int]$style, 48,
            [System.Drawing.PointF]::new(0, 0), [System.Drawing.StringFormat]::GenericTypographic)
        $points = $glyphPath.PathPoints
        $types = $glyphPath.PathTypes
        $commands = [System.Collections.Generic.List[string]]::new()
        for ($i = 0; $i -lt $points.Length; $i++) {
            $kind = $types[$i] -band 7
            $point = "$(Number $points[$i].X) $(Number $points[$i].Y)"
            if ($kind -eq 0) { $commands.Add("M$point") }
            elseif ($kind -eq 1) { $commands.Add("L$point") }
            elseif ($kind -eq 3) {
                $point2 = "$(Number $points[$i+1].X) $(Number $points[$i+1].Y)"
                $point3 = "$(Number $points[$i+2].X) $(Number $points[$i+2].Y)"
                $commands.Add("C$point $point2 $point3")
                $i += 2
            }
            else { throw "Unexpected font outline point type: $kind" }
            if ($types[$i] -band 128) { $commands.Add('Z') }
        }
        return @{ D = $commands -join ' '; Width = $glyphPath.GetBounds().Right }
    } finally {
        $glyphPath.Dispose()
        $fontFamily.Dispose()
    }
}
$azuriaOutline = Outline 'Azúria' ([System.Drawing.FontStyle]::Bold)
$voiceOutline = Outline 'Voice' ([System.Drawing.FontStyle]::Regular)
$voiceX = 80 + $azuriaOutline.Width + 15
$canvasWidth = [Math]::Ceiling($voiceX + $voiceOutline.Width + 4)
$symbol = [System.IO.File]::ReadAllText((Join-Path $brandRoot 'symbol.svg'))
$symbolBody = [regex]::Replace($symbol, '(?s)^.*?</desc>\s*|</svg>\s*$', '')
$wordmark = @"
<svg xmlns="http://www.w3.org/2000/svg" width="$($canvasWidth*4)" height="256" viewBox="0 0 $canvasWidth 64" role="img" aria-labelledby="title description">
  <title id="title">Azúria Voice</title>
  <desc id="description">The Azúria Voice silver and blue audio waveform and tiny black hole with an outlined horizontal wordmark. Azúria is bold and Voice is regular.</desc>
  <g id="symbol">$symbolBody</g>
  <g id="wordmark" fill="#0B1220" transform="translate(0 0)">
    <path id="azuria" transform="translate(80 0)" d="$($azuriaOutline.D)"/>
    <path id="voice" transform="translate($(Number $voiceX) 0)" d="$($voiceOutline.D)"/>
  </g>
</svg>
"@
[System.IO.File]::WriteAllText((Join-Path $brandRoot 'wordmark.svg'), $wordmark + "`n", [System.Text.UTF8Encoding]::new($false))
$editable = @"
<svg xmlns="http://www.w3.org/2000/svg" width="$($canvasWidth*4)" height="256" viewBox="0 0 $canvasWidth 64" role="img" aria-label="Azúria Voice">
  <g id="symbol">$symbolBody</g>
  <text id="wordmark" x="80" y="51.352" fill="#0B1220" font-family="Segoe UI, sans-serif" font-size="48"><tspan font-weight="700">Azúria</tspan><tspan x="$(Number $voiceX)" font-weight="400">Voice</tspan></text>
</svg>
"@
[System.IO.File]::WriteAllText((Join-Path $brandRoot 'wordmark-editable.svg'), $editable + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output "Outlined wordmark: $canvasWidth x 64; accent retained in Azúria."

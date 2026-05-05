param(
  [Parameter(Mandatory = $true)]
  [string]$TemplatePath,

  [Parameter(Mandatory = $true)]
  [string]$PayloadPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Join-Lines {
  param(
    $Items,
    [switch]$Numbered
  )

  $lines = @($Items) |
    ForEach-Object { "$_".Trim() } |
    Where-Object { $_.Length -gt 0 }

  if ($Numbered) {
    $index = 1
    $lines = $lines | ForEach-Object {
      $line = "$index. $_"
      $index += 1
      $line
    }
  }

  return $lines -join "`r"
}

function Normalize-TableLayout {
  param($Table)

  try { $Table.Rows.AllowBreakAcrossPages = -1 } catch {}
  try { $Table.Rows.HeightRule = 0 } catch {}

  for ($rowIndex = 1; $rowIndex -le $Table.Rows.Count; $rowIndex += 1) {
    try {
      $row = $Table.Rows.Item($rowIndex)
      $row.AllowBreakAcrossPages = -1
      $row.HeightRule = 0
      $row.Height = 0
      $row.Range.ParagraphFormat.SpaceBefore = 0
      $row.Range.ParagraphFormat.SpaceAfter = 0
      $row.Range.ParagraphFormat.LineSpacingRule = 0
      $row.Range.ParagraphFormat.KeepTogether = 0
      $row.Range.ParagraphFormat.KeepWithNext = 0
      $row.Range.ParagraphFormat.PageBreakBefore = 0
    } catch {}
  }
}

function Set-CellText {
  param(
    $Table,
    [int]$Row,
    [int]$Column,
    [string]$Text,
    [Nullable[bool]]$Bold = $null
  )

  try {
    $cell = $Table.Cell($Row, $Column)
  } catch {
    return
  }

  try { $cell.TextDirection = 0 } catch {}

  $range = $cell.Range
  $range.End = $range.End - 1

  $font = $range.Font.Duplicate
  $paragraphFormat = $range.ParagraphFormat.Duplicate
  try {
    $style = $range.Style
  } catch {
    $style = $null
  }
  $start = $range.Start

  $range.Text = $Text

  $newRange = $cell.Range
  $newRange.Start = $start
  $newRange.End = $newRange.End - 1

  if ($null -ne $style) {
    try { $newRange.Style = $style } catch {}
  }
  try { $newRange.ListFormat.RemoveNumbers() } catch {}

  try { $newRange.Font.Name = $font.Name } catch {}
  try { $newRange.Font.NameAscii = $font.NameAscii } catch {}
  try { $newRange.Font.NameFarEast = $font.NameFarEast } catch {}
  try { $newRange.Font.NameOther = $font.NameOther } catch {}
  try { $newRange.Font.Size = $font.Size } catch {}
  if ($null -ne $Bold) {
    try { $newRange.Font.Bold = [int]$Bold } catch {}
  } else {
    try { $newRange.Font.Bold = $font.Bold } catch {}
  }
  try { $newRange.Font.Italic = $font.Italic } catch {}
  try { $newRange.Font.Underline = $font.Underline } catch {}
  try { $newRange.Font.Color = $font.Color } catch {}

  try { $newRange.ParagraphFormat.Alignment = $paragraphFormat.Alignment } catch {}
  try { $newRange.ParagraphFormat.LeftIndent = $paragraphFormat.LeftIndent } catch {}
  try { $newRange.ParagraphFormat.RightIndent = $paragraphFormat.RightIndent } catch {}
  try { $newRange.ParagraphFormat.FirstLineIndent = $paragraphFormat.FirstLineIndent } catch {}
  try { $newRange.ParagraphFormat.SpaceBefore = 0 } catch {}
  try { $newRange.ParagraphFormat.SpaceAfter = 0 } catch {}
  try { $newRange.ParagraphFormat.LineSpacingRule = 0 } catch {}
  try { $newRange.ParagraphFormat.KeepTogether = 0 } catch {}
  try { $newRange.ParagraphFormat.KeepWithNext = 0 } catch {}
  try { $newRange.ParagraphFormat.PageBreakBefore = 0 } catch {}

  try {
    for ($paragraphIndex = 1; $paragraphIndex -le $newRange.Paragraphs.Count; $paragraphIndex += 1) {
      $paragraph = $newRange.Paragraphs.Item($paragraphIndex)
      $paragraph.Format.SpaceBefore = 0
      $paragraph.Format.SpaceAfter = 0
      $paragraph.Format.LineSpacingRule = 0
      $paragraph.Format.KeepTogether = 0
      $paragraph.Format.KeepWithNext = 0
      $paragraph.Format.PageBreakBefore = 0
      try { $paragraph.Range.ListFormat.RemoveNumbers() } catch {}
    }
  } catch {}
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json

$word = $null
$document = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $document = $word.Documents.Open($TemplatePath, $false, $false)

  if ($document.Tables.Count -lt 2) {
    throw "Template must contain approval and instruction tables."
  }

  $approvalTable = $document.Tables.Item(1)
  $instructionTable = $document.Tables.Item(2)
  Normalize-TableLayout $approvalTable
  Normalize-TableLayout $instructionTable

  $instructionTable.Rows.Item(10).Select()
  $word.Selection.InsertRowsBelow(1)

  $approvalText = @(
    "У Т В Е Р Ж Д А Ю",
    $payload.templateMeta.approvedBy,
    "___________ __________________",
    "«____» ___________________ 20__г."
  ) -join "`r"

  Set-CellText $approvalTable 1 1 $approvalText

  Set-CellText $instructionTable 2 2 $payload.templateMeta.positionName -Bold $false
  Set-CellText $instructionTable 3 2 $payload.templateMeta.departmentName -Bold $false
  Set-CellText $instructionTable 5 2 (Join-Lines $payload.sections.general.requiredQualification -Numbered) -Bold $false

  $subordination = @($payload.sections.general.subordination)
  Set-CellText $instructionTable 6 2 (Join-Lines ($subordination | Select-Object -First 1)) -Bold $false
  if ($subordination.Count -gt 1) {
    Set-CellText $instructionTable 6 3 (Join-Lines ($subordination | Select-Object -Skip 1)) -Bold $false
  }

  Set-CellText $instructionTable 7 2 (Join-Lines $payload.sections.general.hiringProcedure -Numbered) -Bold $false
  Set-CellText $instructionTable 8 2 (Join-Lines $payload.sections.general.substitutionProcedure -Numbered) -Bold $false
  Set-CellText $instructionTable 9 2 (Join-Lines $payload.sections.general.regulatoryDocuments -Numbered) -Bold $false

  $localRegulations = Join-Lines $payload.sections.general.localRegulations -Numbered
  $mustKnow = Join-Lines $payload.sections.general.employeeMustKnow -Numbered
  Set-CellText $instructionTable 10 2 $localRegulations -Bold $false
  Set-CellText $instructionTable 11 1 "Работник должен знать" -Bold $true
  Set-CellText $instructionTable 11 2 $mustKnow -Bold $false

  Set-CellText $instructionTable 13 1 ("Работник обязан:`r" + (Join-Lines $payload.sections.duties.items -Numbered)) -Bold $false
  Set-CellText $instructionTable 15 1 ("Работник имеет право:`r" + (Join-Lines $payload.sections.rights.items -Numbered)) -Bold $false
  Set-CellText $instructionTable 16 1 $payload.sections.responsibility.heading -Bold $true
  Set-CellText $instructionTable 17 1 ("Работник несет ответственность за:`r" + (Join-Lines $payload.sections.responsibility.items -Numbered)) -Bold $false

  Set-CellText $instructionTable 19 1 $payload.signatures.coordinator -Bold $false
  Set-CellText $instructionTable 19 2 ""
  Set-CellText $instructionTable 19 3 ""
  Set-CellText $instructionTable 19 4 ""

  Normalize-TableLayout $approvalTable
  Normalize-TableLayout $instructionTable
  try {
    $document.Content.ListFormat.RemoveNumbers()
    $document.Content.ParagraphFormat.SpaceBefore = 0
    $document.Content.ParagraphFormat.SpaceAfter = 0
    $document.Content.ParagraphFormat.KeepTogether = 0
    $document.Content.ParagraphFormat.KeepWithNext = 0
    $document.Content.ParagraphFormat.PageBreakBefore = 0
  } catch {}

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  $document.SaveAs2($OutputPath, 16)
} finally {
  if ($null -ne $document) {
    $document.Close($false)
  }
  if ($null -ne $word) {
    $word.Quit()
  }

  if ($null -ne $document) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
  }
  if ($null -ne $word) {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

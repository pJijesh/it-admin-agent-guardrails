# PowerShell patterns

Short, copyable patterns. The full skeleton is in [../templates/safe-script-template.ps1](../templates/safe-script-template.ps1).

## Dry run by default

```powershell
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { $WhatIfPreference = $true }
```

`SupportsShouldProcess` gives the script `-WhatIf` and `-Confirm`. Setting `$WhatIfPreference` to `$true` makes every command that honours it plan instead of act. Your own `ShouldProcess` call is what makes the script's message appear.

## Call ShouldProcess yourself

```powershell
if ($PSCmdlet.ShouldProcess($upn, 'Disable account')) {
    Update-MgUser -UserId $upn -AccountEnabled:$false
}
```

Declaring `SupportsShouldProcess` and never calling `ShouldProcess` gives a script whose `-WhatIf` does nothing. Rule PSG003 catches that.

## Cap the change

```powershell
[ValidateRange(1, 50)][int]$MaxChanges = 10
if ($targets.Count -gt $MaxChanges) { throw "..." }
```

Make the cap a parameter with a low default, so raising it is a deliberate act.

## Name the targets

Take a CSV of user principal names, device ids or group ids that a person reviewed. Validate each row, and ignore blank rows.

## Stop and record

```powershell
try { ... ; $result = 'changed' }
catch { $result = "failed: $($_.Exception.Message)"; throw }
```

Decide whether one failure should stop the run. For account changes it usually should. Always write the log, including for the rows that were not processed.

## Do not do this

- `Get-MgUser -All | Remove-MgUser`: every object, no filter, no cap.
- `-Confirm:$false` on a destructive command.
- `-ErrorAction SilentlyContinue` on a command that changes state.
- `Invoke-Expression` or downloading and running code.
- Hard-coded tenant ids, application ids or secrets: pass them as parameters.
- `Remove-Item -Recurse -Force $path` without checking `$path` and using `-WhatIf` first.

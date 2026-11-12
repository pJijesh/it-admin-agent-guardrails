# Microsoft Graph scopes

Request the least permission that works, and say why. Names below are examples of the pattern; always confirm the least-privileged permission for a call in the Microsoft Graph permissions reference, which changes over time.

## Reading

| Purpose | Typical scope |
| --- | --- |
| List users and their properties | `User.Read.All` |
| Read sign-in activity | `AuditLog.Read.All` |
| Read groups and membership | `Group.Read.All` |
| Read managed devices | `DeviceManagementManagedDevices.Read.All` |
| Read directory roles | `RoleManagement.Read.Directory` |
| Read Conditional Access policies | `Policy.Read.All` |

## Changing

A change script needs a write scope, and a write scope can do more than the one thing you want. Prefer a narrower one where Microsoft offers it.

| Purpose | Notes |
| --- | --- |
| Disable an account | `User.ReadWrite.All` covers it; check for something narrower |
| Revoke sign-in sessions | there is a narrower permission for this than full user write; check the reference |
| Device actions (wipe, retire) | a privileged operations scope exists; treat it as an approval gate |
| Role assignment | `RoleManagement.ReadWrite.Directory` is very powerful; always an approval gate |
| Conditional Access | `Policy.ReadWrite.ConditionalAccess`; create as report-only first |

## Habits

- A script that only reads must not request a `ReadWrite`, `PrivilegedOperations` or `Send` scope. Rule PSG007 flags it.
- Prefer delegated permissions with an interactive sign-in for one-off work, and application permissions with a certificate for scheduled work.
- Name the scopes in the script's help block, with one line each on why.
- Review consent: asking for a new scope in a shared application registration may need an administrator's approval.

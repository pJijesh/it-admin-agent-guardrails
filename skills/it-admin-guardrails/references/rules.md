# Rules

Run `node scripts/check-ps.mjs --rules` for the same list. Errors fail the check by default; warnings do not unless `--fail-on warning` is used.

| Id | Severity | What it flags |
| --- | --- | --- |
| PSG001 | error | A secret, password or token is written into the script |
| PSG002 | error | The script changes state but does not support -WhatIf (no SupportsShouldProcess) |
| PSG003 | warning | SupportsShouldProcess is declared but ShouldProcess is never called |
| PSG004 | warning | The script changes state but does not default to a dry run |
| PSG005 | error | -Confirm:$false on a destructive command |
| PSG006 | error | A bulk change over every object (-All) with no filter, limit or guard |
| PSG007 | warning | A script that only reads asks for a write permission scope |
| PSG008 | error | Execution policy is set to Bypass or Unrestricted |
| PSG009 | error | Code is downloaded and executed |
| PSG010 | warning | Invoke-Expression is used |
| PSG011 | error | TLS or certificate validation is weakened |
| PSG012 | warning | A tenant, object or application GUID is hard-coded |
| PSG013 | error | A security protection is switched off or excluded |
| PSG014 | warning | The script creates a scheduled task, service or start-up entry |
| PSG015 | error | A secret or token is written to the console, a log or a file |
| PSG016 | warning | The script changes state with no error handling |
| PSG017 | warning | The script changes state but records nothing about what it did |
| PSG018 | error | An irreversible device action (wipe, retire, delete) |
| PSG019 | error | A Conditional Access policy is created or updated as enabled instead of report-only |
| PSG020 | error | Mail forwarding, redirect or mailbox delegation is changed |
| PSG021 | error | A directory role or privileged group membership is assigned |
| PSG022 | error | A user's authentication methods are removed or reset |
| PSG023 | warning | Remove-Item -Recurse -Force on a variable or wildcard path |
| PSG024 | warning | Errors are silenced on a command that changes state |
| PSG025 | warning | A deprecated Azure AD or MSOnline module is used |
| PSG026 | error | A guardrail-allow comment has no reason |

## Overrides

A finding can be overridden with a comment that has a reason:

```powershell
# guardrail-allow PSG018: approved by the service owner, ticket CHG-0000
# guardrail-allow-file PSG016: the wrapper handles errors
```

The first form applies to the next line (or the same line). The second applies to the whole file. A comment with no reason is itself an error (PSG026).

## Limits

The checker is a set of text patterns. It does not parse PowerShell, follow variables across lines, resolve aliases beyond `iex`, or know what a custom function does. It will miss things and it will sometimes flag safe code. Treat a clean result as "no known pattern found".

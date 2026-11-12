# Approval gates

These changes need a named person's yes before the script is run with `-Apply`. The checker reports them as errors so the conversation happens, and `# guardrail-allow` records the approval in the script itself.

| Change | Rule | What to ask the approver |
| --- | --- | --- |
| Wipe, retire or delete a device | PSG018 | Which devices, who owns them, are they backed up? |
| Assign a directory role or privileged group | PSG021 | Who, which role, for how long, why? |
| Mail forwarding, redirect or mailbox delegation | PSG020 | Who asked, to which address, is it inside the organisation? |
| Remove or reset authentication methods | PSG022 | Has the person's identity been verified out of band? |
| Create or enable Conditional Access | PSG019 | Has it run report-only, and what did the sign-in logs show? |
| Switch off or exclude a security protection | PSG013 | What replaces the protection, and who accepts the risk? |
| Weaken TLS or the execution policy | PSG011, PSG008 | Why can the real fix not be used? |
| Download and run code | PSG009 | Has a person reviewed that exact content? |

## Recording the approval

```powershell
# guardrail-allow PSG018: approved by the service owner, ticket CHG-0000, device list reviewed on 2026-11-12
Clear-MgDeviceManagementManagedDevice -ManagedDeviceId $id
```

The reason must be at least three characters and should say who approved and where it is recorded. A reason that is only "ok" will pass the checker and fail a human review. Rule PSG026 reports an override with no reason.

## What an agent should do

Draft the script, run the dry run, show the plan, name the approver needed, and stop. Do not run the script with `-Apply` on the strength of the original request alone.

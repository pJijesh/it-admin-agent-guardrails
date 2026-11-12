---
name: it-admin-guardrails
description: Use whenever you write, change or review PowerShell for IT administration (Microsoft Graph, Microsoft 365, Entra ID, Intune, Active Directory, Exchange Online). Makes scripts read-only or dry-run by default, keeps secrets out, limits blast radius, and runs a bundled checker over the result before anything is run.
---

# IT admin guardrails

Administration scripts are different from application code: one wrong line can disable every account, wipe devices or forward a mailbox to a stranger. An agent writing them has to be careful in a way that a code assistant normally is not. This skill sets the rules and gives you a checker that enforces the mechanical ones.

Read this file first. Open the references only when a step tells you to.

## Ground rules

1. Read before you write. Start with a script that only reads and reports. Add a change only when the person asked for it.
2. Every change is a dry run until someone says otherwise. The script must support `-WhatIf` through `SupportsShouldProcess`, call `ShouldProcess` before each change, and default to a dry run with an explicit `-Apply` switch.
3. Name what you change. Act on a list the person has reviewed, not on "all users". Cap the number of changes with a `-MaxChanges` limit and show the count before acting.
4. Never put a secret in a script, a log or a chat. Use an interactive sign-in, a certificate or a vault. Never print a token.
5. Ask for the least permission that works. A script that reads asks for `Read` scopes. Name every scope and say why it is needed.
6. Some changes always need a person's yes, however the request is worded: wiping or deleting devices, role and group privilege, mail forwarding and delegation, authentication methods, Conditional Access, and anything that switches a protection off. See [references/approval-gates.md](references/approval-gates.md).
7. Leave a trail. Write a CSV or log of every object touched and what happened to it, and stop on the first unexpected error.
8. Never run the script for the person unless they ask. Show it, the checker result and what a dry run does.
9. Never invent tenant names, domains, ids or accounts. Take them from the person, or use parameters.

## Steps

1. Understand the job. Ask, one question at a time, what should change, for which named accounts or devices, and who approves.
2. Write a read-only version first when the task is a clean-up or a change. Its output is the list the person reviews.
3. Write the change version from [templates/safe-script-template.ps1](templates/safe-script-template.ps1). Follow [references/powershell-patterns.md](references/powershell-patterns.md) and [references/graph-scopes.md](references/graph-scopes.md).
4. Run the checker: `node {{SCRIPTS}}/check-ps.mjs <file-or-folder>`. Fix every error. Fix or explain every warning.
5. If a rule must be overridden, add `# guardrail-allow PSG0xx: reason` on the line above, with a real reason and the name of whoever approved it. Do not do this to make the checker pass.
6. Report: what the script does, what a dry run shows, the scopes it needs, the checker result, anything you could not verify, and what you need approved before it is run with `-Apply`.

## Tools

```text
node {{SCRIPTS}}/check-ps.mjs <file-or-folder>... [--fail-on error|warning|none] [--json]
node {{SCRIPTS}}/check-ps.mjs --rules
```

The checker reads text. It does not run PowerShell and it cannot prove a script is safe; it finds the common mistakes. Its 26 rules are listed in [references/rules.md](references/rules.md). Say plainly in your report that a clean result means "no known pattern found", not "safe".

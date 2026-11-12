// Static checker for PowerShell admin scripts written by people or agents. Zero dependencies.
// It reads text only. It never runs PowerShell.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

export const RULES = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url), 'utf8')).rules;
const SEV = Object.fromEntries(RULES.map((r) => [r.id, r.severity]));

const VERBS = '(?:Remove|Set|New|Update|Disable|Enable|Revoke|Reset|Clear|Add|Grant|Invoke|Restore|Move|Rename|Send|Start|Stop|Restart|Register|Unregister|Import|Publish)';
const NOUNS = '(?:Mg\\w+|Az\\w+|AzureAD\\w*|Aad\\w+|Msol\\w*|Mailbox\\w*|AD(?:User|Group|GroupMember|Computer|Account\\w*|Object)|DistributionGroup\\w*|InboxRule|TransportRule|Recipient\\w*|IntuneManagedDevice|DeviceConfiguration\\w*)';
const STATE_RE = new RegExp(`\\b${VERBS}-${NOUNS}\\b`, 'i');
const isStateLine = (code) => STATE_RE.test(code.replace(/\bInvoke-MgGraphRequest\b/gi, '')) || GRAPH_WRITE_RE.test(code);
const GRAPH_WRITE_RE = /\bInvoke-(?:MgGraphRequest|RestMethod|WebRequest)\b[^\n]*-Method\s+['"]?(?:POST|PATCH|PUT|DELETE)\b/i;
const DESTRUCTIVE_RE = /\b(?:Remove|Disable|Revoke|Reset|Clear|Unregister)-\w+/i;

export function splitLines(text) {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  let block = false;
  return raw.map((line) => {
    let code = '';
    let comment = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const two = line.slice(i, i + 2);
      if (block) {
        if (two === '#>') { block = false; i += 1; }
        comment += c;
        continue;
      }
      if (!quote && two === '<#') { block = true; comment += two; i += 1; continue; }
      if (quote) {
        if (quote === '"' && c === '`') { code += c + (line[i + 1] || ''); i += 1; continue; }
        if (c === quote) quote = null;
        code += c;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; code += c; continue; }
      if (c === '#') { comment = line.slice(i); break; }
      code += c;
    }
    return { raw: line, code, comment };
  });
}

function statements(lines) {
  const out = [];
  let cur = null;
  lines.forEach((l, i) => {
    const t = l.code.trimEnd();
    if (!cur) cur = { line: i + 1, text: '' };
    cur.text += ` ${t.replace(/`$/, '')}`;
    if (!(/\|\s*$/.test(t) || /`$/.test(t))) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}

const readScopes = (lines) => {
  const scopes = [];
  lines.forEach((l, i) => {
    if (!/Connect-MgGraph\b/i.test(l.code) || !/-Scopes?\b/i.test(l.code)) return;
    const after = l.code.slice(l.code.search(/-Scopes?\b/i));
    for (const m of after.matchAll(/['"]?([A-Za-z]+(?:\.[A-Za-z]+)+)['"]?/g)) scopes.push({ scope: m[1], line: i + 1 });
  });
  return scopes;
};

function parseOverrides(lines) {
  const lineAllow = [];
  const fileAllow = new Set();
  const problems = [];
  lines.forEach((l, i) => {
    const m = /guardrail-allow(-file)?\s+(PSG\d{3})\s*:?\s*(.*)$/i.exec(l.comment);
    if (!m) return;
    const reason = m[3].replace(/#>$/, '').trim();
    if (reason.length < 3) { problems.push({ line: i + 1, message: `guardrail-allow ${m[2].toUpperCase()} needs a reason after the rule id` }); return; }
    if (m[1]) fileAllow.add(m[2].toUpperCase());
    else lineAllow.push({ rule: m[2].toUpperCase(), line: i + 1 });
  });
  return { lineAllow, fileAllow, problems };
}

export function checkText(text, file = '(input)') {
  const lines = splitLines(text);
  const findings = [];
  const add = (rule, line, message) => findings.push({ file, line, rule, severity: SEV[rule], message });
  const stateLines = [];
  lines.forEach((l, i) => { if (isStateLine(l.code)) stateLines.push(i + 1); });
  const changes = stateLines.length > 0;
  const all = lines.map((l) => l.code).join('\n');

  lines.forEach((l, i) => {
    const n = i + 1;
    const c = l.code;
    const secretVar = /\$\w*(?:password|passwd|pwd|secret|apikey|api_key|token)\w*\s*=\s*(['"])([^'"\n]{4,})\1/i.exec(c);
    if (secretVar && !/[$]/.test(secretVar[2]) && !/^<.*>$/.test(secretVar[2].trim()) && !/^\*+$/.test(secretVar[2].trim()) && !/(?:skip|continuation|next|page)token/i.test(c)) add('PSG001', n, 'a secret appears to be written into the script; read it from a vault, a certificate or an interactive sign-in');
    else if (/ConvertTo-SecureString\s+(['"])[^'"$\n]+\1[^\n]*-AsPlainText/i.test(c) || /-(?:Password|ClientSecret|Secret|AccessToken)\s+(['"])[^'"$\n]{4,}\1/i.test(c) || /Bearer\s+eyJ[A-Za-z0-9_-]{10,}/.test(c) || /\bAKIA[0-9A-Z]{16}\b/.test(c)) add('PSG001', n, 'a secret appears to be written into the script; read it from a vault, a certificate or an interactive sign-in');
    if (/-Confirm\s*:\s*\$false/i.test(c) && DESTRUCTIVE_RE.test(c)) add('PSG005', n, '-Confirm:$false removes the last safety prompt from a destructive command');
    if (/Set-ExecutionPolicy\s+(?:-ExecutionPolicy\s+)?(?:Bypass|Unrestricted)\b|-ExecutionPolicy\s+(?:Bypass|Unrestricted)\b/i.test(c)) add('PSG008', n, 'do not weaken the execution policy; sign the script or run it from a trusted path');
    const dl = /(?<![$\w-])(?:iex|Invoke-Expression)(?![\w-])[^\n]*(?:iwr|Invoke-WebRequest|DownloadString|Invoke-RestMethod|irm|WebClient)\b/i.test(c) || /\b(?:iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|\n]*\|\s*(?:iex|Invoke-Expression)(?![\w-])/i.test(c);
    if (dl) add('PSG009', n, 'never download and run code; fetch it, review it, then run a pinned copy');
    else if (/(?<![$\w-])(?:iex|Invoke-Expression)(?![\w-])/i.test(c)) add('PSG010', n, 'Invoke-Expression runs strings as code; use the call operator or a parameterised command');
    if (/ServerCertificateValidationCallback\s*=|-SkipCertificateCheck\b|-SkipCertCheck\b|\bCertificatePolicy\s*=|SecurityProtocol[^\n]*\b(?:Ssl3|Tls|Tls11)\b/i.test(c)) add('PSG011', n, 'do not weaken TLS or certificate validation; fix the certificate or the trust store');
    const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.exec(c);
    if (guid && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(guid[0]) && !/-c000-000000000000$/i.test(guid[0])) add('PSG012', n, 'a GUID is hard-coded; pass tenant, object and application ids as parameters');
    if (/Set-MpPreference[^\n]*-Disable\w+\s+(?:\$true|1)\b/i.test(c) || /Add-MpPreference[^\n]*-Exclusion\w+/i.test(c) || /Set-NetFirewallProfile[^\n]*-Enabled\s+(?:False|\$false|0)\b/i.test(c) || /netsh\s+advfirewall\s+set\s+\w+\s+state\s+off/i.test(c) || /\bDisable-BitLocker\b/i.test(c) || /Stop-Service[^\n]*\b(?:WinDefend|Sense|MpsSvc)\b/i.test(c)) add('PSG013', n, 'this switches off or excludes a security protection; do not do it from an automated script');
    if (/\bRegister-ScheduledTask\b|\bschtasks(?:\.exe)?\s+\/create\b|\bNew-Service\b|CurrentVersion\\Run\b/i.test(c)) add('PSG014', n, 'this creates something that persists; confirm it is intended and document it');
    if (/\b(?:Write-Host|Write-Output|Write-Verbose|Write-Information|Write-Warning|Out-File|Set-Content|Add-Content|Tee-Object)\b[^\n]*\$(?!(?:skip|continuation|next|page)token)\w*(?:password|passwd|secret|token|apikey)\w*/i.test(c)) add('PSG015', n, 'a secret or token would be written out; log what happened, not the credential');
    if (/(?:Clear-MgDeviceManagementManagedDevice|Remove-MgDeviceManagementManagedDevice|Invoke-MgWipe\w*|Invoke-MgRetire\w*|Reset-MgDeviceManagement\w*|Remove-MgDevice\b|managedDevices\/[^\s'"]*\/(?:wipe|retire|cleanWindowsDevice))/i.test(c)) add('PSG018', n, 'wipe, retire and delete cannot be undone; require a named device list and a person to approve');
    if (/Set-Mailbox\b[^\n]*-(?:ForwardingSmtpAddress|ForwardingAddress|DeliverToMailboxAndForward)\b|New-InboxRule[^\n]*-(?:ForwardTo|ForwardAsAttachmentTo|RedirectTo)\b|\bAdd-MailboxPermission\b|\bAdd-RecipientPermission\b|New-TransportRule[^\n]*-(?:BlindCopyTo|RedirectMessageTo)\b|Set-MailboxFolderPermission\b/i.test(c)) add('PSG020', n, 'forwarding and delegation are a common route for data theft; change them only with explicit approval');
    if (/New-MgRoleManagementDirectoryRoleAssignment\b|Add-MgDirectoryRoleMember\b|New-MgDirectoryRoleMemberByRef\b|Add-AzureADDirectoryRoleMember\b|New-AzRoleAssignment\b|Add-MsolRoleMember\b|Add-ADGroupMember[^\n]*(?:Domain Admins|Enterprise Admins|Administrators)/i.test(c)) add('PSG021', n, 'assigning a privileged role needs explicit approval and should be time-limited');
    if (/Remove-MgUserAuthentication\w*|Update-MgPolicyAuthenticationMethodPolicy\w*|Reset-MgUserAuthenticationMethodPassword\b|Set-MsolUser[^\n]*-StrongAuthentication/i.test(c)) add('PSG022', n, 'removing or resetting authentication methods weakens an account; require identity verification first');
    if (/Remove-Item\b[^\n]*-Recurse[^\n]*-Force|Remove-Item\b[^\n]*-Force[^\n]*-Recurse/i.test(c) && /\$\w|\*/.test(c) && !/-WhatIf/i.test(c)) add('PSG023', n, 'recursive forced delete on a variable or wildcard path; check the path and add -WhatIf');
    if (isStateLine(c) && /-ErrorAction\s+(?:SilentlyContinue|Ignore)\b/i.test(c)) add('PSG024', n, 'a failed change would go unnoticed; let it fail or catch and log it');
    if (/\b(?:Connect-AzureAD|Connect-MsolService|Get-AzureAD\w+|Get-Msol\w+)\b/i.test(c)) add('PSG025', n, 'the Azure AD and MSOnline modules are deprecated by Microsoft; use Microsoft Graph PowerShell');
    if (/state\s*[=:]\s*['"]enabled['"]/i.test(c) && /ConditionalAccess/i.test(all)) add('PSG019', n, 'create Conditional Access policies as enabledForReportingButNotEnforced first and enable them after reviewing the sign-in impact');
  });

  if (changes) {
    const first = stateLines[0];
    const should = /SupportsShouldProcess/i.test(all);
    if (!should) add('PSG002', first, 'a script that changes state must declare [CmdletBinding(SupportsShouldProcess)] so -WhatIf works');
    if (should && !/\$PSCmdlet\.ShouldProcess\s*\(/i.test(all)) add('PSG003', first, 'SupportsShouldProcess is declared but $PSCmdlet.ShouldProcess() is never called, so -WhatIf does nothing');
    if (should && !/\$WhatIfPreference\s*=/i.test(all) && !/\[switch\]\s*\$(?:Apply|Execute|Commit)\b/i.test(all)) add('PSG004', first, 'default to a dry run: add [switch]$Apply and set $WhatIfPreference = -not $Apply');
    if (!/\$ErrorActionPreference\s*=\s*['"]Stop['"]|-ErrorAction\s+Stop\b|\btry\s*\{/i.test(all)) add('PSG016', first, 'no error handling; set $ErrorActionPreference to Stop and catch failures so a half-finished change is visible');
    if (!/Start-Transcript|Write-Verbose|Write-Information|Export-Csv|Out-File|Add-Content|Write-Output|Write-Host/i.test(all)) add('PSG017', first, 'nothing records what the script did; write a log or a CSV of every change');
  }

  const scopes = readScopes(lines);
  if (!changes) {
    const write = scopes.filter((s) => /ReadWrite|PrivilegedOperations|\.Send\b|Directory\.AccessAsUser\.All/i.test(s.scope));
    for (const s of write) add('PSG007', s.line, `this script only reads but asks for ${s.scope}; request the matching Read scope instead`);
  }

  const stmts = statements(lines);
  for (const s of stmts) {
    const getAll = /\bGet-\w+\b[^|;{]*\s-All\b/i.test(s.text);
    const pipes = /\|[^\n]*\b(?:Remove|Disable|Revoke|Reset|Clear|Update|Set|Add)-(?:Mg|Az|AzureAD|Msol|Mailbox|AD)\w*/i.test(s.text);
    const guard = /Where-Object|\|\s*\?\s*\{|-Filter\b|-Search\b|Select-Object[^|]*-First|-First\s+\d|MaxChanges|-Skip\b/i.test(s.text);
    if (getAll && pipes && !guard) add('PSG006', s.line, 'this changes every object returned by -All; filter the set, cap the number of changes and show a count first');
  }
  lines.forEach((l, i) => {
    if (!/\bforeach\s*\(\s*\$\w+\s+in\s+\(?\s*Get-\w+[^)]*\s-All\b/i.test(l.code) || /Where-Object|-Filter\b|-Search\b|-First\s+\d/i.test(l.code)) return;
    let depth = 0;
    let started = false;
    let body = '';
    for (let j = i; j < lines.length && j < i + 40; j++) {
      const code = lines[j].code;
      if (j > i || code.includes('{')) body += `${code}\n`;
      for (const ch of code) { if (ch === '{') { depth += 1; started = true; } if (ch === '}') depth -= 1; }
      if (started && depth <= 0) break;
    }
    if (DESTRUCTIVE_RE.test(body) || /\b(?:Update|Set)-(?:Mg|Az|AzureAD|Msol|Mailbox|AD)\w*/i.test(body)) {
      if (!/\bif\s*\(|Where-Object|MaxChanges|\bcontinue\b|-First\s+\d/i.test(body)) add('PSG006', i + 1, 'this loop changes every object returned by -All; filter the set, cap the number of changes and show a count first');
    }
  });

  const { lineAllow, fileAllow, problems } = parseOverrides(lines);
  for (const p of problems) add('PSG026', p.line, p.message);
  const kept = findings.filter((f) => {
    if (f.rule === 'PSG026') return true;
    if (fileAllow.has(f.rule)) return false;
    return !lineAllow.some((a) => a.rule === f.rule && (a.line === f.line || a.line === f.line - 1));
  });
  kept.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return kept;
}

const SKIP = new Set(['.git', 'node_modules']);
export function listScripts(path) {
  const abs = resolve(path);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  const out = [];
  (function walk(d) {
    for (const n of readdirSync(d).sort()) {
      if (SKIP.has(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(?:ps1|psm1)$/i.test(n)) out.push(p);
    }
  })(abs);
  return out;
}

export function checkPaths(paths) {
  const findings = [];
  let files = 0;
  for (const p of paths) {
    const base = resolve(p);
    const isDir = statSync(base).isDirectory();
    for (const f of listScripts(p)) {
      files += 1;
      const label = isDir ? relative(base, f).split(sep).join('/') : f.split(sep).pop();
      findings.push(...checkText(readFileSync(f, 'utf8'), label));
    }
  }
  return { files, findings };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkText, checkPaths, splitLines, RULES } from '../skills/it-admin-guardrails/scripts/lib.mjs';
import { main } from '../skills/it-admin-guardrails/scripts/check-ps.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'skills/it-admin-guardrails/scripts');
const ids = (text) => new Set(checkText(text).map((f) => f.rule));
const capture = (argv) => {
  const out = [];
  const err = [];
  const code = main(argv, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join('\n'), err: err.join('\n') };
};

// Each rule has a script that must trigger it and one that must not.
const SAFE_CHANGE = '[CmdletBinding(SupportsShouldProcess)]\nparam([switch]$Apply)\n$ErrorActionPreference = "Stop"\nif (-not $Apply) { $WhatIfPreference = $true }\nif ($PSCmdlet.ShouldProcess($u, "x")) { Update-MgUser -UserId $u -AccountEnabled:$false }\nWrite-Output "done"';
const CASES = {
  PSG001: { bad: '$password = "Hunter2-example"', good: '$password = Read-Host -AsSecureString' },
  PSG002: { bad: 'Remove-MgUser -UserId $u', good: 'Get-MgUser -UserId $u' },
  PSG003: { bad: '[CmdletBinding(SupportsShouldProcess)]\nparam()\nRemove-MgUser -UserId $u', good: SAFE_CHANGE },
  PSG004: { bad: '[CmdletBinding(SupportsShouldProcess)]\nparam()\nif ($PSCmdlet.ShouldProcess($u, "x")) { Remove-MgUser -UserId $u }', good: SAFE_CHANGE },
  PSG005: { bad: 'Remove-MgUser -UserId $u -Confirm:$false', good: 'Remove-MgUser -UserId $u' },
  PSG006: { bad: 'Get-MgUser -All | Remove-MgUser', good: 'Get-MgUser -All | Where-Object { $_.Department -eq "Sales" } | Remove-MgUser' },
  PSG007: { bad: 'Connect-MgGraph -Scopes "User.ReadWrite.All"\nGet-MgUser -All', good: 'Connect-MgGraph -Scopes "User.Read.All"\nGet-MgUser -All' },
  PSG008: { bad: 'Set-ExecutionPolicy Unrestricted -Force', good: 'Set-ExecutionPolicy RemoteSigned -Scope Process' },
  PSG009: { bad: 'iex (irm https://scripts.example.invalid/a.ps1)', good: 'irm https://scripts.example.invalid/a.ps1 -OutFile a.ps1' },
  PSG010: { bad: 'Invoke-Expression $command', good: '& $command' },
  PSG011: { bad: '[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }', good: 'Invoke-RestMethod -Uri https://api.example.invalid/x' },
  PSG012: { bad: '$app = "11111111-2222-3333-4444-555555555555"', good: '$app = "00000000-0000-0000-0000-000000000000"' },
  PSG013: { bad: 'Set-MpPreference -DisableRealtimeMonitoring $true', good: 'Get-MpPreference' },
  PSG014: { bad: 'Register-ScheduledTask -TaskName "x" -Action $a', good: 'Get-ScheduledTask -TaskName "x"' },
  PSG015: { bad: 'Write-Host "token: $apiToken"', good: 'Write-Host "next: $skipToken"' },
  PSG016: { bad: 'Remove-MgUser -UserId $u\nWrite-Output "x"', good: '$ErrorActionPreference = "Stop"\nRemove-MgUser -UserId $u\nWrite-Output "x"' },
  PSG017: { bad: '$ErrorActionPreference = "Stop"\nRemove-MgUser -UserId $u', good: '$ErrorActionPreference = "Stop"\nRemove-MgUser -UserId $u\nWrite-Output "removed $u"' },
  PSG018: { bad: 'Clear-MgDeviceManagementManagedDevice -ManagedDeviceId $id', good: 'Get-MgDeviceManagementManagedDevice -ManagedDeviceId $id' },
  PSG019: { bad: '$p = @{ state = "enabled" }\nInvoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -Body $p', good: '$p = @{ state = "enabledForReportingButNotEnforced" }\nInvoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -Body $p' },
  PSG020: { bad: 'Set-Mailbox -Identity $m -ForwardingSmtpAddress "x@mail.example"', good: 'Get-Mailbox -Identity $m' },
  PSG021: { bad: 'New-MgRoleManagementDirectoryRoleAssignment -PrincipalId $p -RoleDefinitionId $r -DirectoryScopeId "/"', good: 'Get-MgRoleManagementDirectoryRoleAssignment -All' },
  PSG022: { bad: 'Remove-MgUserAuthenticationPhoneMethod -UserId $u -PhoneAuthenticationMethodId $m', good: 'Get-MgUserAuthenticationMethod -UserId $u' },
  PSG023: { bad: 'Remove-Item -Path "$root\\*" -Recurse -Force', good: 'Remove-Item -Path "$root\\*" -Recurse -Force -WhatIf' },
  PSG024: { bad: 'Invoke-MgGraphRequest -Method PATCH -Uri $uri -Body $b -ErrorAction SilentlyContinue', good: 'Invoke-MgGraphRequest -Method GET -Uri $uri -ErrorAction SilentlyContinue' },
  PSG025: { bad: 'Connect-AzureAD', good: 'Connect-MgGraph -Scopes "User.Read.All"' },
  PSG026: { bad: '# guardrail-allow PSG018:\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id', good: '# guardrail-allow PSG018: approved by the service owner, ticket CHG-0000\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id' },
};

test('every rule has a positive and a negative case, and the table matches rules.json', () => {
  assert.deepEqual(Object.keys(CASES).sort(), RULES.map((r) => r.id).sort());
  assert.equal(RULES.length, 26);
  assert.equal(RULES.filter((r) => r.severity === 'error').length, 15);
  assert.equal(RULES.filter((r) => r.severity === 'warning').length, 11);
});

for (const [rule, c] of Object.entries(CASES)) {
  test(`${rule} fires on the bad case and stays quiet on the good one`, () => {
    assert.ok(ids(c.bad).has(rule), `${rule} should fire on: ${c.bad}`);
    assert.ok(!ids(c.good).has(rule), `${rule} should not fire on: ${c.good}`);
  });
}

test('the complete safe change has no findings at all', () => {
  assert.deepEqual(checkText(SAFE_CHANGE), []);
});

test('findings carry file, line, rule, severity and a message', () => {
  const [f] = checkText('Get-MgUser -All | Remove-MgUser', 'x.ps1').filter((x) => x.rule === 'PSG006');
  assert.equal(f.file, 'x.ps1');
  assert.equal(f.line, 1);
  assert.equal(f.severity, 'error');
  assert.ok(f.message.length > 10);
});

test('the loop form of PSG006 is caught, and a guarded loop is not', () => {
  const bad = 'foreach ($u in (Get-MgUser -All)) {\n  Remove-MgUser -UserId $u.Id\n}';
  const good = 'foreach ($u in (Get-MgUser -All)) {\n  if ($u.Department -ne "Sales") { continue }\n  Remove-MgUser -UserId $u.Id\n}';
  assert.ok(ids(bad).has('PSG006'));
  assert.ok(!ids(good).has('PSG006'));
});

test('a statement split over lines with backticks or pipes is joined for PSG006', () => {
  assert.ok(ids('Get-MgUser -All |\n  Remove-MgUser').has('PSG006'));
  assert.ok(ids('Get-MgUser `\n  -All | Remove-MgUser').has('PSG006'));
});

test('comments and block comments are not scanned for commands', () => {
  const text = '# Remove-MgUser -UserId $u\n<#\nRemove-MgUser -UserId $u\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id\n#>\nGet-MgUser -UserId $u';
  assert.deepEqual(checkText(text), []);
});

test('a hash inside a string is not treated as a comment', () => {
  const lines = splitLines('Write-Output "a # b" # real comment');
  assert.ok(lines[0].code.includes('a # b'));
  assert.ok(lines[0].comment.includes('real comment'));
});

test('PSG007 allows a Read scope and a write scope when the script also changes state', () => {
  assert.ok(!ids('Connect-MgGraph -Scopes "User.ReadWrite.All"\nRemove-MgUser -UserId $u').has('PSG007'));
  assert.ok(!ids('Connect-MgGraph -Scopes "User.Read.All","AuditLog.Read.All"\nGet-MgUser').has('PSG007'));
});

test('PSG012 ignores the all-zero GUID and the well-known Graph application id suffix', () => {
  assert.ok(!ids('$g = "00000000-0000-0000-0000-000000000000"').has('PSG012'));
  assert.ok(!ids('$g = "00000003-0000-0000-c000-000000000000"').has('PSG012'));
});

test('PSG001 catches a SecureString built from a literal and a pasted bearer token', () => {
  assert.ok(ids('$s = ConvertTo-SecureString "Literal-pass-1" -AsPlainText -Force').has('PSG001'));
  assert.ok(ids('$h = @{ Authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6" }').has('PSG001'));
  assert.ok(!ids('$secret = $env:APP_SECRET').has('PSG001'));
});

test('a line override suppresses the finding on the same line or the line below', () => {
  const below = '# guardrail-allow PSG018: approved by the service owner, ticket CHG-0000\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id';
  const same = 'Clear-MgDeviceManagementManagedDevice -ManagedDeviceId $id # guardrail-allow PSG018: approved, ticket CHG-0000';
  assert.ok(!ids(below).has('PSG018'));
  assert.ok(!ids(same).has('PSG018'));
});

test('a line override does not reach further than the next line, or another rule', () => {
  const far = '# guardrail-allow PSG018: approved, ticket CHG-0000\n\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id';
  assert.ok(ids(far).has('PSG018'));
  const other = '# guardrail-allow PSG013: approved, ticket CHG-0000\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id';
  assert.ok(ids(other).has('PSG018'));
});

test('a file override suppresses a rule everywhere in the file', () => {
  const text = '# guardrail-allow-file PSG016: the wrapper handles errors\nRemove-MgUser -UserId $u\nWrite-Output "x"';
  assert.ok(!ids(text).has('PSG016'));
  assert.ok(ids(text).has('PSG002'));
});

test('an override with no reason is reported and does not suppress the finding', () => {
  const found = ids('# guardrail-allow PSG018:\nClear-MgDeviceManagementManagedDevice -ManagedDeviceId $id');
  assert.ok(found.has('PSG026'));
  assert.ok(found.has('PSG018'));
});

test('findings are sorted by line then rule', () => {
  const f = checkText(readFileSync(join(ROOT, 'examples/unsafe/mail-and-roles.ps1'), 'utf8'));
  const keys = f.map((x) => `${String(x.line).padStart(4, '0')}${x.rule}`);
  assert.deepEqual(keys, [...keys].sort());
});

test('the unsafe examples produce exactly the recorded findings', () => {
  const r = capture([join(ROOT, 'examples/unsafe'), '--json', '--fail-on', 'none']);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out), JSON.parse(readFileSync(join(ROOT, 'examples/unsafe-findings.json'), 'utf8')));
});

test('every rule is exercised by the unsafe examples or by a case above', () => {
  const seen = new Set(checkPaths([join(ROOT, 'examples/unsafe')]).findings.map((f) => f.rule));
  for (const r of RULES) assert.ok(seen.has(r.id) || CASES[r.id], r.id);
  assert.ok(seen.size >= 20, `examples cover ${seen.size} rules`);
});

test('the safe examples and the template are clean', () => {
  const r = capture([join(ROOT, 'examples/safe'), join(ROOT, 'skills/it-admin-guardrails/templates'), '--fail-on', 'warning']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /3 file\(s\): 0 error\(s\), 0 warning\(s\)/);
});

test('every rule appears in references/rules.md and in the SKILL text count', () => {
  const doc = readFileSync(join(ROOT, 'skills/it-admin-guardrails/references/rules.md'), 'utf8');
  for (const r of RULES) assert.ok(doc.includes(`| ${r.id} | ${r.severity} |`), r.id);
  assert.ok(readFileSync(join(ROOT, 'skills/it-admin-guardrails/SKILL.md'), 'utf8').includes('26 rules'));
});

test('exit codes follow --fail-on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-'));
  const warn = join(dir, 'warn.ps1');
  writeFileSync(warn, 'Connect-AzureAD\n');
  const err = join(dir, 'err.ps1');
  writeFileSync(err, 'Set-ExecutionPolicy Bypass\n');
  assert.equal(capture([warn]).code, 0);
  assert.equal(capture([warn, '--fail-on', 'warning']).code, 1);
  assert.equal(capture([err]).code, 1);
  assert.equal(capture([err, '--fail-on', 'none']).code, 0);
});

test('usage errors exit 2: no path, missing path, bad --fail-on', () => {
  assert.equal(capture([]).code, 2);
  assert.equal(capture([join(tmpdir(), 'does-not-exist-ps')]).code, 2);
  assert.equal(capture([join(ROOT, 'examples/safe'), '--fail-on', 'banana']).code, 2);
  assert.equal(capture([join(ROOT, 'examples/safe'), '--fail-on']).code, 2);
});

test('--help and --rules print and exit 0', () => {
  assert.equal(capture(['--help']).code, 0);
  const r = capture(['--rules']);
  assert.equal(r.code, 0);
  assert.equal(r.out.split('\n').length, 26);
});

test('a single file and a folder are both accepted; folders are walked recursively and skip node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ps-'));
  mkdirSync(join(dir, 'sub'));
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'sub', 'a.ps1'), 'Connect-AzureAD\n');
  writeFileSync(join(dir, 'b.psm1'), 'Get-MgUser\n');
  writeFileSync(join(dir, 'notes.txt'), 'Remove-MgUser\n');
  writeFileSync(join(dir, 'node_modules', 'c.ps1'), 'Remove-MgUser\n');
  const folder = checkPaths([dir]);
  assert.equal(folder.files, 2);
  assert.equal(folder.findings[0].file, 'sub/a.ps1');
  assert.equal(checkPaths([join(dir, 'sub', 'a.ps1')]).files, 1);
});

test('the CLI runs as a process', () => {
  const r = spawnSync(process.execPath, [join(SCRIPTS, 'check-ps.mjs'), join(ROOT, 'examples/unsafe')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /3 file\(s\): 18 error\(s\), 10 warning\(s\)/);
  const ok = spawnSync(process.execPath, [join(SCRIPTS, 'check-ps.mjs'), join(ROOT, 'examples/safe')], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
});

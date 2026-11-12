#!/usr/bin/env node
// Check PowerShell admin scripts against the guardrail rules. Zero dependencies; never runs PowerShell.
//   check-ps.mjs <file-or-folder>... [--fail-on error|warning|none] [--json]
//   check-ps.mjs --rules
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPaths, RULES } from './lib.mjs';

const USAGE = `usage: check-ps.mjs <file-or-folder>... [--fail-on error|warning|none] [--json]
       check-ps.mjs --rules
Override a finding with a comment that has a reason:
  # guardrail-allow PSG018: approved by change CHG-1234, device list reviewed
  # guardrail-allow-file PSG016: wrapper handles errors
exit codes: 0 ok, 1 findings at or above --fail-on (default error), 2 usage error`;

export function main(argv, out = console.log, err = console.error) {
  const flags = {};
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fail-on') { flags['fail-on'] = argv[i + 1]; i += 1; } else if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = true;
    else paths.push(argv[i]);
  }
  if (flags.help) { out(USAGE); return 0; }
  if (flags.rules) { for (const r of RULES) out(`${r.id}  ${r.severity.padEnd(7)}  ${r.summary}`); return 0; }
  const failOn = 'fail-on' in flags ? flags['fail-on'] : 'error';
  if (!paths.length || !['error', 'warning', 'none'].includes(failOn)) { err(USAGE); return 2; }
  for (const p of paths) if (!existsSync(resolve(p))) { err(`no such file or folder: ${p}`); return 2; }
  const { files, findings } = checkPaths(paths);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  if (flags.json) out(JSON.stringify({ files, errors, warnings, findings }, null, 2));
  else {
    for (const f of findings) out(`${f.file}:${f.line}  ${f.rule}  ${f.severity}  ${f.message}`);
    out(`${files} file(s): ${errors} error(s), ${warnings} warning(s)`);
  }
  if (failOn === 'none') return 0;
  return errors > 0 || (failOn === 'warning' && warnings > 0) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

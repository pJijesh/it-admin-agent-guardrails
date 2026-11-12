#!/usr/bin/env node
// Installs the skill for one or more coding agents. Zero dependencies.
//   node scripts/install.mjs <claude|codex|opencode|cursor|all> [--dir <project>] [--global] [--dry-run]
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { agentsBlock, cursorRule, BLOCK_START, BLOCK_END } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_SRC = join(ROOT, 'skills', 'it-admin-guardrails');
export const TARGETS = ['claude', 'codex', 'opencode', 'cursor'];

export function upsertBlock(existing, block) {
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start >= 0 && end > start) return existing.slice(0, start) + block.trimEnd() + existing.slice(end + BLOCK_END.length);
  const sep = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return existing + sep + block;
}

export function plan(target, { dir, global: isGlobal }) {
  const actions = [];
  const copySkill = (to) => actions.push({ kind: 'copy', from: SKILL_SRC, to });
  const scripts = (base) => join(base, 'scripts');
  if (target === 'claude') {
    const base = isGlobal ? join(homedir(), '.claude', 'skills', 'it-admin-guardrails') : join(dir, '.claude', 'skills', 'it-admin-guardrails');
    copySkill(base);
  } else if (target === 'codex') {
    const base = join(dir, '.agents', 'skills', 'it-admin-guardrails');
    copySkill(base);
    actions.push({ kind: 'block', to: join(dir, 'AGENTS.md'), text: agentsBlock().replaceAll('{{SCRIPTS}}', scripts(base)) });
  } else if (target === 'opencode') {
    const base = join(dir, '.opencode', 'skills', 'it-admin-guardrails');
    copySkill(base);
    actions.push({ kind: 'block', to: join(dir, 'AGENTS.md'), text: agentsBlock().replaceAll('{{SCRIPTS}}', scripts(base)) });
  } else if (target === 'cursor') {
    const base = join(dir, '.cursor', 'it-admin-guardrails');
    copySkill(base);
    actions.push({ kind: 'file', to: join(dir, '.cursor', 'rules', 'it-admin-guardrails.mdc'), text: cursorRule().replaceAll('{{SCRIPTS}}', scripts(base)) });
  } else throw new Error(`unknown target ${target}`);
  return actions;
}

export function apply(actions, dryRun = false) {
  const log = [];
  for (const a of actions) {
    if (a.kind === 'copy') {
      if (!dryRun) { mkdirSync(dirname(a.to), { recursive: true }); cpSync(a.from, a.to, { recursive: true }); }
      log.push(`copy  ${a.to}`);
    } else if (a.kind === 'file') {
      if (!dryRun) { mkdirSync(dirname(a.to), { recursive: true }); writeFileSync(a.to, a.text); }
      log.push(`write ${a.to}`);
    } else {
      const existing = existsSync(a.to) ? readFileSync(a.to, 'utf8') : '';
      if (!dryRun) { mkdirSync(dirname(a.to), { recursive: true }); writeFileSync(a.to, upsertBlock(existing, a.text)); }
      log.push(`merge ${a.to}`);
    }
  }
  return log;
}

function main(argv) {
  const args = argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const targets = args.filter((a, i) => !a.startsWith('--') && !(dirIdx >= 0 && i === dirIdx + 1));
  const dir = resolve(dirIdx >= 0 ? args[dirIdx + 1] : process.cwd());
  const dry = args.includes('--dry-run');
  const isGlobal = args.includes('--global');
  if (!targets.length || args.includes('--help')) {
    console.log('usage: install.mjs <claude|codex|opencode|cursor|all> [--dir <project>] [--global] [--dry-run]');
    return args.includes('--help') ? 0 : 2;
  }
  const list = targets.includes('all') ? TARGETS : targets;
  for (const t of list) if (!TARGETS.includes(t)) { console.error(`unknown target: ${t}`); return 2; }
  if (isGlobal && list.some((t) => t !== 'claude')) console.error('note: --global applies to claude only; other targets install into the project');
  for (const t of list) for (const line of apply(plan(t, { dir, global: isGlobal }), dry)) console.log(`${t.padEnd(8)} ${dry ? '(dry run) ' : ''}${line}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv));

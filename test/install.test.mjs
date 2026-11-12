import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, apply, upsertBlock, TARGETS } from '../scripts/install.mjs';
import { agentsBlock, outputs, BLOCK_START, BLOCK_END } from '../scripts/build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => mkdtempSync(join(tmpdir(), 'skill-'));
const SKILL = 'it-admin-guardrails';
const PRIMARY = 'check-ps.mjs';

test('claude install copies the whole skill', () => {
  const dir = tmp();
  apply(plan('claude', { dir }));
  const base = join(dir, '.claude', 'skills', SKILL);
  for (const f of ["SKILL.md", "scripts/check-ps.mjs", "scripts/lib.mjs", "scripts/rules.json", "templates/safe-script-template.ps1", "references/approval-gates.md", "references/rules.md"]) assert.ok(existsSync(join(base, f)), f);
});

test('the installed script runs from the install location', () => {
  const dir = tmp();
  apply(plan('claude', { dir }));
  const r = spawnSync(process.execPath, [join(dir, '.claude/skills', SKILL, 'scripts', PRIMARY), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('codex and opencode merge a marked block into AGENTS.md with the real script path', () => {
  for (const t of ['codex', 'opencode']) {
    const dir = tmp();
    writeFileSync(join(dir, 'AGENTS.md'), '# Project rules\n\nBe kind.\n');
    apply(plan(t, { dir }));
    const text = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    assert.ok(text.startsWith('# Project rules'));
    assert.ok(text.includes(BLOCK_START) && text.includes(BLOCK_END));
    assert.ok(!text.includes('{{SCRIPTS}}'));
    assert.ok(text.includes(join(dir, t === 'codex' ? '.agents' : '.opencode', 'skills', SKILL, 'scripts', PRIMARY)));
  }
});

test('installing twice does not duplicate the AGENTS.md block', () => {
  const dir = tmp();
  apply(plan('codex', { dir }));
  apply(plan('codex', { dir }));
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8').split(BLOCK_START).length - 1, 1);
});

test('cursor gets a .mdc rule with frontmatter and the script path filled in', () => {
  const dir = tmp();
  apply(plan('cursor', { dir }));
  const text = readFileSync(join(dir, '.cursor/rules', SKILL + '.mdc'), 'utf8');
  assert.ok(text.startsWith('---\ndescription:'));
  assert.ok(text.includes('alwaysApply: false'));
  assert.ok(!text.includes('{{SCRIPTS}}'));
  assert.ok(existsSync(join(dir, '.cursor', SKILL, 'scripts', PRIMARY)));
});

test('dry run writes nothing', () => {
  const dir = tmp();
  assert.ok(apply(plan('claude', { dir }), true).length > 0);
  assert.ok(!existsSync(join(dir, '.claude')));
});

test('upsertBlock replaces an existing block and keeps surrounding text', () => {
  const first = upsertBlock('top\n', agentsBlock());
  const edited = first.replace('Ground rules', 'RULES-EDITED');
  const second = upsertBlock(edited + 'bottom\n', agentsBlock());
  assert.ok(second.includes('top') && second.includes('bottom'));
  assert.ok(!second.includes('RULES-EDITED'));
  assert.equal(second.split(BLOCK_START).length - 1, 1);
});

test('the CLI handles unknown targets, no arguments and --dry-run with or without --dir', () => {
  const run = (...a) => spawnSync(process.execPath, [join(ROOT, 'scripts/install.mjs'), ...a], { encoding: 'utf8' });
  assert.equal(run('banana').status, 2);
  assert.equal(run().status, 2);
  const r = run('all', '--dir', tmp(), '--dry-run');
  assert.equal(r.status, 0);
  for (const t of TARGETS) assert.ok(r.stdout.includes(t));
  const n = run('all', '--dry-run');
  assert.equal(n.status, 0, n.stderr);
  assert.equal(run('claude', '--dry-run').status, 0);
});

test('committed generated files are current', () => {
  for (const [path, text] of Object.entries(outputs())) assert.equal(readFileSync(path, 'utf8'), text, path);
});

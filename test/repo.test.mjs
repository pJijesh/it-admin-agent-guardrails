import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules']);
const TEXT = new Set(['.md', '.mjs', '.json', '.html', '.yml', '.yaml', '.mdc', '.cff', '.txt', '.py', '.js', '.ps1', '.psm1', '.psd1', '']);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(ROOT);

test('no em or en dashes in any text file', () => {
  const bad = [];
  for (const f of files) {
    if (!TEXT.has(extname(f))) continue;
    if (/[\u2013\u2014]/.test(readFileSync(f, 'utf8'))) bad.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(bad, []);
});

test('markdown relative links resolve', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const t = m[1];
      if (/^[a-z]+:/.test(t) || t.startsWith('#')) continue;
      const target = t.split('#')[0];
      if (target && !existsSync(resolve(dirname(f), target))) bad.push(`${f.slice(ROOT.length + 1)} -> ${t}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('SKILL.md has valid frontmatter and every referenced file exists', () => {
  const dir = join(ROOT, 'skills/it-admin-guardrails');
  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const fm = /^---\nname: ([a-z-]+)\ndescription: (.+)\n---\n/.exec(text);
  assert.ok(fm, 'frontmatter');
  assert.equal(fm[1], 'it-admin-guardrails');
  assert.ok(fm[2].length <= 1024);
  for (const m of text.matchAll(/references\/([a-z/-]+\.md)/g)) assert.ok(existsSync(join(dir, 'references', m[1])), m[1]);
});

test('package version agrees with the changelog and citation', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), new RegExp(`## \\[${pkg.version.replace(/\./g, '\\.')}\\]`));
  assert.ok(readFileSync(join(ROOT, 'CITATION.cff'), 'utf8').includes(`version: ${pkg.version}`));
});

test('README follows the house structure', () => {
  const r = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.equal(r.split('\n')[0], '# it-admin-agent-guardrails');
  const order = ['**Problem:**', '**For:**', '**Demonstrates:**', '## What it does', '## Install', '## How it works', '## How it is built', '## Design choices', '## Limitations', '## Verification status', '## Roadmap', '## Licence'];
  const pos = order.map((m) => r.indexOf(m));
  assert.ok(pos.every((p) => p >= 0), `missing: ${order.filter((_, i) => pos[i] < 0)}`);
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b));
});

test('the skill has no dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('no real-looking secrets in the repository', () => {
  const bad = [];
  for (const f of files) {
    if (!TEXT.has(extname(f))) continue;
    const t = readFileSync(f, 'utf8');
    if (/AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(t)) bad.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(bad, []);
});

test('required files exist', () => {
  for (const f of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CITATION.cff', 'CHANGELOG.md', '.github/workflows/test.yml', '.github/dependabot.yml', 'docs/images/banner.png']) {
    assert.ok(existsSync(join(ROOT, f)), f);
  }
});

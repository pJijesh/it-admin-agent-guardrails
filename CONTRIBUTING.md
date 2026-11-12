# Contributing

Thanks for taking an interest. This is a small skill with a small checker: standard library only, deterministic output, plain wording.

## Ground rules

1. **Fictional examples only.** Scripts in `examples/` describe an invented organisation. Never commit a real tenant, domain, account, device or credential, even a revoked one.
2. **No dependencies** in the skill or the scripts. Test tooling uses `node:test`.
3. **Every rule is tested and documented.** Add it to `rules.json`, `references/rules.md` and the case table in `test/check.test.mjs`, with a bad and a good snippet; a test fails if any is missing.
4. **The checker reads text.** It must never run PowerShell, call a service or need a Windows machine.
5. **Prefer a false negative to a noisy rule.** A rule that cries wolf gets overridden or removed. If a pattern is too broad, narrow it and add the good case that was wrongly flagged.
6. **Do not copy other projects.** Write your own wording and examples. Credit related work in the README.
7. **British English, plain tone, no long dashes.** A test fails if an em dash or en dash appears in a text file.

## Development

```bash
node --test                  # all tests
node scripts/build.mjs       # regenerate the adapters after editing core.md
node scripts/build.mjs --check
node skills/it-admin-guardrails/scripts/check-ps.mjs examples/unsafe --json --fail-on none > examples/unsafe-findings.json
```

If you change a rule or an unsafe example, regenerate `examples/unsafe-findings.json` and read the diff before committing.

## Suggesting a rule

Open a suggestion. Show a short script that does something risky and is not flagged, or a safe one that is flagged, and say which rule should change.

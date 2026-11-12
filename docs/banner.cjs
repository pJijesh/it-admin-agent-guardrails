const { chromium } = require('playwright');
const html = `<html><body style="margin:0;width:1280px;height:360px;background:#f6f3ec;color:#1d1d1b;font-family:Georgia,'Times New Roman',serif;position:relative">
<div style="position:absolute;left:80px;top:46px;font-size:54px;font-weight:700;letter-spacing:-1px">it-admin-agent-guardrails</div>
<div style="position:absolute;left:80px;top:122px;font-size:24px;color:#55534e;font-family:Helvetica,Arial,sans-serif">PowerShell written by an agent: dry run by default, a person approves the dangerous parts.</div>
<div style="position:absolute;left:80px;top:190px;width:1120px;font-family:Menlo,Consolas,monospace;font-size:20px;line-height:1.7">
<div><span style="color:#55534e">offboard-everyone.ps1:6</span>  <span style="color:#b3261e;font-weight:700">PSG005</span>  -Confirm:$false on a destructive command</div>
<div><span style="color:#55534e">device-cleanup.ps1:4</span>  <span style="color:#b3261e;font-weight:700">PSG018</span>  wipe cannot be undone, needs approval</div>
<div><span style="color:#55534e">disable-leavers.ps1</span>  <span style="color:#2e7d32;font-weight:700">0 error(s)</span>, 0 warning(s)</div></div>
<div style="position:absolute;left:80px;bottom:26px;font-size:17px;color:#55534e;font-family:Helvetica,Arial,sans-serif">Claude Code, Codex, Cursor and OpenCode. Zero dependencies. Never runs PowerShell.</div></body></html>`;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 360 } });
await p.setContent(html); await p.screenshot({ path: process.argv[2] }); await b.close(); })();

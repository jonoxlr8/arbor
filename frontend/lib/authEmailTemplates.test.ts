import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
for(const [name,type] of [["confirm-signup","email"],["reset-password","recovery"]])test(`${name} keeps exact prefetch-safe link and email-safe brand`,()=>{
  const html=readFileSync(`../docs/auth-emails/${name}.html`,"utf8");
  const href=`https://arbor.ph/${name}#token_hash={{ .TokenHash }}&amp;type=${type}`;
  assert.equal(html.split(`href="${href}"`).length-1,2);
  assert.match(html,/arbor-email-logo-v2.png/);assert.match(html,/#0F5132/);
  assert.match(html,/never ask for your password/);assert.match(html,/arbor.ph<\/a>/);
  assert.doesNotMatch(html,/<script|<form|onerror=|\.ConfirmationURL|portfolio value|holdings/i);
});

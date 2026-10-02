import test from "node:test";
import assert from "node:assert/strict";
import { chatSourceParts } from "./chatSourceLinks";

test("reviewed HTTPS sources become separate text/link parts", () => {
  assert.deepEqual(chatSourceParts("Sources: [VT prospectus](https://www.vanguard.com/pub/Pdf/sp3141.pdf) (2026-02-27)."), [
    {text:"Sources: "}, {text:"VT prospectus", href:"https://www.vanguard.com/pub/Pdf/sp3141.pdf"}, {text:" (2026-02-27)."},
  ]);
});

test("unreviewed destinations, credentials, ports and executable schemes remain text", () => {
  for (const href of ["javascript:alert(1)", "http://www.vanguard.com/file", "https://www.vanguard.com.evil.example/file", "https://evil.example/file", "https://user:password@www.vanguard.com/file", "https://www.vanguard.com:8443/file"]) {
    const text = `[source](${href})`;
    assert.equal(chatSourceParts(text).some(part => part.href), false);
    assert.equal(chatSourceParts(text).map(part=>part.text).join(""), text);
  }
});

test("source labels and unrelated HTML remain literal text", () => {
  const result=chatSourceParts("<script>x</script> [<img src=x>](https://bitcoin.org/en/faq)");
  assert.deepEqual(result,[{text:"<script>x</script> "},{text:"<img src=x>",href:"https://bitcoin.org/en/faq"}]);
});

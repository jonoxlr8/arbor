/** Small, bounded source-link parser. Text is never rendered as HTML. */
export type ChatTextPart = { text: string; href?: string };
const SOURCE_HOSTS = new Set([
  "file.seedbox.ph", "www.uitf.com.ph", "uitf.com.ph", "help.gcash.com",
  "www.bpi.com.ph", "www.vanguard.com", "bitcoin.org", "help.dragonfi.ph",
  "www.heygotrade.com", "www.coins.ph", "support.coins.ph", "pdax.ph", "support.pdax.ph",
]);

export function chatSourceParts(text: string): ChatTextPart[] {
  const parts: ChatTextPart[] = [];
  const pattern = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > offset) parts.push({ text: text.slice(offset, start) });
    let href: string | undefined;
    try {
      const url = new URL(match[2]);
      if (url.protocol === "https:" && !url.username && !url.password && !url.port && SOURCE_HOSTS.has(url.hostname)) href = url.href;
    } catch { /* Keep malformed source syntax as plain text. */ }
    parts.push(href ? { text: match[1], href } : { text: match[0] });
    offset = start + match[0].length;
  }
  if (offset < text.length || !parts.length) parts.push({ text: text.slice(offset) });
  return parts;
}

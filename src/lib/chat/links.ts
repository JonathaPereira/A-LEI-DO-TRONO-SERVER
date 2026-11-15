export interface ChatTextSegment {
  readonly kind: 'text' | 'link';
  readonly text: string;
  readonly href?: string;
}

const URL_PATTERN = /(?:https?:\/\/|(?<![\w@./:-])www\.)[^\s<>"{}|\\^`[\]]+/gi;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', '"', "'"]);

function countChar(value: string, target: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === target) total++;
  }
  return total;
}

function trimTrailingDelimiters(raw: string): string {
  let trimmed = raw;
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (TRAILING_PUNCTUATION.has(last)) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }
    if (last === ')' && countChar(trimmed, ')') > countChar(trimmed, '(')) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }
    break;
  }
  return trimmed;
}

function normalizeHttpHref(candidate: string): string | null {
  const prefixed = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(prefixed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || /\s/.test(prefixed)) return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || (!host.includes('.') && host !== 'localhost')) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Splits chat message text into plain-text runs and validated HTTP/HTTPS link segments. */
export function parseChatLinks(text: string): readonly ChatTextSegment[] {
  if (!text) return [];
  const segments: ChatTextSegment[] = [];
  let cursor = 0;
  URL_PATTERN.lastIndex = 0;

  for (let match = URL_PATTERN.exec(text); match !== null; match = URL_PATTERN.exec(text)) {
    const start = match.index;
    const raw = trimTrailingDelimiters(match[0]);
    const href = raw ? normalizeHttpHref(raw) : null;
    if (!href) continue;

    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) });
    }
    segments.push({ kind: 'link', text: raw, href });
    cursor = start + raw.length;
    URL_PATTERN.lastIndex = cursor;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}

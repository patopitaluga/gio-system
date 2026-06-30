/**
 * Local HTTP fetch + HTML-to-text for deterministic URL reads.
 *
 * **news-agent** uses OpenAI's hosted `webSearchTool()` from `@openai/agents` instead
 * (see `agents/agent-news.ts`). Keep this module if we add a non-OpenAI LLM provider later —
 * those stacks won't have the Responses API web-search tool, so we'd wire
 * `tools/news-tools/fetch-web-page.ts` back as a function tool on top of `fetchWebPage`.
 */
const DEFAULT_MAX_CHARS = 12_000;
const MAX_LINKS = 80;

/** Return type for `fetchWebPage`. */
export type FetchWebPageResult = {
  url: string;
  text: string;
  links: string[];
  truncated: boolean;
};

/** Used in `fetchWebPage`. Used in `test/fetch-web-page.test.ts`. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Used in `fetchWebPage`. */
function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const pattern = /href=["']([^"'#]+)["']/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const absolute = new URL(match[1], baseUrl).href;

      if (absolute.startsWith('http://') || absolute.startsWith('https://')) links.add(absolute);
    } catch {
      // skip invalid URLs
    }
  }

  return [...links].slice(0, MAX_LINKS);
}

function assertFetchableUrl(url: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are allowed: ${url}`);
  }

  return parsed.href;
}

/**
 * Fetches a page and strips HTML to text.
 *
 * Used in `test/fetch-web-page.test.ts`. Alternative to hosted `web_search` for other LLM providers.
 */
export async function fetchWebPage(
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
): Promise<FetchWebPageResult> {
  const normalizedUrl = assertFetchableUrl(url);
  const response = await fetch(normalizedUrl, {
    headers: {
      'User-Agent': 'Gio-System/news-agent (+https://github.com/)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!response.ok) throw new Error(`Failed to fetch ${normalizedUrl}: HTTP ${response.status}`);

  const html = await response.text();
  const fullText = htmlToText(html);
  const truncated = fullText.length > maxChars;

  return {
    url: normalizedUrl,
    text: truncated ? `${fullText.slice(0, maxChars)}…` : fullText,
    links: extractLinks(html, normalizedUrl),
    truncated,
  };
}

/** Imported in `agents/agent-news.ts`. */
export function resolveNewsNewspaperUrl(): string {
  const configured = process.env.NEWS_NEWSPAPER_URL?.trim();

  if (!configured) throw new Error('NEWS_NEWSPAPER_URL is not set in .env');

  return assertFetchableUrl(configured);
}

/** Used in `agents/agent-news.ts` (`createNewsAgent`). */
export function resolveNewsNewspaperDomain(): string {
  return new URL(resolveNewsNewspaperUrl()).hostname;
}

/** Options for `wrapEmailHtml`. */
export type EmailHtmlOptions = {
  title: string;
  bodyHtml: string;
  vocabularyHtml?: string;
  linkUrl?: string;
  linkLabel?: string;
  preheader?: string;
};

/** Used in `wrapEmailHtml`. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Used in `wrapEmailHtml`. */
function sanitizeHttpUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return undefined;
  }

  return undefined;
}

/** Used in `wrapEmailHtml`. */
function buildLinkButton(linkUrl: string, linkLabel: string): string {
  const safeUrl = sanitizeHttpUrl(linkUrl);
  if (!safeUrl) return '';

  const label = escapeHtml(linkLabel);

  return `<p style="margin:0 0 28px;">
  <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">
    ${label}
  </a>
</p>`;
}

/**
 * Wraps rendered HTML in a simple, email-client-friendly layout.
 *
 * Imported in `lib/build-news-email.ts`.
 */
export function wrapEmailHtml(options: EmailHtmlOptions): string {
  const title = escapeHtml(options.title);
  const preheader = options.preheader ? escapeHtml(options.preheader) : '';
  const linkLabel = options.linkLabel ?? 'Read article';
  const linkBlock = options.linkUrl ? buildLinkButton(options.linkUrl, linkLabel) : '';
  const hasBody = options.bodyHtml.trim().length > 0;
  const separator = linkBlock && hasBody
    ? '<hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 28px;" />'
    : '';
  const hasVocabulary = Boolean(options.vocabularyHtml?.trim());
  const vocabularySeparator = hasBody && hasVocabulary
    ? '<hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0;" />'
    : '';
  const vocabularyBlock = hasVocabulary
    ? `<div style="font-size:15px;color:#3f3f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;">
                ${options.vocabularyHtml}
              </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:10px;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:36px 32px 32px;font-family:Georgia,'Times New Roman',serif;color:#18181b;line-height:1.65;">
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;font-weight:700;color:#09090b;">${title}</h1>
              ${linkBlock}
              ${separator}
              <div style="font-size:17px;color:#27272a;">
                ${options.bodyHtml}
              </div>
              ${vocabularySeparator}
              ${vocabularyBlock}
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#71717a;">
          Gio-System
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

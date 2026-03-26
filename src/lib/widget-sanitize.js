// Sanitize HTML during streaming — strip unclosed script tags
// to prevent JS source code from rendering as visible text.
//
// Extracted to a separate .js file because Vue SFC compiler
// treats '</script>' string literals as tag boundaries, even
// inside JS expressions.

const TAG_OPEN = '\x3cscript'    // <script (hex escape avoids parser)
const TAG_CLOSE = '\x3c/script>' // </script>

export function sanitizeForStreaming(html) {
  const lastOpen = html.lastIndexOf(TAG_OPEN)
  if (lastOpen === -1) return html
  const lastClose = html.lastIndexOf(TAG_CLOSE)
  if (lastClose > lastOpen) return html
  return html.substring(0, lastOpen)
}

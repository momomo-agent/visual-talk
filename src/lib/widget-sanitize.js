// Sanitize HTML during streaming — strip incomplete tags/entities/attributes
// to prevent broken rendering and visible source code.

export function sanitizeForStreaming(html) {
  if (!html) return ''
  
  // 1. Strip unclosed <script> tags
  const scriptOpen = html.lastIndexOf('\x3cscript')
  const scriptClose = html.lastIndexOf('\x3c/script>')
  if (scriptOpen !== -1 && scriptClose < scriptOpen) {
    html = html.substring(0, scriptOpen)
  }
  
  // 2. Strip incomplete HTML entities (&xxx)
  const lastAmp = html.lastIndexOf('&')
  if (lastAmp !== -1) {
    const afterAmp = html.substring(lastAmp)
    if (!/^&[a-zA-Z0-9#]+;/.test(afterAmp)) {
      html = html.substring(0, lastAmp)
    }
  }
  
  // 3. Strip incomplete opening tag (<xxx)
  const lastLt = html.lastIndexOf('<')
  if (lastLt !== -1) {
    const afterLt = html.substring(lastLt)
    // If no closing >, it's incomplete
    if (!afterLt.includes('>')) {
      html = html.substring(0, lastLt)
    }
  }
  
  // 4. Strip incomplete attribute (attr=")
  const lastQuote = Math.max(html.lastIndexOf('"'), html.lastIndexOf("'"))
  if (lastQuote !== -1) {
    const afterQuote = html.substring(lastQuote + 1)
    // If quote not closed and contains =, likely incomplete attr
    if (afterQuote.includes('=') && !afterQuote.includes('"') && !afterQuote.includes("'")) {
      html = html.substring(0, lastQuote)
    }
  }
  
  return html
}

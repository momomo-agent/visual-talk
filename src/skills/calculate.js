/**
 * Calculate Skill — safe math evaluation
 * 
 * Provides: calculate
 * No API needed — runs in browser
 */

function safeEval(expr) {
  // Only allow numbers, operators, parens, dots, spaces, and math functions
  const sanitized = expr.replace(/\s/g, '')
  if (!/^[0-9+\-*/().,%^e\s]+$/.test(sanitized) && 
      !/^(Math\.)?(sqrt|pow|abs|ceil|floor|round|log|log10|sin|cos|tan|PI|E|min|max)\b/.test(expr)) {
    // Allow basic math expressions and Math.* functions
    const safe = expr.replace(/[^0-9+\-*/().,%^e\s]|Math\.\w+/g, (match) => {
      if (/^Math\.\w+$/.test(match)) return match
      return ''
    })
    if (!safe.trim()) return { error: 'Invalid expression' }
  }

  try {
    // Replace common notations
    let evalExpr = expr
      .replace(/\^/g, '**')           // ^ → **
      .replace(/(\d)%/g, '($1/100)')  // 50% → (50/100)
    
    const result = new Function(`"use strict"; return (${evalExpr})`)()
    
    if (typeof result !== 'number' || !isFinite(result)) {
      return { error: 'Result is not a finite number', result: String(result) }
    }
    
    return { expression: expr, result: Number(result.toPrecision(12)) }
  } catch (e) {
    return { error: `Calculation error: ${e.message}` }
  }
}

export const tools = [
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression. Supports +, -, *, /, ^, %, parentheses, and Math functions (sqrt, pow, abs, etc). Use this instead of mental math for accuracy.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression (e.g. "125 * 0.85", "Math.sqrt(144)", "2^10")' },
      },
      required: ['expression'],
    },
    execute: async (input) => safeEval(input.expression),
  },
]

export default { name: 'calculate', tools }

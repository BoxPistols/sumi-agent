// Test that all parsers referenced in parseFile actually exist
const parserNames = [
  'parsePDF',
  'parseDOCX',
  'parseXLSX',
  'parseCSV',
  'parseTXT',
  'parseMD',
  'parseHTML',
  'parseRTF',
  'parseJSON',
  'parseODT',
]

// Read source and check function definitions
import { readFileSync } from 'fs'
const src = readFileSync('./src/app/RedactPro.tsx', 'utf8')

let pass = 0,
  fail = 0
for (const name of parserNames) {
  const defRe = new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`)
  const exists = defRe.test(src)
  const status = exists ? '✅' : '❌'
  console.log(`${status} ${name}: ${exists ? 'defined' : 'MISSING!'}`)
  if (exists) pass++
  else fail++
}

// Check parseFile references match definitions
const parseFileMatch = src.match(/const P=\{([^}]+)\}/)
if (parseFileMatch) {
  const mappings = parseFileMatch[1]
  const refs = [...mappings.matchAll(/(\w+):(\w+)/g)].map((m) => m[2])
  const unique = [...new Set(refs)]
  console.log(`\n=== parseFile references ${unique.length} parsers ===`)
  for (const fn of unique) {
    const defRe = new RegExp(`(async\\s+)?function\\s+${fn}\\s*\\(`)
    const exists = defRe.test(src)
    const status = exists ? '✅' : '❌'
    console.log(`${status} ${fn}`)
    if (exists) pass++
    else fail++
  }
}

// Check theme contrast
const darkMatch = src.match(/\[data-theme="dark"\]\{([^}]+)\}/)
const lightMatch = src.match(/\[data-theme="light"\]\{([^}]+)\}/)

function extractVar(css, name) {
  const m = css.match(new RegExp(`${name}:(#[0-9A-Fa-f]{6})`))
  return m ? m[1] : null
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const [R, G, B] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
function cr(h1, h2) {
  const l1 = luminance(h1),
    l2 = luminance(h2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

if (darkMatch) {
  const d = darkMatch[1]
  const bg = extractVar(d, '--rp-bg')
  const text = extractVar(d, '--rp-text')
  const text2 = extractVar(d, '--rp-text2')
  const text3 = extractVar(d, '--rp-text3')
  const border = extractVar(d, '--rp-border')

  if (!bg || !text || !text2 || !text3 || !border) {
    console.log('\n❌ Dark Mode: Missing CSS variables')
    fail++
  } else {
    console.log('\n=== Dark Mode WCAG ===')
    const checks = [
      ['text on bg', cr(text, bg), 7, 13],
      ['text2 on bg (AA)', cr(text2, bg), 4.5, 99],
      ['text3 on bg (AA-lg)', cr(text3, bg), 3, 99],
      ['border visibility', cr(border, bg), 1.5, 99],
    ]
    for (const [label, ratio, min, max] of checks) {
      const ok = ratio >= min && ratio <= max
      console.log(
        `${ok ? '✅' : '❌'} ${label}: ${ratio.toFixed(2)} (${min}-${max === 99 ? '∞' : max})`,
      )
      if (!ok) fail++
      else pass++
    }
  }
}

if (lightMatch) {
  const d = lightMatch[1]
  const bg = extractVar(d, '--rp-bg')
  const text = extractVar(d, '--rp-text')
  const text2 = extractVar(d, '--rp-text2')
  const text3 = extractVar(d, '--rp-text3')
  const border = extractVar(d, '--rp-border')

  if (!bg || !text || !text2 || !text3 || !border) {
    console.log('\n❌ Light Mode: Missing CSS variables')
    fail++
  } else {
    console.log('\n=== Light Mode WCAG ===')
    const checks = [
      ['text on bg', cr(text, bg), 7, 13],
      ['text2 on bg (AA)', cr(text2, bg), 4.5, 99],
      ['text3 on bg (AA-lg)', cr(text3, bg), 3, 99],
      ['border visibility', cr(border, bg), 1.5, 99],
    ]
    for (const [label, ratio, min, max] of checks) {
      const ok = ratio >= min && ratio <= max
      console.log(
        `${ok ? '✅' : '❌'} ${label}: ${ratio.toFixed(2)} (${min}-${max === 99 ? '∞' : max})`,
      )
      if (!ok) fail++
      else pass++
    }
  }
}

console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)

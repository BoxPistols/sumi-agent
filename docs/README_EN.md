# RedactPro

A web application that automatically detects and masks personally identifiable information (PII) in Japanese resumes and career documents.

[Japanese version (README.md)](../README.md)

---

## Concept

In recruitment and staffing, personal information must be removed from candidate resumes before sharing externally. Manual masking is error-prone, and Japanese documents present unique challenges: names appear in kanji, katakana, and hiragana; addresses follow a prefecture-city-block structure; dates use both Western and Japanese era formats; and full-width/half-width variants are common.

RedactPro addresses these challenges with three core design principles.

### Japanese-first detection

Most PII detection tools are designed for English text. They lack support for Japanese-specific patterns such as full-width/half-width normalization, Japanese era dates (Showa/Heisei/Reiwa), furigana, and the prefecture-based address system. RedactPro implements detection logic specifically for Japanese document conventions.

### 4-layer hybrid detection

No single technique achieves sufficient accuracy alone. RedactPro combines regex, dictionary lookup, heuristics, and AI into a four-layer pipeline where each layer compensates for the weaknesses of the others.

### Browser-first privacy

Since the tool handles sensitive personal information, minimizing data transmission is critical. Regex, dictionary, and heuristic detection all run entirely in the browser. AI-assisted detection is optional -- the core detection works without it.

---

## Features

### Input

- **File upload** -- PDF, Word (.docx), Excel (.xlsx/.ods), CSV, Markdown, HTML, RTF, JSON, ODT, plain text
- **URL scraping** -- Fetches HTML from public profile pages (Wantedly, LinkedIn, LAPRAS, etc.) via server-side proxy to bypass CORS
- **Text/HTML paste** -- Fallback for SPA sites that cannot be scraped

### Detection

- **Regex** -- Email, phone numbers, postal codes, addresses, dates of birth, URLs, My Number (national ID), etc.
- **Japanese name dictionary** -- Surname + given name dictionary matching (with/without whitespace)
- **Label proximity** -- Detects names after labels like "Name:", "Contact:", etc.
- **AI augmentation** -- Additional detection via Claude / OpenAI / Gemini, merged with local results

### Masking

- Per-category ON/OFF (name, contact, address, personal info, URL, organization)
- 3 presets (Basic / Standard / Strict)
- Prefecture retention (partially mask addresses: "Tokyo [address redacted]")
- Name-to-initial conversion (generates Roman initials from furigana)

### Output

- Export as Text / Markdown / CSV / Excel / PDF / Word
- Diff view (before/after comparison)
- Dark/light theme toggle

---

## Architecture

### Overview

```
                        +-------------------+
  File / Text / URL --> | Client (React)    | --> Masked output
                        +--------+----------+
                                 |
           +---------------------+---------------------+
           |                     |                     |
    Regex detection      Dict + Heuristics       (Optional)
    detectRegex()       detectJapaneseNames()   AI detection
           |                     |                     |
           +---------------------+---------------------+
                                 |
                          detectAll()
                          Deduplicate & merge
                                 |
                          mergeDetections()
                          Merge AI results
                                 |
                          applyRedaction()
                          Placeholder replacement
```

### Detection pipeline

Input text is processed in the following order:

1. **Normalization** (`normalizeText`) -- Converts full-width alphanumeric and symbols to half-width, absorbing character variation
2. **Regex detection** (`detectRegex`) -- Detects email, phone, postal code, address, date of birth, URL, My Number, furigana. Includes false-positive filters (year-range context exclusion, document date vs. birth date differentiation)
3. **Japanese name detection** (`detectJapaneseNames`) -- Three-stage approach:
   - **Dictionary match**: Combines surname + given name dictionaries to identify full names
   - **Label proximity**: Detects surname dictionary hits after labels like "Name:"
   - **Heuristics**: Extracts kanji sequences near labels as name candidates (presented with lower confidence)
4. **Merge** (`detectAll`) -- Combines regex and name detection results, deduplicating by category + value
5. **AI augmentation** (`mergeDetections`) -- Merges AI-provided detections into existing results (duplicates excluded)
6. **Masking** (`applyRedaction`) -- Replaces enabled detections with placeholders, processing longer strings first to prevent partial-match errors

### Detection type

All detection results conform to a unified `Detection` type:

```typescript
interface Detection {
  id: string // Unique identifier
  type: string // Pattern ID (email, phone, name_dict, etc.)
  label: string // Display label
  category: string // Category (name, contact, address, personal, web, organization)
  value: string // Detected string
  source: 'regex' | 'dict' | 'ai' | 'heuristic' // Detection method
  confidence: number // Confidence score (0-1)
  enabled: boolean // User toggle
}
```

### False positive mitigation

Japanese documents often contain numeric strings that match phone numbers, postal codes, and dates simultaneously. RedactPro implements:

- **Year-range context exclusion** -- Numeric strings within patterns like "2020/4 - 2023/3" are not misdetected as phone numbers or My Number
- **Document date differentiation** -- When labels like "Created:", "Submitted:" precede a date, it is not classified as a date of birth
- **Organization name exclusion** -- Terms like company suffixes and job titles are excluded from name detection

### Security

#### API key protection

AI provider requests are routed through server-side API Routes (`/api/ai`). API keys exist only in server environment variables and are never exposed to the client.

#### SSRF prevention on scraping proxy

The `/api/scrape` endpoint implements multi-layer defense:

- Blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Blocks cloud metadata endpoints (metadata.google.internal, etc.)
- Re-validates redirect target URLs
- Rejects URLs containing credentials
- Response size limit: 5MB / Content-Type restriction: text/html only
- Per-IP rate limiting (configurable via environment variable)

---

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
git clone https://github.com/BoxPistols/redact-pro.git
cd redact-pro
pnpm install
```

### Environment variables

Create `.env.local`:

```bash
cp .env.example .env.local
```

```env
# AI API keys (server-side only)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_AI_API_KEY=AIza...

# Scraping settings
SCRAPE_ENABLED=true
SCRAPE_RATE_LIMIT=30
```

> API keys are used via server-side API Routes (`/api/ai`) and are never exposed to the client.

### Dev server

```bash
pnpm dev
```

Opens at http://localhost:3000.

---

## Project structure

```
redact-pro/
  src/
    app/
      page.tsx              -- Entry point
      layout.tsx            -- Root Layout (metadata, fonts)
      RedactPro.tsx         -- Main application
      api/
        ai/route.ts         -- AI proxy (OpenAI / Claude / Gemini)
        scrape/route.ts     -- URL scraping proxy
    lib/
      constants.ts          -- AI provider config, categories, presets
      detection.ts          -- PII detection engine (regex, dictionary, heuristics)
      redaction.ts          -- Masking engine (placeholder replacement)
      __tests__/
        detection.test.ts   -- Detection engine tests
        redaction.test.ts   -- Masking engine tests
  docs/
    README_EN.md            -- This file
    REFACTOR_PLAN.md        -- Module decomposition roadmap
  vitest.config.ts
  next.config.ts
  tsconfig.json
  package.json
```

---

## API Routes

### `POST /api/ai`

Server-side proxy for AI provider requests.

- Rate limit: 60 requests/min per IP
- Supported providers: OpenAI, Anthropic (Claude), Google (Gemini)
- Request format: `{ provider, model, messages, maxTokens?, system? }`

### `GET /api/scrape?url=...`

Server-side HTML fetch proxy.

- SSRF prevention: blocks private IPs and cloud metadata endpoints
- Redirect URL re-validation
- Response size limit: 5MB
- Content-Type restriction: text/html only
- Rate limit: 30 requests/min per IP (configurable)

---

## Testing

Uses Vitest.

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

---

## Commands

| Command           | Description                  |
| ----------------- | ---------------------------- |
| `pnpm dev`        | Start dev server (Turbopack) |
| `pnpm build`      | Production build             |
| `pnpm start`      | Start production server      |
| `pnpm test`       | Run tests                    |
| `pnpm test:watch` | Tests (watch mode)           |
| `pnpm lint`       | Run ESLint                   |
| `pnpm type-check` | TypeScript type check        |

---

## Deploy

### Vercel

```bash
pnpm i -g vercel
vercel
```

Set environment variables (`OPENAI_API_KEY`, etc.) in the Vercel dashboard.

### Docker

```dockerfile
FROM node:20-slim AS base
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
```

---

## Tech stack

| Area            | Technology                                          |
| --------------- | --------------------------------------------------- |
| Framework       | Next.js 15 (App Router)                             |
| UI              | React 19                                            |
| Language        | TypeScript 5                                        |
| Testing         | Vitest                                              |
| Package manager | pnpm                                                |
| File parsing    | mammoth (docx), xlsx, papaparse (csv)               |
| AI              | OpenAI API, Anthropic API, Google Generative AI API |

---

## License

MIT

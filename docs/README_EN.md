# Sumi

A web application that automatically detects and masks personally identifiable information (PII) in Japanese resumes and career documents.

**Demo: https://sumi-agent.vercel.app/**

[Japanese version (README.md)](../README.md)

---

## Concept

In recruitment and staffing, personal information must be removed from candidate resumes before sharing externally. Manual masking is error-prone, and Japanese documents present unique challenges: names appear in kanji, katakana, and hiragana; addresses follow a prefecture-city-block structure; dates use both Western and Japanese era formats; and full-width/half-width variants are common.

Sumi addresses these challenges with three core design principles.

### Japanese-first detection

Most PII detection tools are designed for English text. They lack support for Japanese-specific patterns such as full-width/half-width normalization, Japanese era dates (Showa/Heisei/Reiwa), furigana, and the prefecture-based address system. Sumi implements detection logic specifically for Japanese document conventions.

### 4-layer hybrid detection

No single technique achieves sufficient accuracy alone. Sumi combines regex, dictionary lookup, heuristics, and AI into a four-layer pipeline where each layer compensates for the weaknesses of the others.

### Browser-first privacy

Since the tool handles sensitive personal information, minimizing data transmission is critical. Lite (the default) does everything from reading the file to detection and masking inside the browser and sends nothing to a server. Pro sends data to the server only for AI features (detection, OCR, cleanup, advisor) and for re-extracting text from PDFs that pdf.js cannot read (`/api/pdf/extract`); the UI states this. AI-assisted detection is optional -- the core detection works without it.

---

## Features

### Input

- **File upload** -- PDF, Word (.docx), Excel (.xlsx/.ods), CSV, Markdown, HTML, RTF, JSON, ODT, plain text
- **URL scraping** -- Fetches HTML from public profile pages (Wantedly, LinkedIn, LAPRAS, etc.) (Pro). Tries the app's own server-side proxy (`/api/scrape`) first, then falls back to public third-party CORS proxies (allorigins etc.), so the URL and page content may pass through those services
- **Text/HTML paste** -- Fallback for SPA sites that cannot be scraped

### Detection

- **Regex** -- Email, phone numbers, postal codes, addresses, dates of birth, URLs, My Number (national ID), etc.
- **Japanese name dictionary** -- Surname + given name dictionary matching (with/without whitespace)
- **Label proximity** -- Detects names after labels like "Name:", "Contact:", etc.
- **AI augmentation** -- (Pro) Additional detection via OpenAI or a local LLM (Ollama / LM Studio, OpenAI-compatible API), merged with local results

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

Japanese documents often contain numeric strings that match phone numbers, postal codes, and dates simultaneously. Sumi implements:

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
git clone https://github.com/BoxPistols/sumi-agent.git
cd sumi-agent
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

Runs via [portless](https://github.com/BoxPistols/portless) at [http://sumi.localhost:1355](http://sumi.localhost:1355).
This provides a stable URL and avoids port conflicts when developing multiple projects.

> [!NOTE]
> On the first run, you may be asked for `sudo` password to add a certificate to your system trust store.

---

## Project structure

```
sumi-agent/
  src/
    app/
      page.tsx / layout.tsx -- Entry point, metadata
      RedactPro.tsx         -- App shell (screen switching, header, modals)
      api/
        ai/route.ts         -- AI proxy (OpenAI / local LLM, rate limited)
        scrape/route.ts     -- URL fetch proxy (SSRF-protected)
        pdf/extract/        -- Server-side PDF text extraction (Pro only)
    components/redact/      -- Screens and modals (UploadScreen, EditorScreen, PreviewModal, SettingsModal, ...)
    hooks/                  -- usePersistedPreferences / useBatchFiles / useFocusTrap
    lib/
      redact-engine.ts      -- Detection and masking engine used by the UI
      process-file-entry.ts -- Per-file analysis pipeline
      parsers/              -- PDF / Word / Excel / CSV / text extraction
      ai/                   -- /api/ai client, model selection, AI detection / OCR / cleanup
      url-import.ts         -- URL import
      export.ts / resume-html.ts -- Export formats and A4 HTML
      __tests__/            -- Vitest
  e2e/                      -- Playwright
  docs/
    README_EN.md            -- This file
    REFACTOR_PLAN.md        -- Module layout and remaining work
```

---

## API Routes

### `POST /api/ai`

Server-side proxy for AI provider requests.

- Rate limit: 50 requests per IP per 24h for requests without the user's own API key (including local LLM requests)
- Supported providers in the UI: OpenAI and local LLM (OpenAI-compatible API)
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

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `pnpm dev`        | Start dev server (via portless) |
| `pnpm build`      | Production build                |
| `pnpm start`      | Start production server         |
| `pnpm test`       | Run tests                       |
| `pnpm test:watch` | Tests (watch mode)              |
| `pnpm lint`       | Run ESLint                      |
| `pnpm type-check` | TypeScript type check           |

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

| Area            | Technology                                    |
| --------------- | --------------------------------------------- |
| Framework       | Next.js 15 (App Router)                       |
| UI              | React 19                                      |
| Language        | TypeScript 5                                  |
| Testing         | Vitest                                        |
| Package manager | pnpm                                          |
| File parsing    | mammoth (docx), xlsx, papaparse (csv)         |
| AI              | OpenAI API, local LLM (OpenAI-compatible API) |

---

## License

MIT

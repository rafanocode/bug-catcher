# bug-catcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hostable, zero-SaaS bug-reporting widget: a React bubble component that captures a screenshot + console log + browser/OS info, and a Supabase Edge Function that durably persists the report and creates a Linear issue with the screenshot embedded via a signed Supabase Storage URL.

**Architecture:** pnpm workspace monorepo with two published packages (`@bug-catcher/core` — framework-agnostic capture/submit logic, `@bug-catcher/react` — the `<BugCatcherBubble />` component), a Supabase Edge Function template under `supabase/functions/bug-catcher-submit/`, SQL migrations under `supabase/migrations/`, and a Vite + React demo app under `examples/demo-app/`.

**Tech Stack:** TypeScript (strict), React 18, `modern-screenshot` for DOM screenshots, `@supabase/supabase-js` v2, Vitest + Testing Library for package tests, Deno's built-in test runner for the Edge Function, tsup for package builds, Vite for the demo app, pnpm workspaces.

## Global Constraints

- Package manager: pnpm (`packageManager: pnpm@9.12.0` pinned in root `package.json`).
- npm scope: `@bug-catcher/*` (per approved spec).
- TypeScript strict mode everywhere; Node >= 20.
- License: MIT.
- **Durable-first invariant:** the Edge Function must INSERT the submission row before attempting the Linear API call, and a Linear failure must never be surfaced to the end user as a failed submission (`linear_status` is a maintainer-facing field only).
- `authorize(user, req)` is a **required** config field on the Edge Function with no default (must fail to start if omitted) — no client-side `authorize` prop exists on `<BugCatcherBubble />`.
- Signed screenshot URLs use a 1-year expiry.
- Default rate limit: 5 requests / 10 minutes per user, implemented as a Postgres-backed sliding window (no external services).
- Console ring buffer default size: 50 entries; captures `log`/`warn`/`error`/`info`/`debug`.
- **Path refinement from spec:** the Edge Function source lives at `supabase/functions/bug-catcher-submit/` (the Supabase CLI's required convention for `supabase functions serve`/`deploy`), not `packages/supabase-function/`, since Edge Functions are deployed source, not an installable npm package. This does not change the function's contract, only its on-disk location.
- Zero third-party SaaS dependencies beyond the integrator's own Supabase project and Linear workspace.

---

## File Structure

```
bug-catcher/
├── package.json                     root workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── LICENSE
├── README.md
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── console-buffer.ts
│   │   │   ├── capture.ts
│   │   │   ├── submit.ts
│   │   │   └── index.ts
│   │   └── test/
│   │       ├── console-buffer.test.ts
│   │       ├── capture.test.ts
│   │       └── submit.test.ts
│   └── react/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── BubbleButton.tsx
│       │   ├── ReportForm.tsx
│       │   ├── BugCatcherBubble.tsx
│       │   └── index.ts
│       └── test/
│           ├── BubbleButton.test.tsx
│           ├── ReportForm.test.tsx
│           └── BugCatcherBubble.test.tsx
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_bug_catcher_schema.sql
│   └── functions/
│       └── bug-catcher-submit/
│           ├── config.example.ts
│           ├── cors.ts
│           ├── auth.ts
│           ├── rate-limit.ts
│           ├── linear.ts
│           ├── handler.ts
│           ├── index.ts
│           └── test/
│               ├── cors.test.ts
│               ├── auth.test.ts
│               ├── rate-limit.test.ts
│               ├── linear.test.ts
│               └── handler.test.ts
└── examples/
    └── demo-app/
        ├── package.json
        ├── index.html
        ├── vite.config.ts
        ├── .env.example
        └── src/
            ├── main.tsx
            └── App.tsx
```

---

### Task 1: Monorepo scaffolding

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Produces: the workspace root that every later package/task installs into. `tsconfig.base.json` is `extend`-ed by every package's own `tsconfig.json`.

- [ ] **Step 1: Create the workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

`package.json`:
```json
{
  "name": "bug-catcher",
  "private": true,
  "license": "MIT",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "pnpm --filter=\"./packages/**\" run build",
    "test": "pnpm --filter=\"./packages/**\" run test"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`.gitignore`:
```
node_modules
dist
.env
.env.local
*.log
.DS_Store
supabase/.temp
```

`LICENSE` (MIT):
```
MIT License

Copyright (c) 2026 Rafa Romero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify the workspace installs cleanly**

Run: `pnpm install`
Expected: Exits 0. Since no packages exist under `packages/*` yet, pnpm reports an empty workspace with no errors (not a failure condition at this stage).

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore LICENSE
git commit -m "chore: scaffold pnpm workspace root"
```

---

### Task 2: `@bug-catcher/core` — types and console ring buffer

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/console-buffer.ts`
- Test: `packages/core/test/console-buffer.test.ts`

**Interfaces:**
- Consumes: nothing (first core module).
- Produces:
  - `ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug'`
  - `ConsoleEntry { level: ConsoleLevel; args: unknown[]; timestamp: number }`
  - `CaptureContext { screenshot: string; url: string; userAgent: string; consoleEntries: ConsoleEntry[] }`
  - `SubmitConfig { functionUrl: string; supabaseAnonKey: string; accessToken: string }`
  - `LinearStatus = 'created' | 'failed'`
  - `SubmitResult { submissionId: string; linearStatus: LinearStatus; linearIssueUrl: string | null }`
  - `SubmitReport extends CaptureContext { description: string }`
  - `ConsoleBuffer { entries: ConsoleEntry[]; start(): void; stop(): void }`
  - `createConsoleBuffer(size?: number): ConsoleBuffer` — later tasks (capture, react) import this.

- [ ] **Step 1: Scaffold the package**

`packages/core/package.json`:
```json
{
  "name": "@bug-catcher/core",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "dependencies": {
    "modern-screenshot": "^4.5.0"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/core/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

`packages/core/src/types.ts`:
```ts
export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug'

export interface ConsoleEntry {
  level: ConsoleLevel
  args: unknown[]
  timestamp: number
}

export interface CaptureContext {
  screenshot: string
  url: string
  userAgent: string
  consoleEntries: ConsoleEntry[]
}

export interface SubmitConfig {
  functionUrl: string
  supabaseAnonKey: string
  accessToken: string
}

export type LinearStatus = 'created' | 'failed'

export interface SubmitResult {
  submissionId: string
  linearStatus: LinearStatus
  linearIssueUrl: string | null
}

export interface SubmitReport extends CaptureContext {
  description: string
}
```

- [ ] **Step 2: Write the failing test for the console ring buffer**

`packages/core/test/console-buffer.test.ts`:
```ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createConsoleBuffer } from '../src/console-buffer'

describe('createConsoleBuffer', () => {
  const originalLog = console.log
  const originalWarn = console.warn

  afterEach(() => {
    console.log = originalLog
    console.warn = originalWarn
  })

  it('captures entries after start() is called', () => {
    const buffer = createConsoleBuffer(50)
    buffer.start()

    console.log('hello', 42)
    console.warn('careful')

    expect(buffer.entries).toHaveLength(2)
    expect(buffer.entries[0]).toMatchObject({ level: 'log', args: ['hello', 42] })
    expect(buffer.entries[1]).toMatchObject({ level: 'warn', args: ['careful'] })
    expect(typeof buffer.entries[0].timestamp).toBe('number')

    buffer.stop()
  })

  it('trims to the configured ring size', () => {
    const buffer = createConsoleBuffer(3)
    buffer.start()

    for (let i = 0; i < 5; i++) console.log(`entry-${i}`)

    expect(buffer.entries).toHaveLength(3)
    expect(buffer.entries.map((e) => e.args[0])).toEqual(['entry-2', 'entry-3', 'entry-4'])

    buffer.stop()
  })

  it('stop() restores the original console methods', () => {
    const buffer = createConsoleBuffer(50)
    const spy = vi.fn()
    console.log = spy

    buffer.start()
    buffer.stop()

    console.log('after stop')
    expect(spy).toHaveBeenCalledWith('after stop')
    expect(buffer.entries).toHaveLength(0)
  })

  it('still forwards to the original console method while capturing', () => {
    const spy = vi.fn()
    console.log = spy
    const buffer = createConsoleBuffer(50)

    buffer.start()
    console.log('forwarded')

    expect(spy).toHaveBeenCalledWith('forwarded')
    buffer.stop()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm install && pnpm exec vitest run test/console-buffer.test.ts`
Expected: FAIL with a module-not-found error for `../src/console-buffer` (file doesn't exist yet).

- [ ] **Step 4: Implement the console ring buffer**

`packages/core/src/console-buffer.ts`:
```ts
import type { ConsoleEntry, ConsoleLevel } from './types'

const LEVELS: ConsoleLevel[] = ['log', 'warn', 'error', 'info', 'debug']

export interface ConsoleBuffer {
  entries: ConsoleEntry[]
  start(): void
  stop(): void
}

export function createConsoleBuffer(size = 50): ConsoleBuffer {
  const entries: ConsoleEntry[] = []
  const originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {}
  let started = false

  function push(level: ConsoleLevel, args: unknown[]) {
    entries.push({ level, args, timestamp: Date.now() })
    if (entries.length > size) entries.shift()
  }

  return {
    entries,
    start() {
      if (started) return
      started = true
      for (const level of LEVELS) {
        originals[level] = console[level].bind(console)
        console[level] = (...args: unknown[]) => {
          push(level, args)
          originals[level]!(...args)
        }
      }
    },
    stop() {
      if (!started) return
      started = false
      for (const level of LEVELS) {
        if (originals[level]) console[level] = originals[level]!
      }
      entries.length = 0
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/console-buffer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add types and console ring buffer"
```

---

### Task 3: `@bug-catcher/core` — `captureContext`

**Files:**
- Create: `packages/core/src/capture.ts`
- Test: `packages/core/test/capture.test.ts`
- Modify: `packages/core/package.json` (add `jsdom` devDependency for the DOM test environment)

**Interfaces:**
- Consumes: `CaptureContext` (types.ts), `modern-screenshot`'s `domToPng`.
- Produces: `captureContext(consoleEntries: ConsoleEntry[]): Promise<CaptureContext>` — the react package's `BugCatcherBubble` calls this with the live `ConsoleBuffer.entries` array.

- [ ] **Step 1: Confirm the `modern-screenshot` export used below**

This plan uses `domToPng` (matching the `html-to-image`-style naming this
package is a successor to). Before implementing Step 4, confirm the exact
export name and signature against the installed package's own type
definitions or current README (`node_modules/modern-screenshot/dist/*.d.ts`
after installing it, or its npm page) — package APIs shift between majors
and this plan's code should not be trusted blindly over the real package.
If the export differs, use the real one and adjust the mock in Step 3's
test accordingly.

- [ ] **Step 2: Add jsdom and configure the test environment**

Modify `packages/core/package.json` devDependencies to add:
```json
"jsdom": "^25.0.0"
```

`packages/core/vitest.config.ts` (replace contents — capture.ts needs `window`/`document`/`navigator`):
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
})
```

Run: `pnpm install` (from `packages/core`)

- [ ] **Step 3: Write the failing test**

`packages/core/test/capture.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { captureContext } from '../src/capture'
import type { ConsoleEntry } from '../src/types'

vi.mock('modern-screenshot', () => ({
  domToPng: vi.fn().mockResolvedValue('data:image/png;base64,fake-screenshot-data'),
}))

describe('captureContext', () => {
  it('returns screenshot, url, userAgent, and the given console entries', async () => {
    const consoleEntries: ConsoleEntry[] = [{ level: 'log', args: ['hi'], timestamp: 123 }]

    const result = await captureContext(consoleEntries)

    expect(result.screenshot).toBe('data:image/png;base64,fake-screenshot-data')
    expect(result.url).toBe(window.location.href)
    expect(result.userAgent).toBe(navigator.userAgent)
    expect(result.consoleEntries).toEqual(consoleEntries)
  })

  it('copies the console entries array rather than holding a live reference', async () => {
    const consoleEntries: ConsoleEntry[] = [{ level: 'log', args: ['hi'], timestamp: 123 }]

    const result = await captureContext(consoleEntries)
    consoleEntries.push({ level: 'error', args: ['later'], timestamp: 456 })

    expect(result.consoleEntries).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run test/capture.test.ts`
Expected: FAIL — `../src/capture` does not exist.

- [ ] **Step 5: Implement `captureContext`**

`packages/core/src/capture.ts`:
```ts
import { domToPng } from 'modern-screenshot'
import type { CaptureContext, ConsoleEntry } from './types'

export async function captureContext(consoleEntries: ConsoleEntry[]): Promise<CaptureContext> {
  const screenshot = await domToPng(document.documentElement)
  return {
    screenshot,
    url: window.location.href,
    userAgent: navigator.userAgent,
    consoleEntries: [...consoleEntries],
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run test/capture.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add captureContext for screenshot + browser info capture"
```

---

### Task 4: `@bug-catcher/core` — `submitReport`

**Files:**
- Create: `packages/core/src/submit.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/submit.test.ts`

**Interfaces:**
- Consumes: `SubmitConfig`, `SubmitReport`, `SubmitResult` (types.ts).
- Produces: `submitReport(config: SubmitConfig, report: SubmitReport): Promise<SubmitResult>`, `SubmitError` (thrown on non-2xx), and the package's public entry point `index.ts` re-exporting everything — later tasks (react package, edge function tests) import from `@bug-catcher/core`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/submit.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { submitReport, SubmitError } from '../src/submit'
import type { SubmitConfig, SubmitReport } from '../src/types'

const config: SubmitConfig = {
  functionUrl: 'https://xyz.supabase.co/functions/v1/bug-catcher-submit',
  supabaseAnonKey: 'anon-key',
  accessToken: 'jwt-token',
}

const report: SubmitReport = {
  screenshot: 'data:image/png;base64,abc',
  url: 'https://app.example.com/page',
  userAgent: 'test-agent',
  consoleEntries: [],
  description: 'it broke',
}

describe('submitReport', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('POSTs to functionUrl with the JWT and apikey headers and returns the parsed result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await submitReport(config, report)

    expect(mockFetch).toHaveBeenCalledWith(
      config.functionUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
          apikey: 'anon-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(report),
      }),
    )
    expect(result).toEqual({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })
  })

  it('throws SubmitError with status and message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    }) as unknown as typeof fetch

    await expect(submitReport(config, report)).rejects.toThrow(SubmitError)
    await expect(submitReport(config, report)).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/submit.test.ts`
Expected: FAIL — `../src/submit` does not exist.

- [ ] **Step 3: Implement `submitReport` and the package entry point**

`packages/core/src/submit.ts`:
```ts
import type { SubmitConfig, SubmitReport, SubmitResult } from './types'

export class SubmitError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SubmitError'
    this.status = status
  }
}

export async function submitReport(config: SubmitConfig, report: SubmitReport): Promise<SubmitResult> {
  const response = await fetch(config.functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify(report),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string })
    throw new SubmitError(response.status, body.error ?? `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<SubmitResult>
}
```

`packages/core/src/index.ts`:
```ts
export * from './types'
export { createConsoleBuffer, type ConsoleBuffer } from './console-buffer'
export { captureContext } from './capture'
export { submitReport, SubmitError } from './submit'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run`
Expected: PASS (all core tests: console-buffer, capture, submit — 8 tests total).

- [ ] **Step 5: Build the package to confirm the public API compiles**

Run: `pnpm run build`
Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` produced with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add submitReport client and public package entry point"
```

---

### Task 5: `@bug-catcher/react` — package scaffold + `BubbleButton`

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsup.config.ts`
- Create: `packages/react/vitest.config.ts`
- Create: `packages/react/src/BubbleButton.tsx`
- Test: `packages/react/test/BubbleButton.test.tsx`

**Interfaces:**
- Consumes: nothing yet from core (this task is UI-only).
- Produces: `BubbleButton({ primaryColor, onClick }): JSX.Element` — consumed by `BugCatcherBubble` in Task 7.

- [ ] **Step 1: Scaffold the package**

`packages/react/package.json`:
```json
{
  "name": "@bug-catcher/react",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "dependencies": {
    "@bug-catcher/core": "workspace:*"
  },
  "peerDependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.0"
  },
  "devDependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/react/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

`packages/react/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', '@supabase/supabase-js'],
})
```

`packages/react/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
```

`packages/react/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

Run: `cd packages/react && pnpm install`

- [ ] **Step 2: Write the failing test**

`packages/react/test/BubbleButton.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BubbleButton } from '../src/BubbleButton'

describe('BubbleButton', () => {
  it('renders an accessible button and calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BubbleButton primaryColor="#6366f1" onClick={onClick} />)

    const button = screen.getByRole('button', { name: 'Report a bug' })
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the given primaryColor as the background color', () => {
    render(<BubbleButton primaryColor="#ff0000" onClick={() => {}} />)

    const button = screen.getByRole('button', { name: 'Report a bug' })
    expect(button).toHaveStyle({ backgroundColor: '#ff0000' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/BubbleButton.test.tsx`
Expected: FAIL — `../src/BubbleButton` does not exist.

- [ ] **Step 4: Implement `BubbleButton`**

`packages/react/src/BubbleButton.tsx`:
```tsx
export interface BubbleButtonProps {
  primaryColor: string
  onClick: () => void
}

export function BubbleButton({ primaryColor, onClick }: BubbleButtonProps) {
  return (
    <button
      type="button"
      aria-label="Report a bug"
      onClick={onClick}
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: 'none',
        backgroundColor: primaryColor,
        color: '#fff',
        fontSize: 24,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      🐞
    </button>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/BubbleButton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/react
git commit -m "feat(react): scaffold package and add BubbleButton"
```

---

### Task 6: `@bug-catcher/react` — `ReportForm`

**Files:**
- Create: `packages/react/src/ReportForm.tsx`
- Test: `packages/react/test/ReportForm.test.tsx`

**Interfaces:**
- Consumes: nothing external.
- Produces: `ReportForm({ status, error, primaryColor, onSubmit, onClose }): JSX.Element` with `status: 'open' | 'submitting' | 'success' | 'error'` — consumed by `BugCatcherBubble` in Task 7.

- [ ] **Step 1: Write the failing test**

`packages/react/test/ReportForm.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReportForm } from '../src/ReportForm'

describe('ReportForm', () => {
  it('disables Submit until a description is entered, then calls onSubmit with it', () => {
    const onSubmit = vi.fn()
    render(<ReportForm status="open" error={null} primaryColor="#6366f1" onSubmit={onSubmit} onClose={() => {}} />)

    const submitButton = screen.getByRole('button', { name: 'Submit' })
    expect(submitButton).toBeDisabled()

    const textarea = screen.getByLabelText('What were you doing? What went wrong?')
    fireEvent.change(textarea, { target: { value: 'the button does nothing' } })

    expect(submitButton).toBeEnabled()
    fireEvent.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith('the button does nothing')
  })

  it('shows the error message and re-enables the form when status is error', () => {
    render(
      <ReportForm status="error" error="Rate limit exceeded" primaryColor="#6366f1" onSubmit={() => {}} onClose={() => {}} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
  })

  it('disables the form while submitting', () => {
    render(<ReportForm status="submitting" error={null} primaryColor="#6366f1" onSubmit={() => {}} onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(screen.getByLabelText('What were you doing? What went wrong?')).toBeDisabled()
  })

  it('shows a success message and a Close button when status is success', () => {
    const onClose = vi.fn()
    render(<ReportForm status="success" error={null} primaryColor="#6366f1" onSubmit={() => {}} onClose={onClose} />)

    expect(screen.getByText('Report saved. Thank you!')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/ReportForm.test.tsx`
Expected: FAIL — `../src/ReportForm` does not exist.

- [ ] **Step 3: Implement `ReportForm`**

`packages/react/src/ReportForm.tsx`:
```tsx
import { useState, type CSSProperties } from 'react'

export interface ReportFormProps {
  status: 'open' | 'submitting' | 'success' | 'error'
  error: string | null
  primaryColor: string
  onSubmit: (description: string) => void
  onClose: () => void
}

const panelStyle: CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  width: 280,
}

export function ReportForm({ status, error, primaryColor, onSubmit, onClose }: ReportFormProps) {
  const [description, setDescription] = useState('')

  if (status === 'success') {
    return (
      <div role="dialog" aria-label="Bug report submitted" style={panelStyle}>
        <p>Report saved. Thank you!</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div role="dialog" aria-label="Report a bug" style={panelStyle}>
      <textarea
        aria-label="What were you doing? What went wrong?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={status === 'submitting'}
        rows={4}
        style={{ width: '100%' }}
      />
      {status === 'error' && (
        <p role="alert" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => onSubmit(description)}
          disabled={status === 'submitting' || description.trim().length === 0}
          style={{ backgroundColor: primaryColor, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" onClick={onClose} disabled={status === 'submitting'}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/ReportForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): add ReportForm"
```

---

### Task 7: `@bug-catcher/react` — `BugCatcherBubble`

**Files:**
- Create: `packages/react/src/BugCatcherBubble.tsx`
- Create: `packages/react/src/index.ts`
- Test: `packages/react/test/BugCatcherBubble.test.tsx`

**Interfaces:**
- Consumes: `BubbleButton` (Task 5), `ReportForm` (Task 6), `createConsoleBuffer`/`captureContext`/`submitReport`/`SubmitResult` from `@bug-catcher/core` (Tasks 2–4), `createClient` from `@supabase/supabase-js`.
- Produces: `<BugCatcherBubble supabaseUrl supabaseAnonKey functionName? position? primaryColor? consoleBufferSize? onSubmitted? />` and the package's public entry point — this is the top-level export integrators use.

- [ ] **Step 1: Write the failing test**

`packages/react/test/BugCatcherBubble.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugCatcherBubble } from '../src/BugCatcherBubble'

const getSession = vi.fn()
const createClientMock = vi.fn(() => ({ auth: { getSession } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

const captureContext = vi.fn()
const submitReport = vi.fn()

vi.mock('@bug-catcher/core', () => ({
  createConsoleBuffer: () => ({ entries: [], start: vi.fn(), stop: vi.fn() }),
  captureContext: (...args: unknown[]) => captureContext(...args),
  submitReport: (...args: unknown[]) => submitReport(...args),
}))

describe('BugCatcherBubble', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'jwt-token' } } })
    captureContext.mockReset().mockResolvedValue({
      screenshot: 'data:image/png;base64,abc',
      url: 'https://app.example.com',
      userAgent: 'test-agent',
      consoleEntries: [],
    })
    submitReport.mockReset()
  })

  it('opens the form on bubble click, submits, and shows success', async () => {
    submitReport.mockResolvedValue({ submissionId: 'sub_1', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })
    const onSubmitted = vi.fn()

    render(
      <BugCatcherBubble supabaseUrl="https://xyz.supabase.co" supabaseAnonKey="anon-key" onSubmitted={onSubmitted} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByText('Report saved. Thank you!')).toBeInTheDocument())

    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        functionUrl: 'https://xyz.supabase.co/functions/v1/bug-catcher-submit',
        supabaseAnonKey: 'anon-key',
        accessToken: 'jwt-token',
      }),
      expect.objectContaining({ description: 'it crashed' }),
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      submissionId: 'sub_1',
      linearStatus: 'created',
      linearIssueUrl: 'https://linear.app/issue/1',
    })
  })

  it('shows an error message when there is no active Supabase session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })

    render(<BugCatcherBubble supabaseUrl="https://xyz.supabase.co" supabaseAnonKey="anon-key" />)

    fireEvent.click(screen.getByRole('button', { name: 'Report a bug' }))
    fireEvent.change(screen.getByLabelText('What were you doing? What went wrong?'), {
      target: { value: 'it crashed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No active Supabase session'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/BugCatcherBubble.test.tsx`
Expected: FAIL — `../src/BugCatcherBubble` does not exist.

- [ ] **Step 3: Implement `BugCatcherBubble` and the package entry point**

`packages/react/src/BugCatcherBubble.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { captureContext, createConsoleBuffer, submitReport, type SubmitResult } from '@bug-catcher/core'
import { BubbleButton } from './BubbleButton'
import { ReportForm } from './ReportForm'

export interface BugCatcherBubbleProps {
  supabaseUrl: string
  supabaseAnonKey: string
  functionName?: string
  position?: 'bottom-right' | 'bottom-left'
  primaryColor?: string
  consoleBufferSize?: number
  onSubmitted?: (result: SubmitResult) => void
}

type Status = 'idle' | 'open' | 'submitting' | 'success' | 'error'

export function BugCatcherBubble({
  supabaseUrl,
  supabaseAnonKey,
  functionName = 'bug-catcher-submit',
  position = 'bottom-right',
  primaryColor = '#6366f1',
  consoleBufferSize = 50,
  onSubmitted,
}: BugCatcherBubbleProps) {
  const supabase = useMemo(() => createClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey])
  const consoleBuffer = useMemo(() => createConsoleBuffer(consoleBufferSize), [consoleBufferSize])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    consoleBuffer.start()
    return () => consoleBuffer.stop()
  }, [consoleBuffer])

  async function handleSubmit(description: string) {
    setStatus('submitting')
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error('No active Supabase session')

      const context = await captureContext(consoleBuffer.entries)
      const result = await submitReport(
        {
          functionUrl: `${supabaseUrl}/functions/v1/${functionName}`,
          supabaseAnonKey,
          accessToken,
        },
        { ...context, description },
      )
      setStatus('success')
      onSubmitted?.(result)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 999999,
        ...(position === 'bottom-right' ? { bottom: 16, right: 16 } : { bottom: 16, left: 16 }),
      }}
    >
      {status === 'idle' ? (
        <BubbleButton primaryColor={primaryColor} onClick={() => setStatus('open')} />
      ) : (
        <ReportForm
          status={status === 'idle' ? 'open' : status}
          error={error}
          primaryColor={primaryColor}
          onSubmit={handleSubmit}
          onClose={() => setStatus('idle')}
        />
      )}
    </div>
  )
}
```

`packages/react/src/index.ts`:
```ts
export { BugCatcherBubble, type BugCatcherBubbleProps } from './BugCatcherBubble'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run`
Expected: PASS (all react tests: BubbleButton, ReportForm, BugCatcherBubble — 8 tests total).

- [ ] **Step 5: Build the package**

Run: `pnpm run build`
Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` produced with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/react
git commit -m "feat(react): add BugCatcherBubble and public package entry point"
```

---

### Task 8: Database migrations

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_bug_catcher_schema.sql`

**Interfaces:**
- Produces: `bug_catcher_submissions` table, `bug_catcher_rate_limits` table, `bug_catcher_check_rate_limit(p_user_id uuid, p_max_requests int, p_window_minutes int) returns boolean` Postgres function, and the `bug-catcher-screenshots` Storage bucket — consumed by the Edge Function's `rate-limit.ts` (Task 11) and `handler.ts` (Task 13).

- [ ] **Step 1: Initialize the local Supabase project**

Run: `npx supabase init --workdir /Users/rafa/Code/bug-catcher` (installs the CLI on demand via `npx`; accept defaults if prompted for IDE settings)
Expected: creates `supabase/config.toml` and `supabase/.gitignore`. If it also creates a placeholder `supabase/migrations/` directory, that's fine — the next step adds the real migration file into it.

- [ ] **Step 2: Write the migration**

`supabase/migrations/0001_bug_catcher_schema.sql`:
```sql
-- Durable submission storage: written before any Linear API call is attempted.
create table if not exists bug_catcher_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  url text not null,
  user_agent text not null,
  description text not null,
  console_entries jsonb not null,
  screenshot_path text not null,
  linear_status text not null default 'pending' check (linear_status in ('pending', 'created', 'failed')),
  linear_issue_url text,
  linear_error text,
  created_at timestamptz not null default now()
);

alter table bug_catcher_submissions enable row level security;

create policy "service role full access to submissions"
  on bug_catcher_submissions
  for all
  to service_role
  using (true)
  with check (true);

-- Postgres-backed sliding-window rate limit: one row per (user, window bucket).
create table if not exists bug_catcher_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count int not null default 1,
  primary key (user_id, window_start)
);

alter table bug_catcher_rate_limits enable row level security;

create policy "service role full access to rate limits"
  on bug_catcher_rate_limits
  for all
  to service_role
  using (true)
  with check (true);

create or replace function bug_catcher_check_rate_limit(
  p_user_id uuid,
  p_max_requests int,
  p_window_minutes int
) returns boolean
language plpgsql
security definer
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into bug_catcher_rate_limits (user_id, window_start, request_count)
  values (p_user_id, v_window_start, 1)
  on conflict (user_id, window_start)
  do update set request_count = bug_catcher_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

-- Private bucket: screenshots are never public; the Edge Function generates
-- 1-year signed URLs embedded directly in the Linear issue description.
insert into storage.buckets (id, name, public)
values ('bug-catcher-screenshots', 'bug-catcher-screenshots', false)
on conflict (id) do nothing;
```

- [ ] **Step 3: Apply the migration to a local Supabase instance and verify it**

Run: `npx supabase start` (requires Docker; this starts local Postgres, Auth, and Storage and auto-applies migrations from `supabase/migrations/`)
Expected: prints local API/DB/Studio URLs, no migration errors.

Run:
```bash
npx supabase db execute --local --sql "select bug_catcher_check_rate_limit(gen_random_uuid(), 5, 10);"
```
Expected: returns `t` (true) — the rate limit function runs without error for a fresh user.

Run:
```bash
npx supabase db execute --local --sql "
  select tablename from pg_tables where tablename in ('bug_catcher_submissions', 'bug_catcher_rate_limits');
"
```
Expected: both table names are listed.

Run: `npx supabase stop`
Expected: stops the local instance cleanly.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/.gitignore
git commit -m "feat(db): add submissions, rate-limit schema, and screenshots bucket"
```

---

### Task 9: Edge Function — CORS handling

**Files:**
- Create: `supabase/functions/bug-catcher-submit/cors.ts`
- Test: `supabase/functions/bug-catcher-submit/test/cors.test.ts`

**Interfaces:**
- Produces: `CorsConfig { allowedOrigins: string[] }`, `corsHeaders(origin: string | null, config: CorsConfig): Record<string, string>`, `handleOptions(req: Request, config: CorsConfig): Response | null` — consumed by `handler.ts` (Task 13).

- [ ] **Step 1: Write the failing test**

`supabase/functions/bug-catcher-submit/test/cors.test.ts`:
```ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { corsHeaders, handleOptions } from '../cors.ts'

const config = { allowedOrigins: ['https://app.example.com'] }

Deno.test('corsHeaders echoes the request origin when it is allowed', () => {
  const headers = corsHeaders('https://app.example.com', config)
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.example.com')
})

Deno.test('corsHeaders falls back to the first allowed origin when the request origin is not allowed', () => {
  const headers = corsHeaders('https://evil.example.com', config)
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.example.com')
})

Deno.test('handleOptions returns a 204 response for OPTIONS requests', () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'OPTIONS',
    headers: { origin: 'https://app.example.com' },
  })
  const response = handleOptions(req, config)
  assertExists(response)
  assertEquals(response!.status, 204)
  assertEquals(response!.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com')
})

Deno.test('handleOptions returns null for non-OPTIONS requests', () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', { method: 'POST' })
  const response = handleOptions(req, config)
  assertEquals(response, null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/cors.test.ts`
Expected: FAIL — `../cors.ts` does not exist.

- [ ] **Step 3: Implement CORS handling**

`supabase/functions/bug-catcher-submit/cors.ts`:
```ts
export interface CorsConfig {
  allowedOrigins: string[]
}

export function corsHeaders(origin: string | null, config: CorsConfig): Record<string, string> {
  const allowOrigin = origin && config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  }
}

export function handleOptions(req: Request, config: CorsConfig): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin'), config) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/cors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bug-catcher-submit/cors.ts supabase/functions/bug-catcher-submit/test/cors.test.ts
git commit -m "feat(function): add explicit CORS/OPTIONS handling"
```

---

### Task 10: Edge Function — JWT verification

**Files:**
- Create: `supabase/functions/bug-catcher-submit/auth.ts`
- Test: `supabase/functions/bug-catcher-submit/test/auth.test.ts`

**Interfaces:**
- Consumes: a `SupabaseClient` (its `.auth.getUser(token)` method only — injected, not constructed internally, so this is testable without a real Supabase project).
- Produces: `AuthResult { user: User | null; error: string | null }`, `verifyRequestUser(req: Request, supabase: SupabaseClient): Promise<AuthResult>` — consumed by `handler.ts` (Task 13).

- [ ] **Step 1: Write the failing test**

`supabase/functions/bug-catcher-submit/test/auth.test.ts`:
```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { verifyRequestUser } from '../auth.ts'

function fakeClient(getUserResult: { data: { user: unknown }; error: { message: string } | null }): SupabaseClient {
  return {
    auth: {
      getUser: async (_token: string) => getUserResult,
    },
  } as unknown as SupabaseClient
}

Deno.test('returns an error when the Authorization header is missing', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', { method: 'POST' })
  const result = await verifyRequestUser(req, fakeClient({ data: { user: null }, error: null }))
  assertEquals(result.user, null)
  assertEquals(result.error, 'Missing or malformed Authorization header')
})

Deno.test('returns the user when the token is valid', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
  })
  const fakeUser = { id: 'user_1', app_metadata: {} }
  const result = await verifyRequestUser(req, fakeClient({ data: { user: fakeUser }, error: null }))
  assertEquals(result.user, fakeUser)
  assertEquals(result.error, null)
})

Deno.test('returns an error when the token is invalid', async () => {
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer bad-jwt' },
  })
  const result = await verifyRequestUser(
    req,
    fakeClient({ data: { user: null }, error: { message: 'invalid JWT' } }),
  )
  assertEquals(result.user, null)
  assertEquals(result.error, 'invalid JWT')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/auth.test.ts`
Expected: FAIL — `../auth.ts` does not exist.

- [ ] **Step 3: Implement JWT verification**

`supabase/functions/bug-catcher-submit/auth.ts`:
```ts
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'

export interface AuthResult {
  user: User | null
  error: string | null
}

export async function verifyRequestUser(req: Request, supabase: SupabaseClient): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or malformed Authorization header' }
  }

  const token = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Invalid token' }
  }

  return { user: data.user as User, error: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bug-catcher-submit/auth.ts supabase/functions/bug-catcher-submit/test/auth.test.ts
git commit -m "feat(function): add JWT verification via injected Supabase client"
```

---

### Task 11: Edge Function — rate limiting

**Files:**
- Create: `supabase/functions/bug-catcher-submit/rate-limit.ts`
- Test: `supabase/functions/bug-catcher-submit/test/rate-limit.test.ts`

**Interfaces:**
- Consumes: a `SupabaseClient` (its `.rpc()` method — injected), calls the `bug_catcher_check_rate_limit` Postgres function from Task 8.
- Produces: `RateLimitConfig { maxRequests: number; windowMinutes: number }`, `checkRateLimit(supabase: SupabaseClient, userId: string, config: RateLimitConfig): Promise<boolean>` — consumed by `handler.ts` (Task 13).

- [ ] **Step 1: Write the failing test**

`supabase/functions/bug-catcher-submit/test/rate-limit.test.ts`:
```ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimit } from '../rate-limit.ts'

function fakeClient(rpcResult: { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    rpc: async (_fn: string, _args: Record<string, unknown>) => rpcResult,
  } as unknown as SupabaseClient
}

Deno.test('returns true when the RPC reports the request is within limits', async () => {
  const allowed = await checkRateLimit(fakeClient({ data: true, error: null }), 'user_1', {
    maxRequests: 5,
    windowMinutes: 10,
  })
  assertEquals(allowed, true)
})

Deno.test('returns false when the RPC reports the limit is exceeded', async () => {
  const allowed = await checkRateLimit(fakeClient({ data: false, error: null }), 'user_1', {
    maxRequests: 5,
    windowMinutes: 10,
  })
  assertEquals(allowed, false)
})

Deno.test('throws when the RPC call itself errors', async () => {
  await assertRejects(
    () => checkRateLimit(fakeClient({ data: null, error: { message: 'connection refused' } }), 'user_1', {
      maxRequests: 5,
      windowMinutes: 10,
    }),
    Error,
    'Rate limit check failed: connection refused',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/rate-limit.test.ts`
Expected: FAIL — `../rate-limit.ts` does not exist.

- [ ] **Step 3: Implement rate limiting**

`supabase/functions/bug-catcher-submit/rate-limit.ts`:
```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface RateLimitConfig {
  maxRequests: number
  windowMinutes: number
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  config: RateLimitConfig,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('bug_catcher_check_rate_limit', {
    p_user_id: userId,
    p_max_requests: config.maxRequests,
    p_window_minutes: config.windowMinutes,
  })

  if (error) throw new Error(`Rate limit check failed: ${error.message}`)
  return data as boolean
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/rate-limit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bug-catcher-submit/rate-limit.ts supabase/functions/bug-catcher-submit/test/rate-limit.test.ts
git commit -m "feat(function): add Postgres-backed rate limit check"
```

---

### Task 12: Edge Function — Linear issue creation

**Files:**
- Create: `supabase/functions/bug-catcher-submit/linear.ts`
- Test: `supabase/functions/bug-catcher-submit/test/linear.test.ts`

**Interfaces:**
- Consumes: global `fetch` (mocked in tests).
- Produces: `LinearConfig { apiKey: string; teamId: string; projectId?: string; labelIds?: string[] }`, `LinearIssueInput { title: string; description: string }`, `LinearResult { status: 'created' | 'failed'; issueUrl: string | null; error: string | null }`, `createLinearIssue(config: LinearConfig, input: LinearIssueInput): Promise<LinearResult>`, `buildIssueDescription(params): string` — consumed by `handler.ts` (Task 13).

- [ ] **Step 1: Write the failing test**

`supabase/functions/bug-catcher-submit/test/linear.test.ts`:
```ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createLinearIssue, buildIssueDescription } from '../linear.ts'

const config = { apiKey: 'lin_api_key', teamId: 'team_1' }

Deno.test('createLinearIssue returns created + issueUrl on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    assertStringIncludes(body.query, 'issueCreate')
    assertEquals(init.headers, { 'Content-Type': 'application/json', Authorization: 'lin_api_key' })
    return new Response(
      JSON.stringify({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }),
      { status: 200 },
    )
  }) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result, { status: 'created', issueUrl: 'https://linear.app/issue/1', error: null })

  globalThis.fetch = originalFetch
})

Deno.test('createLinearIssue returns failed + error message on a GraphQL error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ errors: [{ message: 'Invalid teamId' }] }), { status: 200 })) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result.status, 'failed')
  assertEquals(result.issueUrl, null)
  assertEquals(result.error, 'Invalid teamId')

  globalThis.fetch = originalFetch
})

Deno.test('createLinearIssue returns failed when fetch itself throws (network error)', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network unreachable')
  }) as typeof fetch

  const result = await createLinearIssue(config, { title: 'Bug', description: 'desc' })
  assertEquals(result.status, 'failed')
  assertEquals(result.error, 'network unreachable')

  globalThis.fetch = originalFetch
})

Deno.test('buildIssueDescription embeds the screenshot, context, and console log', () => {
  const description = buildIssueDescription({
    description: 'the button does nothing',
    url: 'https://app.example.com/page',
    userAgent: 'test-agent',
    screenshotUrl: 'https://xyz.supabase.co/storage/v1/object/sign/screenshot.png',
    consoleEntries: [{ level: 'error', args: ['boom'], timestamp: 1700000000000 }],
  })

  assertStringIncludes(description, 'the button does nothing')
  assertStringIncludes(description, '![screenshot](https://xyz.supabase.co/storage/v1/object/sign/screenshot.png)')
  assertStringIncludes(description, 'https://app.example.com/page')
  assertStringIncludes(description, 'test-agent')
  assertStringIncludes(description, 'error: boom')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/linear.test.ts`
Expected: FAIL — `../linear.ts` does not exist.

- [ ] **Step 3: Implement Linear issue creation**

`supabase/functions/bug-catcher-submit/linear.ts`:
```ts
export interface LinearConfig {
  apiKey: string
  teamId: string
  projectId?: string
  labelIds?: string[]
}

export interface LinearIssueInput {
  title: string
  description: string
}

export interface LinearResult {
  status: 'created' | 'failed'
  issueUrl: string | null
  error: string | null
}

const LINEAR_API_URL = 'https://api.linear.app/graphql'

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { url }
    }
  }
`

export async function createLinearIssue(config: LinearConfig, input: LinearIssueInput): Promise<LinearResult> {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Linear expects the raw API key here, with no "Bearer " prefix.
        Authorization: config.apiKey,
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId: config.teamId,
            projectId: config.projectId,
            labelIds: config.labelIds,
            title: input.title,
            description: input.description,
          },
        },
      }),
    })

    const json = await response.json()
    if (!response.ok || json.errors || !json.data?.issueCreate?.success) {
      const message = json.errors?.[0]?.message ?? `Linear API responded with status ${response.status}`
      return { status: 'failed', issueUrl: null, error: message }
    }

    return { status: 'created', issueUrl: json.data.issueCreate.issue.url, error: null }
  } catch (err) {
    return { status: 'failed', issueUrl: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function safeStringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

export function buildIssueDescription(params: {
  description: string
  url: string
  userAgent: string
  screenshotUrl: string
  consoleEntries: { level: string; args: unknown[]; timestamp: number }[]
}): string {
  const consoleBlock = params.consoleEntries
    .map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.level}: ${safeStringify(e.args)}`)
    .join('\n')

  return [
    '## Report',
    params.description,
    '',
    '## Screenshot',
    `![screenshot](${params.screenshotUrl})`,
    '',
    '## Context',
    `- URL: ${params.url}`,
    `- User agent: ${params.userAgent}`,
    '',
    '## Console log',
    '```',
    consoleBlock || '(no console entries captured)',
    '```',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/linear.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bug-catcher-submit/linear.ts supabase/functions/bug-catcher-submit/test/linear.test.ts
git commit -m "feat(function): add Linear issue creation with embedded signed-URL screenshot"
```

---

### Task 13: Edge Function — request handler (full flow)

**Files:**
- Create: `supabase/functions/bug-catcher-submit/handler.ts`
- Test: `supabase/functions/bug-catcher-submit/test/handler.test.ts`

**Interfaces:**
- Consumes: `corsHeaders`/`handleOptions`/`CorsConfig` (Task 9), `verifyRequestUser` (Task 10), `checkRateLimit`/`RateLimitConfig` (Task 11), `createLinearIssue`/`buildIssueDescription`/`LinearConfig` (Task 12).
- Produces: `HandlerDeps` (the injectable dependency bag — `anonClient`, `serviceClient`, `corsConfig`, `rateLimitConfig`, `linearConfig`, `authorize`), `createHandler(deps: HandlerDeps): (req: Request) => Promise<Response>` — consumed by `index.ts` (Task 14).

This is the task that enforces the durable-first invariant: the submission row must be inserted (status `'pending'`) before the Linear call, and the Linear call's outcome must never turn into a non-200 response once the submission itself is saved.

- [ ] **Step 1: Write the failing test**

`supabase/functions/bug-catcher-submit/test/handler.test.ts`:
```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, type HandlerDeps } from '../handler.ts'

const corsConfig = { allowedOrigins: ['https://app.example.com'] }
const rateLimitConfig = { maxRequests: 5, windowMinutes: 10 }
const linearConfig = { apiKey: 'lin_key', teamId: 'team_1' }

function fakeAnonClient(user: unknown): SupabaseClient {
  return { auth: { getUser: async () => ({ data: { user }, error: null }) } } as unknown as SupabaseClient
}

function fakeServiceClient(opts: {
  rateLimitAllowed?: boolean
  insertedId?: string
  uploadError?: { message: string } | null
}): SupabaseClient {
  const { rateLimitAllowed = true, insertedId = 'sub_1', uploadError = null } = opts
  return {
    rpc: async () => ({ data: rateLimitAllowed, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ error: uploadError }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://xyz.supabase.co/signed/screenshot.png' }, error: null }),
      }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: insertedId }, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
  } as unknown as SupabaseClient
}

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt', origin: 'https://app.example.com', ...headers },
    body: JSON.stringify(body),
  })
}

const validBody = {
  screenshot: 'data:image/png;base64,aGVsbG8=',
  url: 'https://app.example.com/page',
  userAgent: 'test-agent',
  consoleEntries: [],
  description: 'it crashed',
}

Deno.test('returns 401 when the JWT is invalid', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient(null),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 401)
})

Deno.test('returns 429 when the rate limit is exceeded', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ rateLimitAllowed: false }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 429)
})

Deno.test('returns 403 when authorize() returns false', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => false,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 403)
})

Deno.test('returns 400 when the request body is missing required fields', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest({ description: 'only this' }))
  assertEquals(response.status, 400)
})

Deno.test('saves the submission and returns 200 with linearStatus created on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/issue/1' } } } }))) as typeof fetch

  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ insertedId: 'sub_42' }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  const json = await response.json()

  assertEquals(response.status, 200)
  assertEquals(json, { submissionId: 'sub_42', linearStatus: 'created', linearIssueUrl: 'https://linear.app/issue/1' })

  globalThis.fetch = originalFetch
})

Deno.test('still returns 200 with linearStatus failed when Linear errors — the submission is not lost', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ errors: [{ message: 'Invalid teamId' }] }))) as typeof fetch

  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ insertedId: 'sub_99' }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  const json = await response.json()

  assertEquals(response.status, 200)
  assertEquals(json, { submissionId: 'sub_99', linearStatus: 'failed', linearIssueUrl: null })

  globalThis.fetch = originalFetch
})

Deno.test('returns 500 when the screenshot upload fails', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient({ id: 'user_1' }),
    serviceClient: fakeServiceClient({ uploadError: { message: 'bucket not found' } }),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const response = await createHandler(deps)(buildRequest(validBody))
  assertEquals(response.status, 500)
})

Deno.test('handles CORS preflight before authentication', async () => {
  const deps: HandlerDeps = {
    anonClient: fakeAnonClient(null),
    serviceClient: fakeServiceClient({}),
    corsConfig,
    rateLimitConfig,
    linearConfig,
    authorize: async () => true,
  }
  const req = new Request('https://xyz.supabase.co/functions/v1/bug-catcher-submit', {
    method: 'OPTIONS',
    headers: { origin: 'https://app.example.com' },
  })
  const response = await createHandler(deps)(req)
  assertEquals(response.status, 204)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/handler.test.ts`
Expected: FAIL — `../handler.ts` does not exist.

- [ ] **Step 3: Implement the handler**

`supabase/functions/bug-catcher-submit/handler.ts`:
```ts
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleOptions, type CorsConfig } from './cors.ts'
import { verifyRequestUser } from './auth.ts'
import { checkRateLimit, type RateLimitConfig } from './rate-limit.ts'
import { createLinearIssue, buildIssueDescription, type LinearConfig } from './linear.ts'

export interface HandlerDeps {
  anonClient: SupabaseClient
  serviceClient: SupabaseClient
  corsConfig: CorsConfig
  rateLimitConfig: RateLimitConfig
  linearConfig: LinearConfig
  authorize: (user: User, req: Request) => boolean | Promise<boolean>
}

interface SubmitBody {
  screenshot: string
  url: string
  userAgent: string
  consoleEntries: { level: string; args: unknown[]; timestamp: number }[]
  description: string
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    const preflight = handleOptions(req, deps.corsConfig)
    if (preflight) return preflight

    const headers = {
      ...corsHeaders(req.headers.get('origin'), deps.corsConfig),
      'Content-Type': 'application/json',
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    }

    const { user, error: authError } = await verifyRequestUser(req, deps.anonClient)
    if (!user) {
      return jsonResponse({ error: authError }, 401, headers)
    }

    const allowed = await checkRateLimit(deps.serviceClient, user.id, deps.rateLimitConfig)
    if (!allowed) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, headers)
    }

    const isAuthorized = await deps.authorize(user, req)
    if (!isAuthorized) {
      return jsonResponse({ error: 'Forbidden' }, 403, headers)
    }

    let body: SubmitBody
    try {
      body = (await req.json()) as SubmitBody
      if (!body.description || !body.screenshot || !body.url) {
        throw new Error('Missing required field')
      }
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400, headers)
    }

    const base64Data = body.screenshot.replace(/^data:image\/png;base64,/, '')
    const screenshotBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const screenshotPath = `${user.id}/${crypto.randomUUID()}.png`

    const { error: uploadError } = await deps.serviceClient.storage
      .from('bug-catcher-screenshots')
      .upload(screenshotPath, screenshotBytes, { contentType: 'image/png' })

    if (uploadError) {
      return jsonResponse({ error: `Screenshot upload failed: ${uploadError.message}` }, 500, headers)
    }

    const { data: signedUrlData, error: signedUrlError } = await deps.serviceClient.storage
      .from('bug-catcher-screenshots')
      .createSignedUrl(screenshotPath, 60 * 60 * 24 * 365)

    if (signedUrlError || !signedUrlData) {
      return jsonResponse({ error: 'Failed to generate screenshot URL' }, 500, headers)
    }

    // Durable-first: this insert must land before the Linear call below.
    const { data: inserted, error: insertError } = await deps.serviceClient
      .from('bug_catcher_submissions')
      .insert({
        user_id: user.id,
        url: body.url,
        user_agent: body.userAgent,
        description: body.description,
        console_entries: body.consoleEntries,
        screenshot_path: screenshotPath,
        linear_status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      return jsonResponse({ error: `Failed to save submission: ${insertError?.message}` }, 500, headers)
    }

    const submissionId = inserted.id as string

    const linearResult = await createLinearIssue(deps.linearConfig, {
      title: `Bug report: ${body.url}`,
      description: buildIssueDescription({
        description: body.description,
        url: body.url,
        userAgent: body.userAgent,
        screenshotUrl: signedUrlData.signedUrl,
        consoleEntries: body.consoleEntries,
      }),
    })

    await deps.serviceClient
      .from('bug_catcher_submissions')
      .update({
        linear_status: linearResult.status,
        linear_issue_url: linearResult.issueUrl,
        linear_error: linearResult.error,
      })
      .eq('id', submissionId)

    // A Linear failure is never a submission failure: the report is already durable.
    return jsonResponse(
      { submissionId, linearStatus: linearResult.status, linearIssueUrl: linearResult.issueUrl },
      200,
      headers,
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/handler.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bug-catcher-submit/handler.ts supabase/functions/bug-catcher-submit/test/handler.test.ts
git commit -m "feat(function): add request handler enforcing durable-first submission flow"
```

---

### Task 14: Edge Function — env wiring, config template, deploy smoke test

**Files:**
- Create: `supabase/functions/bug-catcher-submit/config.example.ts`
- Create: `supabase/functions/bug-catcher-submit/index.ts`
- Create: `supabase/functions/.env.example`

**Interfaces:**
- Consumes: `createHandler` (Task 13), `createClient` from `npm:@supabase/supabase-js@2`.
- Produces: the deployable entry point Supabase's CLI/runtime invokes (`Deno.serve`). Integrators copy `config.example.ts` to `config.ts` and edit it — `config.ts` itself is intentionally not committed (each integrator's `authorize` logic and Linear routing differs).

- [ ] **Step 1: Write the config template and entry point**

`supabase/functions/bug-catcher-submit/config.example.ts`:
```ts
import type { User } from 'npm:@supabase/supabase-js@2'

// Copy this file to config.ts and edit it — config.ts is gitignored so your
// authorization logic and Linear routing stay local to your deployment.
export const config = {
  allowedOrigins: ['https://your-app.example.com'],
  rateLimit: { maxRequests: 5, windowMinutes: 10 },
  linearProjectId: undefined as string | undefined,
  linearLabelIds: [] as string[],

  // REQUIRED — no default. This is the real security boundary: hiding the
  // bubble client-side is UX only. Replace this with your own check (a role
  // claim, an org-membership lookup, etc).
  authorize: async (user: User, _req: Request): Promise<boolean> => {
    return user.app_metadata?.role !== 'guest'
  },
}
```

`supabase/functions/bug-catcher-submit/index.ts`:
```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.ts'
import { config } from './config.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const linearApiKey = Deno.env.get('LINEAR_API_KEY')!
const linearTeamId = Deno.env.get('LINEAR_TEAM_ID')!

const handler = createHandler({
  anonClient: createClient(supabaseUrl, supabaseAnonKey),
  serviceClient: createClient(supabaseUrl, supabaseServiceRoleKey),
  corsConfig: { allowedOrigins: config.allowedOrigins },
  rateLimitConfig: config.rateLimit,
  linearConfig: {
    apiKey: linearApiKey,
    teamId: linearTeamId,
    projectId: config.linearProjectId,
    labelIds: config.linearLabelIds,
  },
  authorize: config.authorize,
})

Deno.serve(handler)
```

`supabase/functions/.env.example`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LINEAR_API_KEY=your-linear-personal-api-key
LINEAR_TEAM_ID=your-linear-team-id
```

Add `supabase/functions/bug-catcher-submit/config.ts` to the root `.gitignore` (append):
```
supabase/functions/bug-catcher-submit/config.ts
```

- [ ] **Step 2: Smoke-test the function locally**

Copy the config template so the function has something to import:
```bash
cp supabase/functions/bug-catcher-submit/config.example.ts supabase/functions/bug-catcher-submit/config.ts
cp supabase/functions/.env.example supabase/functions/.env.local
```

Run: `npx supabase start` (if not already running from Task 8)

Run: `npx supabase functions serve bug-catcher-submit --env-file supabase/functions/.env.local --no-verify-jwt`
Expected: prints `Serving functions on http://127.0.0.1:54321/functions/v1/bug-catcher-submit`, no startup errors (confirms `config.ts` type-checks and the handler wires up under the real Deno runtime).

In a second terminal, verify the OPTIONS preflight responds correctly:
```bash
curl -i -X OPTIONS http://127.0.0.1:54321/functions/v1/bug-catcher-submit \
  -H "origin: https://your-app.example.com"
```
Expected: `HTTP/1.1 204 No Content` with an `Access-Control-Allow-Origin` header.

Stop the function server (Ctrl+C) and run: `npx supabase stop`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/bug-catcher-submit/config.example.ts supabase/functions/bug-catcher-submit/index.ts supabase/functions/.env.example .gitignore
git commit -m "feat(function): add config template and deployable entry point"
```

---

### Task 15: Demo app

**Files:**
- Create: `examples/demo-app/package.json`
- Create: `examples/demo-app/index.html`
- Create: `examples/demo-app/vite.config.ts`
- Create: `examples/demo-app/tsconfig.json`
- Create: `examples/demo-app/.env.example`
- Create: `examples/demo-app/src/main.tsx`
- Create: `examples/demo-app/src/App.tsx`

**Interfaces:**
- Consumes: `BugCatcherBubble` from `@bug-catcher/react` (Task 7).
- Produces: a runnable example integrators can copy from — not published, no further consumers.

- [ ] **Step 1: Scaffold the demo app**

`examples/demo-app/package.json`:
```json
{
  "name": "bug-catcher-demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@bug-catcher/react": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

`examples/demo-app/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>bug-catcher demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`examples/demo-app/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

`examples/demo-app/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

`examples/demo-app/.env.example`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`examples/demo-app/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`examples/demo-app/src/App.tsx`:
```tsx
import { BugCatcherBubble } from '@bug-catcher/react'

export function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>bug-catcher demo app</h1>
      <p>Click the bubble in the bottom-right corner to file a bug report.</p>

      <BugCatcherBubble
        supabaseUrl={import.meta.env.VITE_SUPABASE_URL}
        supabaseAnonKey={import.meta.env.VITE_SUPABASE_ANON_KEY}
        onSubmitted={(result) => console.log('Bug report submitted', result)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify the demo app builds**

Run: `pnpm install` (from repo root, to link the `workspace:*` dependency on `@bug-catcher/react`)
Run: `pnpm --filter bug-catcher-demo run build`
Expected: exits 0, produces `examples/demo-app/dist/` with no TypeScript errors.

- [ ] **Step 3: Manual smoke test in a browser**

```bash
cp examples/demo-app/.env.example examples/demo-app/.env.local
# edit .env.local with a real Supabase project's URL/anon key
pnpm --filter bug-catcher-demo run dev
```
Open the printed local URL. Expected: the page renders "bug-catcher demo app", a bubble appears bottom-right, clicking it opens the form, typing enables Submit, and Cancel closes the form. (A full round-trip to a real Linear issue requires the Edge Function to be deployed with real env vars — that's a documented post-setup step in the README, Task 16, not part of this task's pass/fail check.)

- [ ] **Step 4: Commit**

```bash
git add examples/demo-app
git commit -m "feat(demo): add Vite + React example app"
```

---

### Task 16: README, CSP checklist, and final license check

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: the setup guide integrators follow — no code interface.

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# bug-catcher

A lightweight, self-hostable bug-reporting widget for web apps. Drop in a
React bubble; it captures a screenshot, browser/OS info, the current URL,
and recent console output, then creates a Linear issue — using **your own**
Supabase project and Linear API key. Zero SaaS dependency, zero
subscription.

## Packages

- `@bug-catcher/core` — framework-agnostic capture + submit logic.
- `@bug-catcher/react` — the `<BugCatcherBubble />` component.
- `supabase/functions/bug-catcher-submit` — the Edge Function template you deploy.

## 5-minute setup

1. **Install the React package:**
   ```bash
   npm install @bug-catcher/react @supabase/supabase-js
   ```

2. **Copy the Edge Function into your own Supabase project:**
   ```bash
   cp -r supabase/functions/bug-catcher-submit YOUR_PROJECT/supabase/functions/
   cp supabase/migrations/0001_bug_catcher_schema.sql YOUR_PROJECT/supabase/migrations/
   cp YOUR_PROJECT/supabase/functions/bug-catcher-submit/config.example.ts \
      YOUR_PROJECT/supabase/functions/bug-catcher-submit/config.ts
   ```
   Edit `config.ts`: set `allowedOrigins` to your app's domain(s), and write
   your `authorize` check. **This is required — there is no default.**
   Hiding the bubble client-side is UX only; `authorize` is the real
   security boundary.

3. **Set required env vars** (`supabase secrets set` or your dashboard):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project settings.
   - `LINEAR_API_KEY` — a **personal API key** from Linear (Settings → API). Linear's personal keys grant full workspace access and aren't scoped; there's no narrower scope to select. (An OAuth app with `issues:create`/`read` scopes would be the only way to narrow this — out of scope for this project.)
   - `LINEAR_TEAM_ID` — the Linear team the issue should be created in.

4. **Deploy the migration and function:**
   ```bash
   supabase db push
   supabase functions deploy bug-catcher-submit
   ```

5. **Drop the bubble into your app:**
   ```tsx
   import { BugCatcherBubble } from '@bug-catcher/react'

   <BugCatcherBubble
     supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL}
     supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
   />
   ```

See `examples/demo-app` for a complete working example.

## Why screenshots are embedded via a signed Supabase Storage URL

An earlier internal implementation tried two more "obvious" approaches, and
both failed in ways that only reproduced in a real deployed environment:

- Uploading the screenshot to Linear server-side via its
  `fileUpload`/`attachmentCreate` GraphQL flow fails from Supabase Edge
  Functions with a GCS "MalformedSecurityHeader" rejection on the
  content-type header.
- Uploading directly from the browser to Linear's own GCS bucket is blocked
  unconditionally — that bucket doesn't return
  `Access-Control-Allow-Origin` on preflight.

The approach here sidesteps both: the screenshot goes to **your own**
Supabase Storage bucket, a 1-year signed URL is generated, and that URL is
embedded as a Markdown image directly in the Linear issue's description.
Only well-established first-party APIs are used on both sides.

## CSP checklist

Add to your app's Content-Security-Policy:

- `connect-src`: your Supabase project domain (`https://YOUR_PROJECT.supabase.co`) — required for both the function call and Storage.
- `img-src`: same Supabase domain — only needed if you ever display a submitted screenshot back in your own app.

No third-party domains are required.

## Durability guarantee

Every submission is inserted into your `bug_catcher_submissions` table
**before** the Linear API call is attempted. If Linear creation fails, the
report is still saved (`linear_status = 'failed'`, `linear_error` holds the
message) — nothing is lost. There's no automated retry in v1; query
`where linear_status = 'failed'` to find submissions that need a manual
follow-up.

## Rate limiting

Configurable in `config.ts` (`rateLimit: { maxRequests, windowMinutes }`,
default 5 requests / 10 minutes per user), enforced via a Postgres-backed
sliding window — no external services required.

## Not in v1

Hosted/managed version, Jira/GitHub Issues support, team analytics
dashboard, automated Linear retry, non-React framework wrappers.

## License

MIT
```

- [ ] **Step 2: Verify all links/paths referenced in the README exist**

Run:
```bash
test -f supabase/migrations/0001_bug_catcher_schema.sql && \
test -f supabase/functions/bug-catcher-submit/config.example.ts && \
test -d examples/demo-app && \
echo "all referenced paths exist"
```
Expected: prints `all referenced paths exist`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup guide, CSP checklist, and durability notes"
```

---

### Task 17: Final integration pass

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: everything built in Tasks 1–16.
- Produces: confidence that the whole workspace builds and all test suites pass together, not just in isolation.

- [ ] **Step 1: Install and build the whole workspace**

Run: `pnpm install`
Expected: exits 0.

Run: `pnpm run build` (root script, runs `build` in every package under `packages/*`)
Expected: both `@bug-catcher/core` and `@bug-catcher/react` build with no errors.

- [ ] **Step 2: Run every test suite**

Run: `pnpm run test` (root script — Vitest for both packages)
Expected: all core + react tests pass (16 tests total: 8 core + 8 react from Tasks 2–7).

Run: `deno test --allow-net supabase/functions/bug-catcher-submit/test/`
Expected: all Edge Function tests pass (18 tests total: 4 cors + 3 auth + 3 rate-limit + 4 linear + 8 handler... — actual count depends on final assertions per test, all should report `ok`).

Run: `pnpm --filter bug-catcher-demo run build`
Expected: exits 0.

- [ ] **Step 3: Confirm no stray `config.ts` (the gitignored integrator file) leaked into git**

Run: `git status --short`
Expected: clean working tree (the `config.ts` created in Task 14's local smoke test is gitignored and untracked — confirm it does not appear as a tracked/staged file).

- [ ] **Step 4: Tag the v1 milestone**

```bash
git log --oneline -20
```
Review the commit history reads cleanly task-by-task. No further commit needed for this task — it's a verification checkpoint, not a code change.

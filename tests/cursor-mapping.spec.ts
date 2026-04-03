import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots')

function ss(name: string, project: string) {
  return path.join(SCREENSHOTS_DIR, `${project}-cm-${name}.png`)
}

// ─── Unit tests for the core type system (run in browser context) ────────────

test.describe('Core Type System (in-browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('parser: segments text and mentions correctly', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const doc = parseDocument('Hey <user_mention id="abc123" /> can you check this?')
      return {
        segmentCount: doc.segments.length,
        kinds: doc.segments.map(s => s.kind),
        texts: doc.segments.map(s => s.kind === 'text' ? s.content : `[mention:${s.mentionType.kind}]`),
      }
    })

    expect(result.segmentCount).toBe(3)
    expect(result.kinds).toEqual(['text', 'mention', 'text'])
    expect(result.texts).toEqual(['Hey ', '[mention:user]', ' can you check this?'])
  })

  test('parser: handles promptql mention', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const doc = parseDocument('Ask <promptql_mention /> for help')
      return {
        segmentCount: doc.segments.length,
        kinds: doc.segments.map(s => s.kind),
      }
    })

    expect(result.segmentCount).toBe(3)
    expect(result.kinds).toEqual(['text', 'mention', 'text'])
  })

  test('parser: multiple mentions', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const doc = parseDocument('<user_mention id="a" /> and <user_mention id="b" />')
      return {
        segmentCount: doc.segments.length,
        kinds: doc.segments.map(s => s.kind),
      }
    })

    expect(result.segmentCount).toBe(3)
    expect(result.kinds).toEqual(['mention', 'text', 'mention'])
  })

  test('position map: atomic segments have correct boundaries', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap } = await import('/src/core/position-map.ts')
      const doc = parseDocument('Hey <user_mention id="abc" /> bye')
      const map = buildPositionMap(doc)
      return {
        mappings: map.mappings.map(m => ({
          isAtomic: m.isAtomic,
          sourceStart: m.sourceStart,
          sourceEnd: m.sourceEnd,
          visualStart: m.visualStart,
          visualEnd: m.visualEnd,
        })),
        totalSourceLength: map.totalSourceLength,
        totalVisualLength: map.totalVisualLength,
      }
    })

    // "Hey " = 4 chars, then atomic mention, then " bye" = 4 chars
    expect(result.mappings[0].isAtomic).toBe(false)
    expect(result.mappings[0].visualStart).toBe(0)
    expect(result.mappings[0].visualEnd).toBe(4)

    expect(result.mappings[1].isAtomic).toBe(true)
    expect(result.mappings[1].visualStart).toBe(4)
    // @abc = 4 chars visual
    expect(result.mappings[1].visualEnd).toBe(8)

    expect(result.mappings[2].isAtomic).toBe(false)
  })

  test('cursor: moveRight skips over atomic mention', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { movePosition } = await import('/src/core/cursor.ts')
      const { textPosition, atomicBoundary } = await import('/src/types/document.ts')

      // "Hey <mention/> bye"
      const doc = parseDocument('Hey <user_mention id="abc" /> bye')

      // Start at end of "Hey " (text segment 0, offset 4)
      const pos0 = textPosition(0, 4)

      // Move right → should hit atomic boundary 'before'
      const pos1 = movePosition(doc, pos0, 'right')

      // Move right → should skip to atomic boundary 'after'
      const pos2 = movePosition(doc, pos1, 'right')

      return {
        pos1: { kind: pos1.kind, segmentIndex: pos1.segmentIndex, ...(pos1.kind === 'atomicBoundary' ? { side: pos1.side } : { offset: pos1.offset }) },
        pos2: { kind: pos2.kind, segmentIndex: pos2.segmentIndex, ...(pos2.kind === 'atomicBoundary' ? { side: pos2.side } : { offset: pos2.offset }) },
      }
    })

    // After moving right from end of text, we enter the mention
    expect(result.pos1.kind).toBe('atomicBoundary')
    expect(result.pos1.segmentIndex).toBe(1)
    expect(result.pos1).toHaveProperty('side', 'before')

    // Moving right again skips the entire atomic
    expect(result.pos2.kind).toBe('atomicBoundary')
    expect(result.pos2.segmentIndex).toBe(1)
    expect(result.pos2).toHaveProperty('side', 'after')
  })

  test('cursor: moveLeft skips over atomic mention', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { movePosition } = await import('/src/core/cursor.ts')
      const { textPosition } = await import('/src/types/document.ts')

      const doc = parseDocument('Hey <user_mention id="abc" /> bye')

      // Start at " bye" segment (index 2), offset 0
      // Move left to get to offset 0, then one more left
      const pos0 = textPosition(2, 0)
      const pos1 = movePosition(doc, pos0, 'left')
      const pos2 = movePosition(doc, pos1, 'left')

      return {
        pos1: { kind: pos1.kind, segmentIndex: pos1.segmentIndex, ...(pos1.kind === 'atomicBoundary' ? { side: pos1.side } : { offset: pos1.offset }) },
        pos2: { kind: pos2.kind, segmentIndex: pos2.segmentIndex, ...(pos2.kind === 'atomicBoundary' ? { side: pos2.side } : { offset: pos2.offset }) },
      }
    })

    // Moving left from start of " bye" → after the atomic
    expect(result.pos1.kind).toBe('atomicBoundary')
    expect(result.pos1.segmentIndex).toBe(1)
    expect(result.pos1).toHaveProperty('side', 'after')

    // Moving left again → before the atomic (skips over it)
    expect(result.pos2.kind).toBe('atomicBoundary')
    expect(result.pos2.segmentIndex).toBe(1)
    expect(result.pos2).toHaveProperty('side', 'before')
  })

  test('cursor position can never be inside an atomic', async ({ page }) => {
    // This test verifies the TYPE SYSTEM guarantee:
    // CursorPosition is either TextPosition or AtomicBoundary.
    // There's no variant that allows offset within a mention.
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { movePosition, documentStart, documentEnd } = await import('/src/core/cursor.ts')

      const doc = parseDocument('A<user_mention id="x" />B')

      // Walk the entire document left-to-right, collecting all positions
      const positions: any[] = []
      let pos = documentStart(doc)
      positions.push({ ...pos })

      for (let i = 0; i < 20; i++) { // safety limit
        const next = movePosition(doc, pos, 'right')
        // Check if we've stopped moving (end of document)
        if (next.kind === pos.kind && next.segmentIndex === pos.segmentIndex) {
          if (next.kind === 'text' && pos.kind === 'text' && next.offset === pos.offset) break
          if (next.kind === 'atomicBoundary' && pos.kind === 'atomicBoundary' && next.side === pos.side) break
        }
        pos = next
        positions.push({ ...pos })
      }

      return positions
    })

    // Verify no position has kind 'text' with a segmentIndex pointing to a mention
    // The valid positions should be:
    // text(0, 0) → text(0, 1) → atomicBoundary(1, before) → atomicBoundary(1, after) → text(2, 1)
    for (const pos of result) {
      if (pos.kind === 'text') {
        // This is fine: text positions only exist on text segments
        expect(pos.segmentIndex).not.toBe(1) // segment 1 is the mention
      }
      if (pos.kind === 'atomicBoundary') {
        // Atomic boundaries are always before or after
        expect(['before', 'after']).toContain(pos.side)
      }
    }
  })
})

// ─── Visual/Integration Tests ────────────────────────────────────────────────

test.describe('Visual: Mention Pill Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('preset buttons load mention text and render pills', async ({ page }, testInfo) => {
    const project = testInfo.project.name

    // Click the "@mention" preset
    await page.click('button:text("@mention")')
    await page.waitForTimeout(300)

    // Screenshot the chatbox with mention pill
    await page.screenshot({ path: ss('01-mention-pill', project) })

    // Verify a mention pill is rendered
    const pills = page.locator('.mention-pill')
    await expect(pills).toHaveCount(1)

    // Verify the pill shows the user name
    const pillText = await pills.first().innerText()
    expect(pillText).toContain('Maya Chen')
  })

  test('multiple mentions render as pills', async ({ page }, testInfo) => {
    const project = testInfo.project.name

    await page.click('button:text("Multiple mentions")')
    await page.waitForTimeout(300)
    await page.screenshot({ path: ss('02-multiple-pills', project) })

    const pills = page.locator('.mention-pill')
    await expect(pills).toHaveCount(3) // Maya, Alex, PromptQL

    // Verify promptql mention has different style
    const promptqlPill = page.locator('.mention-pill--promptql')
    await expect(promptqlPill).toHaveCount(1)
  })

  test('mention at start renders correctly', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("Mention at start")')
    await page.waitForTimeout(300)
    await page.screenshot({ path: ss('03-mention-at-start', project) })

    const pills = page.locator('.mention-pill')
    await expect(pills).toHaveCount(1)
  })

  test('mention at end renders correctly', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("Mention at end")')
    await page.waitForTimeout(300)
    await page.screenshot({ path: ss('04-mention-at-end', project) })

    const pills = page.locator('.mention-pill')
    await expect(pills).toHaveCount(1)
  })

  test('plain text still works (no pills)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("Plain text")')
    await page.waitForTimeout(300)
    await page.screenshot({ path: ss('05-plain-text', project) })

    const pills = page.locator('.mention-pill')
    await expect(pills).toHaveCount(0)
  })

  test('custom cursor blinks when focused', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("@mention")')
    await page.waitForTimeout(200)

    // Focus the chatbox
    await page.click('.hybrid-chatbox')
    await page.waitForTimeout(200)

    await page.screenshot({ path: ss('06-cursor-visible', project) })

    const cursor = page.locator('.rich-overlay__cursor')
    await expect(cursor).toBeVisible()
  })

  test('send message with mention and verify clear', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("@mention")')
    await page.waitForTimeout(300)

    // Focus and send
    await page.click('.hybrid-chatbox')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    await page.screenshot({ path: ss('07-after-send', project) })

    // Message should appear
    const messages = page.locator('.message__text')
    await expect(messages).toHaveCount(1)

    // Chatbox should be cleared (show placeholder)
    const placeholder = page.locator('.hybrid-chatbox__placeholder')
    await expect(placeholder).toBeVisible()
  })
})

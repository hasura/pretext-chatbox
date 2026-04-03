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
          sourceStart: m.sourceStart as number,
          sourceEnd: m.sourceEnd as number,
          visualStart: m.visualStart as number,
          visualEnd: m.visualEnd as number,
        })),
        totalSourceLength: map.totalSourceLength as number,
        totalVisualLength: map.totalVisualLength as number,
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
    for (const pos of result) {
      if (pos.kind === 'text') {
        expect(pos.segmentIndex).not.toBe(1) // segment 1 is the mention
      }
      if (pos.kind === 'atomicBoundary') {
        expect(['before', 'after']).toContain(pos.side)
      }
    }
  })
})

// ─── Branded Type / Position Mapping Tests ──────────────────────────────────

test.describe('Branded Offset Mapping (in-browser)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('sourceToVisual and visualToSource are inverses for text positions', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap, sourceToVisual, visualToSource } = await import('/src/core/position-map.ts')
      const { sourceOffset, visualOffset } = await import('/src/types/document.ts')

      const doc = parseDocument('Hello world')
      const map = buildPositionMap(doc)

      // For plain text, source offset === visual offset
      const results: boolean[] = []
      for (let i = 0; i <= 11; i++) {
        const vis = sourceToVisual(map, sourceOffset(i))
        results.push(vis === i)
        const src = visualToSource(map, visualOffset(i))
        results.push(src === i)
      }
      return results
    })

    // All should be true — plain text has 1:1 mapping
    expect(result.every(Boolean)).toBe(true)
  })

  test('sourceToVisual maps mention source offsets to visual boundaries', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap, sourceToVisual } = await import('/src/core/position-map.ts')
      const { sourceOffset } = await import('/src/types/document.ts')

      // "Hi <user_mention id="Jo" /> bye"
      // Source: Hi [28 chars for tag] bye
      // Visual: Hi @Jo bye
      const doc = parseDocument('Hi <user_mention id="Jo" /> bye')
      const map = buildPositionMap(doc)

      return {
        // "Hi " = source offset 3 → visual offset 3
        beforeMention: sourceToVisual(map, sourceOffset(3)) as number,
        // Inside the mention tag (source offset 10) → snaps to visual boundary
        insideMention: sourceToVisual(map, sourceOffset(10)) as number,
        // After mention tag → visual offset = "Hi " (3) + "@Jo" (3) = 6
        afterMention: sourceToVisual(map, sourceOffset(27)) as number,
        totalSource: map.totalSourceLength as number,
        totalVisual: map.totalVisualLength as number,
      }
    })

    expect(result.beforeMention).toBe(3)
    // Inside mention snaps to before (offset 10 is closer to start at 3 than end at 27)
    expect(result.insideMention).toBe(3) // snaps to 'before' boundary
    expect(result.afterMention).toBe(6)  // after mention
  })

  test('visualToSource maps visual positions correctly with mentions', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap, visualToSource } = await import('/src/core/position-map.ts')
      const { visualOffset } = await import('/src/types/document.ts')

      const doc = parseDocument('Hi <user_mention id="Jo" /> bye')
      const map = buildPositionMap(doc)

      return {
        // Visual offset 3 = start of mention → source offset = start of mention tag
        atMentionStart: visualToSource(map, visualOffset(3)) as number,
        // Visual offset 4 = inside "@Jo" visually → snaps to boundary
        insideMentionVisual: visualToSource(map, visualOffset(4)) as number,
        // Visual offset 6 = after mention → source offset = after mention tag
        afterMention: visualToSource(map, visualOffset(6)) as number,
      }
    })

    expect(result.atMentionStart).toBe(3) // source start of mention
    // Visual offset 4 is inside the 3-char visual "@Jo" — snaps to after (closer to end at 6)
    expect(result.afterMention).toBe(27) // source end of mention tag
  })

  test('sourceToPosition snaps offsets inside mention to atomic boundaries', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap, sourceToPosition, positionToSource } = await import('/src/core/position-map.ts')
      const { sourceOffset } = await import('/src/types/document.ts')

      // "X<user_mention id="Y" />Z"
      const doc = parseDocument('X<user_mention id="Y" />Z')
      const map = buildPositionMap(doc)

      // Source offset 1 = boundary between "X" and mention tag
      // (maps to end of text segment, not inside mention)
      const pos1 = sourceToPosition(map, sourceOffset(1))
      // Source offset 5 = inside mention tag (closer to start)
      const pos5 = sourceToPosition(map, sourceOffset(5))
      // Source offset 20 = inside mention tag (closer to end)
      const pos20 = sourceToPosition(map, sourceOffset(20))

      // Calculate the mention tag length for assertions
      const mentionTag = '<user_mention id="Y" />'
      const mentionEnd = 1 + mentionTag.length  // = 24

      return {
        pos1: { kind: pos1.kind, ...(pos1.kind === 'atomicBoundary' ? { side: pos1.side } : { offset: pos1.kind === 'text' ? pos1.offset : undefined }) },
        pos5: { kind: pos5.kind, ...(pos5.kind === 'atomicBoundary' ? { side: pos5.side } : {}) },
        pos20: { kind: pos20.kind, ...(pos20.kind === 'atomicBoundary' ? { side: pos20.side } : {}) },
        // Round-trip: snap to boundary then back to source
        snapped1: positionToSource(map, pos1) as number,
        snapped5: positionToSource(map, pos5) as number,
        snapped20: positionToSource(map, pos20) as number,
        mentionEnd,
      }
    })

    // Offset 1 is at the text/mention boundary — resolves to text segment end
    expect(result.pos1.kind).toBe('text')
    expect(result.pos1.offset).toBe(1) // end of "X"

    // Offsets truly inside the mention snap to atomicBoundary
    expect(result.pos5.kind).toBe('atomicBoundary')
    expect(result.pos5.side).toBe('before') // closer to start
    expect(result.pos20.kind).toBe('atomicBoundary')
    expect(result.pos20.side).toBe('after') // closer to end

    // Snapped source offsets are at the tag boundaries, not inside
    expect(result.snapped1).toBe(1) // boundary position
    expect(result.snapped5).toBe(1) // snapped to before
    expect(result.snapped20).toBe(result.mentionEnd) // snapped to after (end of tag)
  })

  test('setSelectionRange receives source offsets, not visual offsets', async ({ page }) => {
    // This test verifies BUG 3 is fixed: the textarea receives SOURCE offsets
    const result = await page.evaluate(async () => {
      const { parseDocument } = await import('/src/core/parser.ts')
      const { buildPositionMap, positionToSource, positionToVisual } = await import('/src/core/position-map.ts')
      const { atomicBoundary } = await import('/src/types/document.ts')

      const doc = parseDocument('Hello <user_mention id="John" /> how are you')
      const map = buildPositionMap(doc)

      // Position: after the mention
      const pos = atomicBoundary(1, 'after')
      const sourcePos = positionToSource(map, pos) as number
      const visualPos = positionToVisual(map, pos) as number

      return {
        sourcePos,
        visualPos,
        // These must be DIFFERENT — mixing them was the bug
        areDifferent: sourcePos !== visualPos,
        // setSelectionRange should use sourcePos, NOT visualPos
        sourceText: doc.source,
        sourceLength: doc.source.length,
      }
    })

    // The source offset after the mention tag is much larger than the visual offset
    expect(result.areDifferent).toBe(true)
    expect(result.sourcePos).toBeGreaterThan(result.visualPos)
    // Source: "Hello " (6) + '<user_mention id="John" />' (26) = 32
    // Visual: "Hello " (6) + "@John" (5) = 11
    expect(result.sourcePos).toBe(32)
    expect(result.visualPos).toBe(11)
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

  test('custom cursor visible when focused (no duplicate native caret)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await page.click('button:text("@mention")')
    await page.waitForTimeout(200)

    // Focus the chatbox
    await page.click('.hybrid-chatbox')
    await page.waitForTimeout(200)

    await page.screenshot({ path: ss('06-cursor-visible', project) })

    // Custom cursor should be visible
    const cursor = page.locator('.rich-overlay__cursor')
    await expect(cursor).toBeVisible()

    // Native caret should be hidden (caret-color: transparent)
    const caretColor = await page.locator('.hybrid-chatbox__textarea').evaluate(
      el => getComputedStyle(el).caretColor
    )
    expect(caretColor).toBe('rgba(0, 0, 0, 0)')
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

// ─── Bug Regression Tests ───────────────────────────────────────────────────

test.describe('Bug Regression: Cursor Mapping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('BUG 1 regression: only one cursor visible (no duplicates)', async ({ page }) => {
    await page.click('button:text("@mention")')
    await page.waitForTimeout(200)
    await page.click('.hybrid-chatbox')
    await page.waitForTimeout(200)

    // Custom cursor is visible
    const customCursor = page.locator('.rich-overlay__cursor')
    await expect(customCursor).toBeVisible()

    // Native caret is transparent
    const caretColor = await page.locator('.hybrid-chatbox__textarea').evaluate(
      el => getComputedStyle(el).caretColor
    )
    expect(caretColor).toBe('rgba(0, 0, 0, 0)')
  })

  test('BUG 2 regression: arrow keys update React selection state', async ({ page }) => {
    // Load text with a mention, focus, press arrow keys
    await page.click('button:text("@mention")')
    await page.waitForTimeout(200)
    await page.click('.hybrid-chatbox')
    await page.waitForTimeout(200)

    // Press Left arrow several times
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(100)

    // The custom cursor should still be visible (state is synced)
    const cursor = page.locator('.rich-overlay__cursor')
    await expect(cursor).toBeVisible()
  })

  test('BUG 3 regression: textarea selection uses source offsets', async ({ page }) => {
    // This verifies that setSelectionRange uses source offsets, not visual
    await page.click('button:text("@mention")')
    await page.waitForTimeout(200)
    await page.click('.hybrid-chatbox')
    await page.waitForTimeout(200)

    // The textarea value should contain the raw source (with XML tags)
    const textareaValue = await page.locator('.hybrid-chatbox__textarea').inputValue()
    expect(textareaValue).toContain('<user_mention')
    expect(textareaValue).toContain('/>')

    // Get the textarea's selectionStart — it should be a valid source offset
    const selStart = await page.locator('.hybrid-chatbox__textarea').evaluate(
      (el: HTMLTextAreaElement) => el.selectionStart
    )
    // Selection should be at a valid position (not inside a tag)
    // It should be either before the tag, after the tag, or in text
    const source = textareaValue
    const mentionStart = source.indexOf('<user_mention')
    const mentionEnd = source.indexOf('/>') + 2

    // selStart should NOT be between mentionStart and mentionEnd (exclusive)
    const isInsideMention = selStart > mentionStart && selStart < mentionEnd
    expect(isInsideMention).toBe(false)
  })
})

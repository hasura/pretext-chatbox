import { test, expect, type Page, type Locator } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots')

function ssPath(name: string, project: string) {
  return path.join(SCREENSHOTS_DIR, `${project}-${name}.png`)
}

async function getEditable(page: Page): Promise<Locator> {
  return page.locator('.hybrid-chatbox__editable')
}

async function getOverlay(page: Page): Promise<Locator> {
  return page.locator('.hybrid-chatbox__overlay')
}

async function typeInChatbox(page: Page, text: string) {
  const editable = await getEditable(page)
  await editable.click()
  await editable.pressSequentially(text, { delay: 30 })
}

async function clearChatbox(page: Page) {
  const editable = await getEditable(page)
  await editable.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
}

// ─── Test Suite ───

test.describe('Input Types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('01 - simple text', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'Hello world')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('01-simple-text', project) })

    const overlay = await getOverlay(page)
    const overlayText = await overlay.innerText()
    expect(overlayText).toContain('Hello world')
  })

  test('02 - multiline text with Shift+Enter', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const editable = await getEditable(page)
    await editable.click()
    await page.keyboard.type('Line one')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Line two')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Line three')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('02-multiline', project) })

    const overlay = await getOverlay(page)
    const overlayText = await overlay.innerText()
    expect(overlayText).toContain('Line one')
    expect(overlayText).toContain('Line two')
    expect(overlayText).toContain('Line three')
  })

  test('03 - long paragraph that wraps', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const longText = 'The quick brown fox jumps over the lazy dog. This sentence is intentionally long to test word wrapping behavior in the hybrid chatbox component. We want to see how pretext handles line breaks compared to the native contenteditable rendering.'
    await typeInChatbox(page, longText)
    await page.waitForTimeout(300)
    await page.screenshot({ path: ssPath('03-long-paragraph', project) })

    const overlay = await getOverlay(page)
    const overlayText = await overlay.innerText()
    expect(overlayText).toContain('quick brown fox')
  })

  test('04 - special characters: emoji, quotes, backticks', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const editable = await getEditable(page)
    await editable.click()
    // Type special chars via keyboard.type which handles unicode
    await page.keyboard.type('Hello 🎉 "test" `code` <html> & more 🚀✨')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('04-special-chars', project) })

    const overlay = await getOverlay(page)
    const overlayText = await overlay.innerText()
    expect(overlayText).toContain('🎉')
    expect(overlayText).toContain('"test"')
  })

  test('05 - very long single word', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const longWord = 'Supercalifragilisticexpialidociousandthensomelongerwordsthatjustkeepgoingandgoingwithoutanybreakatall'
    await typeInChatbox(page, longWord)
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('05-long-word', project) })
  })

  test('06 - mixed short and long lines', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const editable = await getEditable(page)
    await editable.click()
    await page.keyboard.type('Hi')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('This is a much longer second line that should definitely wrap around in the chatbox to demonstrate mixed content heights and line lengths')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Short again')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('06-mixed-lines', project) })
  })
})

test.describe('Cursor Mapping Investigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.hybrid-chatbox')
  })

  test('07 - click in middle of text: cursor position check', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'The quick brown fox jumps over')
    await page.waitForTimeout(200)

    // Screenshot before clicking
    await page.screenshot({ path: ssPath('07a-before-click', project) })

    // Click roughly in the middle of the overlay text
    const overlay = await getOverlay(page)
    const overlayBox = await overlay.boundingBox()
    if (overlayBox) {
      // Click at ~40% from left (should land around "brown")
      await page.mouse.click(
        overlayBox.x + overlayBox.width * 0.4,
        overlayBox.y + 20
      )
      await page.waitForTimeout(200)
    }

    // Screenshot after clicking - examine caret position
    await page.screenshot({ path: ssPath('07b-after-click-middle', project) })

    // Now get the selection position from the editable to check alignment
    const caretInfo = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      return {
        offset: sel.focusOffset,
        text: sel.focusNode?.textContent?.substring(0, sel.focusOffset ?? 0) ?? '',
        caretX: rect.x,
        caretY: rect.y,
      }
    })

    // Also get the overlay text bounding info for comparison
    const overlayInfo = await page.evaluate(() => {
      const overlay = document.querySelector('.hybrid-chatbox__overlay')
      const editable = document.querySelector('.hybrid-chatbox__editable')
      if (!overlay || !editable) return null
      const overlayRect = overlay.getBoundingClientRect()
      const editableRect = editable.getBoundingClientRect()
      const overlayStyle = getComputedStyle(overlay)
      const editableStyle = getComputedStyle(editable)
      return {
        overlayRect: { x: overlayRect.x, y: overlayRect.y, width: overlayRect.width, height: overlayRect.height },
        editableRect: { x: editableRect.x, y: editableRect.y, width: editableRect.width, height: editableRect.height },
        overlayFont: overlayStyle.font,
        editableFont: editableStyle.font,
        overlayPadding: overlayStyle.padding,
        editablePadding: editableStyle.padding,
        overlayLineHeight: overlayStyle.lineHeight,
        editableLineHeight: editableStyle.lineHeight,
      }
    })

    console.log('Caret info after click:', JSON.stringify(caretInfo, null, 2))
    console.log('Layer comparison:', JSON.stringify(overlayInfo, null, 2))
  })

  test('08 - text selection by dragging', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'Select some words in this sentence please')
    await page.waitForTimeout(200)

    const editable = await getEditable(page)
    const box = await editable.boundingBox()
    if (box) {
      // Drag from roughly "words" to "sentence"
      const startX = box.x + box.width * 0.3
      const endX = box.x + box.width * 0.7
      const y = box.y + 20

      await page.mouse.move(startX, y)
      await page.mouse.down()
      await page.mouse.move(endX, y, { steps: 10 })
      await page.waitForTimeout(100)

      // Screenshot with selection visible
      await page.screenshot({ path: ssPath('08-text-selection', project) })

      await page.mouse.up()
    }

    // Get selection info
    const selInfo = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel) return null
      return {
        selectedText: sel.toString(),
        anchorOffset: sel.anchorOffset,
        focusOffset: sel.focusOffset,
      }
    })
    console.log('Selection info:', JSON.stringify(selInfo, null, 2))
  })

  test('09 - keyboard arrow navigation', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'ABCDEFGHIJ')
    await page.waitForTimeout(200)

    // Cursor should be at the end after typing. Screenshot.
    await page.screenshot({ path: ssPath('09a-cursor-at-end', project) })

    // Press Home to go to start
    await page.keyboard.press('Home')
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('09b-cursor-at-home', project) })

    // Press Right 5 times to move to position 5 (between E and F)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('09c-cursor-after-5-arrows', project) })

    // Get caret position for comparison
    const caretAfter5 = await page.evaluate(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return null
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      return {
        offset: sel.focusOffset,
        caretX: rect.x,
        caretY: rect.y,
        textBeforeCaret: sel.focusNode?.textContent?.substring(0, sel.focusOffset ?? 0) ?? '',
      }
    })
    console.log('Caret after 5 arrows:', JSON.stringify(caretAfter5, null, 2))
  })

  test('10 - cursor at line boundaries (multiline)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const editable = await getEditable(page)
    await editable.click()
    await page.keyboard.type('First line here')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Second line here')
    await page.waitForTimeout(200)

    // Cursor at end of second line
    await page.screenshot({ path: ssPath('10a-cursor-end-line2', project) })

    // Go to start of second line
    await page.keyboard.press('Home')
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('10b-cursor-start-line2', project) })

    // Go up to first line
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('10c-cursor-line1', project) })

    // Go to start of first line
    await page.keyboard.press('Home')
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('10d-cursor-start-line1', project) })
  })

  test('11 - wrapping text cursor alignment', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const longText = 'The quick brown fox jumps over the lazy dog and then keeps running far away into the sunset'
    await typeInChatbox(page, longText)
    await page.waitForTimeout(300)

    // Screenshot at end
    await page.screenshot({ path: ssPath('11a-wrap-cursor-end', project) })

    // Go to beginning
    await page.keyboard.press('Home')
    await page.waitForTimeout(100)

    // Move to roughly end of first visual line using End key
    await page.keyboard.press('End')
    await page.waitForTimeout(100)
    await page.screenshot({ path: ssPath('11b-wrap-cursor-end-visual-line', project) })

    // Get detailed position info of both layers
    const layerComparison = await page.evaluate(() => {
      const overlay = document.querySelector('.hybrid-chatbox__overlay')
      const editable = document.querySelector('.hybrid-chatbox__editable')
      if (!overlay || !editable) return null

      // Create a temporary range to measure where overlay text chars are
      const overlayStyle = getComputedStyle(overlay)
      const editableStyle = getComputedStyle(editable)

      return {
        overlayFont: overlayStyle.font,
        editableFont: editableStyle.font,
        overlayWhiteSpace: overlayStyle.whiteSpace,
        editableWhiteSpace: editableStyle.whiteSpace,
        overlayWordBreak: overlayStyle.wordBreak,
        editableWordBreak: editableStyle.wordBreak,
        overlayOverflowWrap: overlayStyle.overflowWrap,
        editableOverflowWrap: editableStyle.overflowWrap,
        overlayWidth: overlay.clientWidth,
        editableWidth: editable.clientWidth,
        overlayScrollHeight: overlay.scrollHeight,
        editableScrollHeight: editable.scrollHeight,
        overlayTextContent: overlay.textContent,
        editableTextContent: editable.textContent,
      }
    })
    console.log('Layer comparison for wrapping text:', JSON.stringify(layerComparison, null, 2))
  })

  test('12 - detailed font and dimension comparison', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'Testing font match between layers with various chars: AaBbWwMm iIlL1 0OoQ')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('12-font-comparison', project) })

    const comparison = await page.evaluate(() => {
      const overlay = document.querySelector('.hybrid-chatbox__overlay') as HTMLElement
      const editable = document.querySelector('.hybrid-chatbox__editable') as HTMLElement
      const container = document.querySelector('.hybrid-chatbox') as HTMLElement
      if (!overlay || !editable || !container) return null

      const oStyle = getComputedStyle(overlay)
      const eStyle = getComputedStyle(editable)
      const cStyle = getComputedStyle(container)

      return {
        container: {
          width: container.clientWidth,
          height: container.clientHeight,
          computedHeight: cStyle.height,
        },
        overlay: {
          font: oStyle.font,
          fontFamily: oStyle.fontFamily,
          fontSize: oStyle.fontSize,
          fontWeight: oStyle.fontWeight,
          lineHeight: oStyle.lineHeight,
          letterSpacing: oStyle.letterSpacing,
          padding: oStyle.padding,
          whiteSpace: oStyle.whiteSpace,
          wordBreak: oStyle.wordBreak,
          overflowWrap: oStyle.overflowWrap,
          width: overlay.clientWidth,
          height: overlay.clientHeight,
          scrollHeight: overlay.scrollHeight,
          offsetTop: overlay.offsetTop,
          offsetLeft: overlay.offsetLeft,
          position: oStyle.position,
          inset: oStyle.inset,
          textContent: overlay.textContent?.substring(0, 80),
        },
        editable: {
          font: eStyle.font,
          fontFamily: eStyle.fontFamily,
          fontSize: eStyle.fontSize,
          fontWeight: eStyle.fontWeight,
          lineHeight: eStyle.lineHeight,
          letterSpacing: eStyle.letterSpacing,
          padding: eStyle.padding,
          whiteSpace: eStyle.whiteSpace,
          wordBreak: eStyle.wordBreak,
          overflowWrap: eStyle.overflowWrap,
          width: editable.clientWidth,
          height: editable.clientHeight,
          scrollHeight: editable.scrollHeight,
          offsetTop: editable.offsetTop,
          offsetLeft: editable.offsetLeft,
          position: eStyle.position,
          inset: eStyle.inset,
          textContent: editable.textContent?.substring(0, 80),
          color: eStyle.color,
          caretColor: eStyle.caretColor,
        },
      }
    })
    console.log('Detailed comparison:', JSON.stringify(comparison, null, 2))
  })

  test('13 - per-character position comparison', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const testText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    await typeInChatbox(page, testText)
    await page.waitForTimeout(200)

    // Measure caret position at every character in the editable
    const positions = await page.evaluate((text) => {
      const editable = document.querySelector('.hybrid-chatbox__editable') as HTMLElement
      if (!editable) return null

      const results: { char: string; index: number; x: number; y: number }[] = []
      const textNode = editable.firstChild
      if (!textNode) return null

      for (let i = 0; i <= text.length; i++) {
        const range = document.createRange()
        range.setStart(textNode, i)
        range.setEnd(textNode, i)
        const rect = range.getBoundingClientRect()
        results.push({
          char: i < text.length ? text[i] : '|END|',
          index: i,
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
        })
      }
      return results
    }, testText)

    console.log('Per-character positions (editable):', JSON.stringify(positions, null, 2))

    // Now check if overlay text node positions would match
    // We can measure by creating a temporary span for each char in the overlay
    const overlayCharPositions = await page.evaluate((text) => {
      const overlay = document.querySelector('.hybrid-chatbox__overlay') as HTMLElement
      if (!overlay) return null

      // Replace overlay content with individual spans for measurement
      const originalContent = overlay.textContent
      overlay.textContent = ''
      const results: { char: string; index: number; x: number; y: number; width: number }[] = []

      // Create a text node and measure each character
      const span = document.createElement('span')
      span.style.cssText = 'font: inherit; line-height: inherit;'
      overlay.appendChild(span)

      for (let i = 0; i < text.length; i++) {
        span.textContent = text.substring(0, i + 1)
        const range = document.createRange()
        range.setStart(span.firstChild!, i)
        range.setEnd(span.firstChild!, i + 1)
        const rect = range.getBoundingClientRect()
        results.push({
          char: text[i],
          index: i,
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        })
      }

      // Restore original content
      overlay.textContent = originalContent
      return results
    }, testText)

    console.log('Per-character positions (overlay):', JSON.stringify(overlayCharPositions, null, 2))

    // Compare: compute drift
    if (positions && overlayCharPositions) {
      const drifts: { index: number; char: string; driftX: number; driftY: number }[] = []
      for (let i = 0; i < Math.min(positions.length - 1, overlayCharPositions.length); i++) {
        const drift = {
          index: i,
          char: positions[i].char,
          driftX: Math.round((positions[i].x - overlayCharPositions[i].x) * 100) / 100,
          driftY: Math.round((positions[i].y - overlayCharPositions[i].y) * 100) / 100,
        }
        drifts.push(drift)
      }
      console.log('Character position drifts (editable - overlay):', JSON.stringify(drifts, null, 2))

      const maxDriftX = Math.max(...drifts.map(d => Math.abs(d.driftX)))
      const maxDriftY = Math.max(...drifts.map(d => Math.abs(d.driftY)))
      console.log(`Max drift: X=${maxDriftX}px, Y=${maxDriftY}px`)
    }

    await page.screenshot({ path: ssPath('13-char-positions', project) })
  })

  test('14 - wrapping line break position comparison', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const wrapText = 'This is text that should wrap to multiple lines in the chatbox area'
    await typeInChatbox(page, wrapText)
    await page.waitForTimeout(300)

    // Get where the editable breaks lines vs where it should
    const lineBreakInfo = await page.evaluate((text) => {
      const editable = document.querySelector('.hybrid-chatbox__editable') as HTMLElement
      const overlay = document.querySelector('.hybrid-chatbox__overlay') as HTMLElement
      if (!editable || !overlay) return null

      // Check if text wraps differently
      const editableLines: string[] = []
      const textNode = editable.firstChild
      if (!textNode) return { error: 'no text node in editable' }

      // Find line breaks by checking Y position changes
      let lastY = -1
      let currentLine = ''
      for (let i = 0; i < text.length; i++) {
        const range = document.createRange()
        range.setStart(textNode, i)
        range.setEnd(textNode, i + 1)
        const rect = range.getBoundingClientRect()
        if (lastY >= 0 && Math.abs(rect.y - lastY) > 5) {
          editableLines.push(currentLine)
          currentLine = ''
        }
        currentLine += text[i]
        lastY = rect.y
      }
      if (currentLine) editableLines.push(currentLine)

      return {
        editableLines,
        editableScrollHeight: editable.scrollHeight,
        overlayScrollHeight: overlay.scrollHeight,
        editableClientHeight: editable.clientHeight,
        overlayClientHeight: overlay.clientHeight,
      }
    }, wrapText)

    console.log('Line break analysis:', JSON.stringify(lineBreakInfo, null, 2))
    await page.screenshot({ path: ssPath('14-line-breaks', project) })
  })

  test('15 - send message and verify', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    await typeInChatbox(page, 'Hello from Playwright test!')
    await page.waitForTimeout(200)
    await page.screenshot({ path: ssPath('15a-before-send', project) })

    // Press Enter to send
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await page.screenshot({ path: ssPath('15b-after-send', project) })

    // Verify message appears in the message list
    const messageText = await page.locator('.message__text').first().innerText()
    expect(messageText).toBe('Hello from Playwright test!')

    // Verify chatbox is cleared (overlay shows placeholder when empty)
    const overlay = await getOverlay(page)
    const overlayText = await overlay.innerText()
    // After sending, overlay shows placeholder "Type a message..." which is expected
    expect(overlayText.trim()).toMatch(/^(Type a message\.\.\.|)$/)
  })
})

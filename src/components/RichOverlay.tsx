import type { Document, CursorPosition, Selection, PositionMap } from '../types/document.js'
import { positionToVisual, toVisualText } from '../core/position-map.js'
import { MentionPill } from './MentionPill.js'
import { prepare, layout } from '@chenglou/pretext'

const FONT = '16px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
const LINE_HEIGHT = 24

type Props = {
  doc: Document
  posMap: PositionMap
  selection: Selection
  containerWidth: number
  focused: boolean
}

export function RichOverlay({ doc, posMap, selection, containerWidth, focused }: Props) {
  // Render segments as a sequence of text spans and mention pills
  const segments = doc.segments.map((seg, i) => {
    switch (seg.kind) {
      case 'text':
        return <span key={i} data-seg={i}>{seg.content}</span>
      case 'mention':
        return <MentionPill key={i} mentionType={seg.mentionType} />
    }
  })

  // Compute cursor pixel position using pretext for text measurement
  const cursorStyle = computeCursorStyle(doc, posMap, selection, containerWidth)

  return (
    <div className="rich-overlay" aria-hidden>
      <div className="rich-overlay__text">
        {segments}
      </div>
      {focused && (
        <div className="rich-overlay__cursor" style={cursorStyle} />
      )}
    </div>
  )
}

// ─── Cursor Position Computation ─────────────────────────────────────────────
// Uses pretext to compute the pixel coordinates of the cursor.

function computeCursorStyle(
  doc: Document,
  posMap: PositionMap,
  selection: Selection,
  containerWidth: number,
): React.CSSProperties {
  const visualOffset = positionToVisual(posMap, selection.focus)
  const visualText = toVisualText(doc)
  const textWidth = containerWidth - 32  // 16px padding each side

  if (textWidth <= 0 || visualText.length === 0) {
    return { left: 16, top: 12 }
  }

  // Get text before the cursor
  const textBefore = visualText.slice(0, visualOffset)

  if (textBefore.length === 0) {
    return { left: 16, top: 12 }
  }

  // Use pretext to measure the text up to the cursor
  const prepared = prepare(textBefore, FONT, { whiteSpace: 'pre-wrap' })
  const result = layout(prepared, textWidth, LINE_HEIGHT)

  // Measure the last line's width to get the X position
  // We need to measure the full text and the text-before to find cursor X
  const fullPrepared = prepare(visualText, FONT, { whiteSpace: 'pre-wrap' })
  const fullResult = layout(fullPrepared, textWidth, LINE_HEIGHT)

  // The cursor is on line (result.lineCount) at some X offset
  // For the X offset, measure the last line of textBefore
  const lastNewline = textBefore.lastIndexOf('\n')
  const lastLine = lastNewline >= 0 ? textBefore.slice(lastNewline + 1) : textBefore

  let cursorX = 16  // padding
  if (lastLine.length > 0) {
    const lastLinePrepared = prepare(lastLine, FONT)
    const lastLineLayout = layout(lastLinePrepared, textWidth, LINE_HEIGHT)
    // If it doesn't wrap, the width is straightforward
    if (lastLineLayout.lineCount === 1) {
      // Measure width using a wide container
      const wideLayout = layout(lastLinePrepared, 100000, LINE_HEIGHT)
      cursorX = 16 + (wideLayout.height / LINE_HEIGHT > 0 ? measureTextWidth(lastLine) : 0)
    } else {
      // The text before cursor wraps — cursor is at start of last visual line
      // This is an approximation; proper implementation would use layoutWithLines
      cursorX = 16
    }
  }

  const cursorY = 12 + (result.lineCount - 1) * LINE_HEIGHT

  return {
    left: cursorX,
    top: cursorY,
  }
}

// Simple text width measurement using canvas
let measureCanvas: CanvasRenderingContext2D | null = null

function measureTextWidth(text: string): number {
  if (!measureCanvas) {
    const canvas = document.createElement('canvas')
    measureCanvas = canvas.getContext('2d')!
    measureCanvas.font = FONT
  }
  return measureCanvas.measureText(text).width
}

// ─── Compute Height ──────────────────────────────────────────────────────────
// Exported for use by the chatbox container.

export function computeRichHeight(
  visualText: string,
  containerWidth: number,
  maxLines: number = 10,
): number {
  const textWidth = containerWidth - 32
  if (!visualText || textWidth <= 0) return LINE_HEIGHT + 24
  const prepared = prepare(visualText, FONT, { whiteSpace: 'pre-wrap' })
  const result = layout(prepared, textWidth, LINE_HEIGHT)
  const clampedLines = Math.min(result.lineCount, maxLines)
  return clampedLines * LINE_HEIGHT + 24
}

import type {
  Document, PositionMap, SegmentMapping, CursorPosition,
} from '../types/document.js'
import { mentionDisplayText, textPosition, atomicBoundary } from '../types/document.js'

// ─── Build Position Map ──────────────────────────────────────────────────────
// Fold over segments to build the mapping table.
// This is essentially foldMap with a monoidal accumulator.

export function buildPositionMap(doc: Document): PositionMap {
  let sourcePos = 0
  let visualPos = 0
  const mappings: SegmentMapping[] = []

  for (let i = 0; i < doc.segments.length; i++) {
    const seg = doc.segments[i]
    switch (seg.kind) {
      case 'text': {
        const sourceLen = seg.content.length
        const visualLen = seg.content.length
        mappings.push({
          segmentIndex: i,
          sourceStart: sourcePos,
          sourceEnd: sourcePos + sourceLen,
          visualStart: visualPos,
          visualEnd: visualPos + visualLen,
          isAtomic: false,
        })
        sourcePos += sourceLen
        visualPos += visualLen
        break
      }
      case 'mention': {
        const sourceLen = seg.sourceText.length
        const displayText = mentionDisplayText(seg.mentionType)
        const visualLen = displayText.length
        mappings.push({
          segmentIndex: i,
          sourceStart: sourcePos,
          sourceEnd: sourcePos + sourceLen,
          visualStart: visualPos,
          visualEnd: visualPos + visualLen,
          isAtomic: true,
        })
        sourcePos += sourceLen
        visualPos += visualLen
        break
      }
    }
  }

  return {
    mappings,
    totalSourceLength: sourcePos,
    totalVisualLength: visualPos,
  }
}

// ─── Source Offset → CursorPosition ──────────────────────────────────────────
// Given a raw source offset, find the valid cursor position.
// If the offset falls inside an atomic, snap to the nearest boundary.

export function sourceToPosition(map: PositionMap, sourceOffset: number): CursorPosition {
  const clamped = Math.max(0, Math.min(sourceOffset, map.totalSourceLength))

  for (const m of map.mappings) {
    if (clamped < m.sourceStart) continue

    if (clamped <= m.sourceEnd) {
      if (m.isAtomic) {
        // Inside an atomic: snap to nearest boundary
        const distToStart = clamped - m.sourceStart
        const distToEnd = m.sourceEnd - clamped
        return atomicBoundary(m.segmentIndex, distToStart <= distToEnd ? 'before' : 'after')
      }
      // Inside a text segment
      return textPosition(m.segmentIndex, clamped - m.sourceStart)
    }
  }

  // Past all segments: position at end of last segment
  const last = map.mappings[map.mappings.length - 1]
  if (!last) return textPosition(0, 0)
  if (last.isAtomic) return atomicBoundary(last.segmentIndex, 'after')
  return textPosition(last.segmentIndex, last.sourceEnd - last.sourceStart)
}

// ─── CursorPosition → Source Offset ──────────────────────────────────────────

export function positionToSource(map: PositionMap, pos: CursorPosition): number {
  const m = map.mappings[pos.segmentIndex]
  if (!m) return 0

  switch (pos.kind) {
    case 'text':
      return m.sourceStart + pos.offset
    case 'atomicBoundary':
      return pos.side === 'before' ? m.sourceStart : m.sourceEnd
  }
}

// ─── CursorPosition → Visual Offset ─────────────────────────────────────────

export function positionToVisual(map: PositionMap, pos: CursorPosition): number {
  const m = map.mappings[pos.segmentIndex]
  if (!m) return 0

  switch (pos.kind) {
    case 'text':
      return m.visualStart + pos.offset
    case 'atomicBoundary':
      return pos.side === 'before' ? m.visualStart : m.visualEnd
  }
}

// ─── Visual Offset → CursorPosition ─────────────────────────────────────────
// For click-to-position: given a visual character offset, find the CursorPosition.

export function visualToPosition(map: PositionMap, visualOffset: number): CursorPosition {
  const clamped = Math.max(0, Math.min(visualOffset, map.totalVisualLength))

  for (const m of map.mappings) {
    if (clamped < m.visualStart) continue

    if (clamped <= m.visualEnd) {
      if (m.isAtomic) {
        const distToStart = clamped - m.visualStart
        const distToEnd = m.visualEnd - clamped
        return atomicBoundary(m.segmentIndex, distToStart <= distToEnd ? 'before' : 'after')
      }
      return textPosition(m.segmentIndex, clamped - m.visualStart)
    }
  }

  const last = map.mappings[map.mappings.length - 1]
  if (!last) return textPosition(0, 0)
  if (last.isAtomic) return atomicBoundary(last.segmentIndex, 'after')
  return textPosition(last.segmentIndex, last.visualEnd - last.visualStart)
}

// ─── Visual Text ─────────────────────────────────────────────────────────────
// Build the visual string for rendering (mentions replaced with display text).

export function toVisualText(doc: Document): string {
  return doc.segments.reduce((acc, seg) => {
    switch (seg.kind) {
      case 'text': return acc + seg.content
      case 'mention': return acc + mentionDisplayText(seg.mentionType)
    }
  }, '')
}

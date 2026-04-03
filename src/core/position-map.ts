import type {
  Document, PositionMap, SegmentMapping, CursorPosition,
  SourceOffset, VisualOffset,
} from '../types/document.js'
import {
  mentionDisplayText, textPosition, atomicBoundary,
  sourceOffset, visualOffset,
} from '../types/document.js'

// ─── Build Position Map ──────────────────────────────────────────────────────
// Fold over segments to build the mapping table.

export function buildPositionMap(doc: Document): PositionMap {
  let srcPos = 0
  let visPos = 0
  const mappings: SegmentMapping[] = []

  for (let i = 0; i < doc.segments.length; i++) {
    const seg = doc.segments[i]
    switch (seg.kind) {
      case 'text': {
        const sourceLen = seg.content.length
        const visualLen = seg.content.length
        mappings.push({
          segmentIndex: i,
          sourceStart: sourceOffset(srcPos),
          sourceEnd: sourceOffset(srcPos + sourceLen),
          visualStart: visualOffset(visPos),
          visualEnd: visualOffset(visPos + visualLen),
          isAtomic: false,
        })
        srcPos += sourceLen
        visPos += visualLen
        break
      }
      case 'mention': {
        const sourceLen = seg.sourceText.length
        const displayText = mentionDisplayText(seg.mentionType)
        const visualLen = displayText.length
        mappings.push({
          segmentIndex: i,
          sourceStart: sourceOffset(srcPos),
          sourceEnd: sourceOffset(srcPos + sourceLen),
          visualStart: visualOffset(visPos),
          visualEnd: visualOffset(visPos + visualLen),
          isAtomic: true,
        })
        srcPos += sourceLen
        visPos += visualLen
        break
      }
    }
  }

  return {
    mappings,
    totalSourceLength: sourceOffset(srcPos),
    totalVisualLength: visualOffset(visPos),
  }
}

// ─── Source Offset → CursorPosition ──────────────────────────────────────────
// Given a raw source offset, find the valid cursor position.
// If the offset falls inside an atomic, snap to the nearest boundary.

export function sourceToPosition(map: PositionMap, offset: SourceOffset): CursorPosition {
  const clamped = Math.max(0, Math.min(offset, map.totalSourceLength))

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

export function positionToSource(map: PositionMap, pos: CursorPosition): SourceOffset {
  const m = map.mappings[pos.segmentIndex]
  if (!m) return sourceOffset(0)

  switch (pos.kind) {
    case 'text':
      return sourceOffset(m.sourceStart + pos.offset)
    case 'atomicBoundary':
      return pos.side === 'before' ? m.sourceStart : m.sourceEnd
  }
}

// ─── CursorPosition → Visual Offset ─────────────────────────────────────────

export function positionToVisual(map: PositionMap, pos: CursorPosition): VisualOffset {
  const m = map.mappings[pos.segmentIndex]
  if (!m) return visualOffset(0)

  switch (pos.kind) {
    case 'text':
      return visualOffset(m.visualStart + pos.offset)
    case 'atomicBoundary':
      return pos.side === 'before' ? m.visualStart : m.visualEnd
  }
}

// ─── Visual Offset → CursorPosition ─────────────────────────────────────────
// For click-to-position: given a visual character offset, find the CursorPosition.

export function visualToPosition(map: PositionMap, offset: VisualOffset): CursorPosition {
  const clamped = Math.max(0, Math.min(offset, map.totalVisualLength))

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

// ─── Convenience: Direct offset conversions ─────────────────────────────────
// Compose sourceToPosition/positionToVisual (and vice versa) for cases where
// you need to convert between coordinate systems in one step.

export function sourceToVisual(map: PositionMap, offset: SourceOffset): VisualOffset {
  return positionToVisual(map, sourceToPosition(map, offset))
}

export function visualToSource(map: PositionMap, offset: VisualOffset): SourceOffset {
  return positionToSource(map, visualToPosition(map, offset))
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

// ─── Find segment at source offset ──────────────────────────────────────────
// Returns the mapping that contains the given source offset, if any.

export function findMappingAtSource(map: PositionMap, offset: SourceOffset): SegmentMapping | undefined {
  return map.mappings.find(m =>
    offset >= m.sourceStart && offset < m.sourceEnd
  )
}

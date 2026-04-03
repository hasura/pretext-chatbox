import type { Document, CursorPosition, Selection } from '../types/document.js'
import { textPosition, atomicBoundary, collapsedSelection, positionsEqual } from '../types/document.js'

// ─── Move Direction ──────────────────────────────────────────────────────────

export type MoveDirection = 'left' | 'right'

// ─── Move Position ───────────────────────────────────────────────────────────
// The heart of atomic skip logic. Pattern-match on segment kind to determine
// the next valid position. Exhaustive matching ensures no cases are missed.

export function movePosition(
  doc: Document,
  pos: CursorPosition,
  direction: MoveDirection,
): CursorPosition {
  switch (direction) {
    case 'right': return moveRight(doc, pos)
    case 'left': return moveLeft(doc, pos)
  }
}

function moveRight(doc: Document, pos: CursorPosition): CursorPosition {
  switch (pos.kind) {
    case 'text': {
      const seg = doc.segments[pos.segmentIndex]
      if (seg?.kind !== 'text') return pos  // defensive; type system prevents this path

      if (pos.offset < seg.content.length) {
        // Move within current text segment
        return textPosition(pos.segmentIndex, pos.offset + 1)
      }
      // At end of text segment → enter next segment
      return enterSegmentFromLeft(doc, pos.segmentIndex + 1, pos)
    }

    case 'atomicBoundary': {
      if (pos.side === 'before') {
        // Skip over the atomic entirely
        return atomicBoundary(pos.segmentIndex, 'after')
      }
      // After atomic → enter next segment
      return enterSegmentFromLeft(doc, pos.segmentIndex + 1, pos)
    }
  }
}

function moveLeft(doc: Document, pos: CursorPosition): CursorPosition {
  switch (pos.kind) {
    case 'text': {
      if (pos.offset > 0) {
        return textPosition(pos.segmentIndex, pos.offset - 1)
      }
      // At start of text segment → enter previous segment
      return enterSegmentFromRight(doc, pos.segmentIndex - 1, pos)
    }

    case 'atomicBoundary': {
      if (pos.side === 'after') {
        // Skip over the atomic entirely
        return atomicBoundary(pos.segmentIndex, 'before')
      }
      // Before atomic → enter previous segment
      return enterSegmentFromRight(doc, pos.segmentIndex - 1, pos)
    }
  }
}

// ─── Segment Entry Helpers ───────────────────────────────────────────────────
// When crossing a segment boundary, pattern-match on the new segment's kind
// to determine the initial cursor position.

function enterSegmentFromLeft(
  doc: Document,
  segIndex: number,
  fallback: CursorPosition,
): CursorPosition {
  if (segIndex >= doc.segments.length) return fallback  // end of document

  const seg = doc.segments[segIndex]
  switch (seg.kind) {
    case 'text':
      // Enter at offset 0, then immediately advance to offset 1
      // (moving right means we've consumed one position)
      return seg.content.length > 0
        ? textPosition(segIndex, 1)
        : enterSegmentFromLeft(doc, segIndex + 1, fallback)
    case 'mention':
      return atomicBoundary(segIndex, 'before')
  }
}

function enterSegmentFromRight(
  doc: Document,
  segIndex: number,
  fallback: CursorPosition,
): CursorPosition {
  if (segIndex < 0) return fallback  // start of document

  const seg = doc.segments[segIndex]
  switch (seg.kind) {
    case 'text':
      return seg.content.length > 0
        ? textPosition(segIndex, seg.content.length - 1)
        : enterSegmentFromRight(doc, segIndex - 1, fallback)
    case 'mention':
      return atomicBoundary(segIndex, 'after')
  }
}

// ─── Document Start / End ────────────────────────────────────────────────────

export function documentStart(doc: Document): CursorPosition {
  if (doc.segments.length === 0) return textPosition(0, 0)

  const first = doc.segments[0]
  switch (first.kind) {
    case 'text': return textPosition(0, 0)
    case 'mention': return atomicBoundary(0, 'before')
  }
}

export function documentEnd(doc: Document): CursorPosition {
  if (doc.segments.length === 0) return textPosition(0, 0)

  const lastIdx = doc.segments.length - 1
  const last = doc.segments[lastIdx]
  switch (last.kind) {
    case 'text': return textPosition(lastIdx, last.content.length)
    case 'mention': return atomicBoundary(lastIdx, 'after')
  }
}

// ─── Selection Helpers ───────────────────────────────────────────────────────

export function moveCursor(
  doc: Document,
  sel: Selection,
  direction: MoveDirection,
  extend: boolean,
): Selection {
  if (!extend && !positionsEqual(sel.anchor, sel.focus)) {
    // Collapse selection to the appropriate end
    const pos = direction === 'left'
      ? minPosition(doc, sel.anchor, sel.focus)
      : maxPosition(doc, sel.anchor, sel.focus)
    return collapsedSelection(pos)
  }

  const newFocus = movePosition(doc, sel.focus, direction)
  return extend
    ? { anchor: sel.anchor, focus: newFocus }
    : collapsedSelection(newFocus)
}

// ─── Position Ordering ───────────────────────────────────────────────────────
// Compare two positions by their visual offset.

function positionOrd(doc: Document, pos: CursorPosition): number {
  // Use segment index + fractional offset for ordering
  switch (pos.kind) {
    case 'text':
      return pos.segmentIndex + pos.offset / (getTextLength(doc, pos.segmentIndex) + 1)
    case 'atomicBoundary':
      return pos.segmentIndex + (pos.side === 'before' ? 0 : 0.999)
  }
}

function getTextLength(doc: Document, segIndex: number): number {
  const seg = doc.segments[segIndex]
  return seg?.kind === 'text' ? seg.content.length : 0
}

function minPosition(doc: Document, a: CursorPosition, b: CursorPosition): CursorPosition {
  return positionOrd(doc, a) <= positionOrd(doc, b) ? a : b
}

function maxPosition(doc: Document, a: CursorPosition, b: CursorPosition): CursorPosition {
  return positionOrd(doc, a) >= positionOrd(doc, b) ? a : b
}

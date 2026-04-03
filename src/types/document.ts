// ─── Mention Types ───────────────────────────────────────────────────────────
// Tagged union: every mention variant is exhaustively matchable.

export type UserMention = { readonly kind: 'user'; readonly id: string }
export type PromptQLMention = { readonly kind: 'promptql' }
export type MentionType = UserMention | PromptQLMention

// ─── Document Segments ───────────────────────────────────────────────────────
// A parsed document is a sequence of segments.
// Text segments hold displayable characters.
// Mention segments are atomic — the cursor cannot enter them.

export type TextSegment = {
  readonly kind: 'text'
  readonly content: string
}

export type MentionSegment = {
  readonly kind: 'mention'
  readonly mentionType: MentionType
  readonly sourceText: string  // the raw XML tag, for serialization back
}

export type Segment = TextSegment | MentionSegment

// ─── Document ────────────────────────────────────────────────────────────────

export type Document = {
  readonly segments: readonly Segment[]
  readonly source: string
}

// ─── Cursor Position ─────────────────────────────────────────────────────────
// The core invariant: a cursor can ONLY be at a valid position.
// "Inside a mention" is not a valid position — the type doesn't allow it.
//
// TextPosition: within a text segment, offset is in graphemes (0 = before first char).
// AtomicBoundary: at the edge of a mention, either before or after.

export type TextPosition = {
  readonly kind: 'text'
  readonly segmentIndex: number
  readonly offset: number  // grapheme offset within the text segment
}

export type AtomicBoundary = {
  readonly kind: 'atomicBoundary'
  readonly segmentIndex: number
  readonly side: 'before' | 'after'
}

export type CursorPosition = TextPosition | AtomicBoundary

// ─── Selection ───────────────────────────────────────────────────────────────

export type Selection = {
  readonly anchor: CursorPosition
  readonly focus: CursorPosition
}

// Collapsed selection (cursor with no range)
export function isCollapsed(sel: Selection): boolean {
  return positionsEqual(sel.anchor, sel.focus)
}

export function positionsEqual(a: CursorPosition, b: CursorPosition): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'text' && b.kind === 'text') {
    return a.segmentIndex === b.segmentIndex && a.offset === b.offset
  }
  if (a.kind === 'atomicBoundary' && b.kind === 'atomicBoundary') {
    return a.segmentIndex === b.segmentIndex && a.side === b.side
  }
  return false
}

// ─── Position Map ────────────────────────────────────────────────────────────
// Maps between source offsets, visual offsets, and CursorPositions.
// Built once per parse, cached until the document changes.

export type SegmentMapping = {
  readonly segmentIndex: number
  readonly sourceStart: number
  readonly sourceEnd: number    // exclusive
  readonly visualStart: number
  readonly visualEnd: number    // exclusive
  readonly isAtomic: boolean
}

export type PositionMap = {
  readonly mappings: readonly SegmentMapping[]
  readonly totalSourceLength: number
  readonly totalVisualLength: number
}

// ─── Display ─────────────────────────────────────────────────────────────────

export function mentionDisplayText(m: MentionType): string {
  switch (m.kind) {
    case 'user': return `@${m.id}`  // placeholder; real app would resolve to name
    case 'promptql': return '@PromptQL'
  }
}

// ─── Smart Constructors ──────────────────────────────────────────────────────
// These are the ONLY way to create positions — they enforce invariants at
// construction time so downstream code can trust the types.

export function textPosition(segmentIndex: number, offset: number): TextPosition {
  return { kind: 'text', segmentIndex, offset }
}

export function atomicBoundary(segmentIndex: number, side: 'before' | 'after'): AtomicBoundary {
  return { kind: 'atomicBoundary', segmentIndex, side }
}

export function collapsedSelection(pos: CursorPosition): Selection {
  return { anchor: pos, focus: pos }
}

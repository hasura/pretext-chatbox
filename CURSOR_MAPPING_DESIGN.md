# Cursor Mapping Design: Type-Driven Architecture

## Philosophy

Illegal states should be unrepresentable. The type system encodes the invariants;
pattern matching replaces runtime checks; algebraic structures compose cleanly.

## The Core Problem

Raw source text contains XML-like mention tags:
```
Hey <user_mention id="abc123" /> can you check this?
```

This renders visually as:
```
Hey [@Maya Chen] can you check this?
```

The cursor must never land **inside** a mention. When navigating with arrows,
it must skip from `before` to `after` a mention atomically.

Two coordinate systems coexist:
- **Source offsets** — byte positions in the raw string
- **Visual positions** — what the user sees (mentions are single atomic units)

## Key Insight: Two Separate Position Types

```
Source: "Hey <user_mention id="abc123" /> can you"
         ^^^                              ^^^^^^^
         0-2     3....................31   32-39

Visual: "Hey [@Maya Chen] can you"
         ^^^ ^^^^^^^^^^^^  ^^^^^^^
         0-2    atom[0]     3-10
```

A source offset of 15 (inside the tag) has NO valid visual position.
Rather than mapping it to something and doing runtime checks,
we make it impossible to construct.

## Type Definitions

### Document Model

```typescript
// A parsed document is an array of segments — the sum type
type Segment
  = { readonly kind: 'text'; readonly content: string }
  | { readonly kind: 'mention'; readonly mentionType: MentionType; readonly sourceLength: number }

type MentionType
  = { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'promptql' }

// The parsed document: segments + source text for reconstruction
type Document = {
  readonly segments: readonly Segment[]
  readonly source: string
}
```

### Position Types (Illegal States Unrepresentable)

```typescript
// A cursor can ONLY be:
// 1. Inside a text segment at a specific grapheme offset
// 2. At the boundary of an atomic (before or after)
//
// It CANNOT be "inside" a mention — that variant doesn't exist.

type CursorPosition
  = { readonly kind: 'text'; readonly segmentIndex: number; readonly offset: number }
  | { readonly kind: 'atomicBoundary'; readonly segmentIndex: number; readonly side: 'before' | 'after' }

// A selection is two cursors with a direction
type Selection = {
  readonly anchor: CursorPosition
  readonly focus: CursorPosition
}
```

### Position Map (The Rosetta Stone)

The position map converts between source offsets and visual positions.
It's built once per document parse and cached.

```typescript
type SegmentMapping = {
  readonly sourceStart: number   // byte offset in source
  readonly sourceEnd: number     // exclusive
  readonly visualStart: number   // visual character offset
  readonly visualEnd: number     // exclusive
  readonly segmentIndex: number
  readonly isAtomic: boolean
}

type PositionMap = {
  readonly mappings: readonly SegmentMapping[]
  readonly totalSourceLength: number
  readonly totalVisualLength: number
}
```

### Key Operations

```typescript
// Source offset → CursorPosition (snaps to nearest valid position)
sourceToPosition(map: PositionMap, doc: Document, sourceOffset: number): CursorPosition

// CursorPosition → source offset
positionToSource(map: PositionMap, pos: CursorPosition): number

// CursorPosition → visual offset (for pretext rendering)
positionToVisual(map: PositionMap, pos: CursorPosition): number

// Arrow key navigation: given current position, compute next position
// This is where atomic skipping happens — encoded in the return type
movePosition(doc: Document, pos: CursorPosition, direction: 'left' | 'right'): CursorPosition

// Build visual text for pretext rendering
toVisualText(doc: Document): string
```

## Atomic Skip Logic

When the cursor is at `{ kind: 'atomicBoundary', segmentIndex: 3, side: 'after' }`
and the user presses Right:
1. Look at segment 4
2. If it's text → `{ kind: 'text', segmentIndex: 4, offset: 1 }`
3. If it's atomic → `{ kind: 'atomicBoundary', segmentIndex: 4, side: 'after' }`
4. If no segment 4 → stay (end of document)

The exhaustive pattern match on `Segment['kind']` guarantees we handle all cases.

## Why Not a Single `number` Offset?

A single number can represent any position, including ones inside an atomic.
The discriminated union makes it **structurally impossible** to represent
"cursor is at byte 15 inside a mention tag". You'd have to go out of your way
to break it. Compare:

```typescript
// BAD: any number is valid, including inside atomics
function moveCursor(offset: number, dir: 'left' | 'right'): number

// GOOD: only valid positions exist
function moveCursor(pos: CursorPosition, dir: 'left' | 'right'): CursorPosition
```

## Rendering Architecture

```
┌─────────────────────────────────────────┐
│  Custom cursor (div, CSS blink)         │ ← z-index: 3
├─────────────────────────────────────────┤
│  Hidden textarea (captures input)       │ ← z-index: 2, opacity: 0
├─────────────────────────────────────────┤
│  Rich overlay (pretext + mention pills) │ ← z-index: 1
│  ┌──────┐ ┌──────────┐ ┌─────┐         │
│  │ text │ │ @mention │ │text │         │
│  └──────┘ └──────────┘ └─────┘         │
└─────────────────────────────────────────┘
```

With the custom cursor, we no longer rely on the contenteditable's native caret.
The hidden textarea is purely an input capture surface.

## Folds and Composition

The document model is a foldable structure:

```typescript
// Fold over segments to build the visual text
const visualText = doc.segments.reduce((acc, seg) => {
  switch (seg.kind) {
    case 'text': return acc + seg.content
    case 'mention': return acc + mentionDisplayText(seg.mentionType)
  }
}, '')

// Fold to build the position map
const mappings = doc.segments.reduce<{ mappings: SegmentMapping[], sourcePos: number, visualPos: number }>(
  (acc, seg, i) => { /* ... */ },
  { mappings: [], sourcePos: 0, visualPos: 0 }
).mappings
```

This is essentially `foldMap` — each segment maps to a monoidal value
(a mapping entry) and we concatenate them.

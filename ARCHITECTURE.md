# Architecture: Type-Driven Cursor Mapping

## Problem

A rich text editor with `@mention` pills has **two coordinate systems**:

| System | Example | Position of "how" |
|--------|---------|-------------------|
| **Source** | `Hello <user_mention id="123" /> how` | offset 33 |
| **Visual** | `Hello @John how` | offset 12 |

Mixing these offsets is the root cause of four bugs:
1. Setting `textarea.setSelectionRange(visualOffset)` on a textarea containing source text
2. Reading `textarea.selectionStart` (a source offset) and treating it as visual
3. The native caret rendering at one position while the custom cursor renders at another
4. No type-level protection against mixing the two

## Solution: Branded Types

```typescript
type SourceOffset = number & { __brand: 'SourceOffset' }
type VisualOffset = number & { __brand: 'VisualOffset' }
```

These are runtime-identical to `number` (zero overhead) but TypeScript treats them as
**incompatible types**. Passing a `VisualOffset` where a `SourceOffset` is expected is
a compile error.

### Smart Constructors

The only way to create offsets:
```typescript
sourceOffset(42)  // → SourceOffset
visualOffset(12)  // → VisualOffset
```

### Conversion Functions

The only way to go between coordinate systems:
```typescript
sourceToVisual(map, srcOffset)   // SourceOffset → VisualOffset
visualToSource(map, visOffset)   // VisualOffset → SourceOffset
```

Both compose through the `CursorPosition` type, which snaps positions inside
atomic mentions to their boundaries.

## Core Invariant: Illegal States Unrepresentable

A cursor position is a discriminated union:

```typescript
type CursorPosition =
  | { kind: 'text'; segmentIndex: number; offset: number }
  | { kind: 'atomicBoundary'; segmentIndex: number; side: 'before' | 'after' }
```

There is **no variant** for "inside a mention". You cannot construct one.
The parser and position-map functions are the only producers of these values,
and they enforce the invariant.

## Data Flow

```
                  ┌──────────────┐
                  │  source text │  (single source of truth)
                  └──────┬───────┘
                         │ parseDocument()
                         ▼
                  ┌──────────────┐
                  │   Document   │  (segments: text | mention)
                  └──────┬───────┘
                         │ buildPositionMap()
                         ▼
                  ┌──────────────┐
                  │ PositionMap  │  (SourceOffset ↔ VisualOffset mapping table)
                  └──────┬───────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     sourceToPosition  positionToSource  positionToVisual
     visualToPosition  sourceToVisual    visualToSource
```

## Event Handling

### User types
1. `textarea.onInput` fires
2. Read `textarea.value` (new source) and `textarea.selectionStart` (SourceOffset)
3. Re-parse → new Document, PositionMap
4. Convert `selectionStart` → `CursorPosition` via `sourceToPosition` (snaps if inside mention)
5. Update React state

### User clicks
1. Click lands on textarea (z-index 2, transparent text)
2. `textarea.onSelect` fires with `selectionStart` as a SourceOffset
3. `sourceToPosition` snaps to valid position (atomic boundary if inside mention)
4. Snapped SourceOffset synced back to textarea if different
5. React `selection` state updated

### Arrow keys (with mentions)
1. `onKeyDown` intercepts, prevents default
2. `moveCursor()` computes new position with atomic skip
3. `positionToSource()` converts to SourceOffset
4. `textarea.setSelectionRange(sourceOffset)` — correct coordinate system!
5. React `selection` state updated

### Arrow keys (no mentions)
1. Native textarea behavior handles the move
2. `onSelect` fires → syncs React state from textarea

## Single Cursor Strategy

- Native textarea caret: **hidden** (`caret-color: transparent`)
- Custom cursor: **visible** (`.rich-overlay__cursor`, positioned via pretext measurement)

The custom cursor reads from React `selection` state, converts to `VisualOffset`,
and uses pretext to compute pixel coordinates. This ensures the visible cursor
always matches the logical position.

## File Map

| File | Responsibility |
|------|---------------|
| `src/types/document.ts` | Branded types, CursorPosition union, smart constructors |
| `src/core/parser.ts` | `string → Document` (pure) |
| `src/core/position-map.ts` | Offset conversions, all branded-type-safe |
| `src/core/cursor.ts` | Arrow navigation with atomic skip |
| `src/HybridChatbox.tsx` | State management, event handling, textarea sync |
| `src/components/RichOverlay.tsx` | Visual rendering, custom cursor positioning |

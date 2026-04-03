# Hybrid Chatbox MVP Plan

## Concept

A high-performance chatbox that separates **input capture** from **text rendering**:

- **Hidden contenteditable layer** handles all native browser input: IME composition, autocorrect, spell-check, clipboard, selection, undo/redo
- **Visible pretext-powered overlay** renders the text using `@chenglou/pretext` for precise measurement and layout

## Architecture (MVP)

```
┌─────────────────────────────────────┐
│  Visible pretext overlay            │  ← pointer-events: none
│  (absolutely positioned spans)      │     renders text with pretext layout
├─────────────────────────────────────┤
│  Transparent contenteditable        │  ← receives all input
│  (color: transparent, caret visible)│     native cursor + selection
└─────────────────────────────────────┘
```

The key trick for MVP simplicity: the contenteditable sits on top with `color: transparent` so its native caret and selection remain visible and functional, but the actual text glyphs are invisible. The pretext overlay renders the same text visually underneath (using `z-index` layering with `pointer-events: none`).

This means:
- **Zero cursor mapping needed** -- the browser's native caret position is correct because the contenteditable has identical dimensions and font settings
- **All native input works for free** -- IME, autocorrect, drag-select, Cmd+A, undo, etc.
- **pretext handles measurement** -- we use it to compute accurate height for auto-growing the textarea

## MVP Scope

### Include
- Single `<HybridChatbox />` React component
- Transparent contenteditable over pretext-rendered text
- Auto-growing height using pretext's `layout()` for measurement
- Basic styling (rounded border, padding, focus ring)
- Send on Enter (Shift+Enter for newline)
- Simple demo page with the chatbox and a message list
- `pre-wrap` whitespace mode (preserves user whitespace/newlines)

### Exclude (keep simple)
- Rich text / markdown rendering (plain text only for MVP)
- Custom cursor rendering or cursor mapping
- Syntax highlighting or inline decorations
- Mobile-specific handling
- Accessibility beyond native contenteditable defaults
- Virtual scrolling for very long messages
- Any backend / API integration

## Component Structure

```
src/
  App.tsx              -- Demo page with message list + chatbox
  HybridChatbox.tsx    -- The hybrid chatbox component
  main.tsx             -- Vite entry point
  index.css            -- Global styles
```

## How It Works

1. User types in the contenteditable (transparent text, visible caret)
2. On every `input` event, we sync the text content to React state
3. pretext `prepare()` + `layout()` computes the height for the current text
4. pretext `prepareWithSegments()` + `layoutWithLines()` renders lines as positioned `<div>` elements
5. The container auto-grows to match the computed height
6. On Enter (without Shift), we dispatch the message and clear

## Dev Setup

- Vite + React + TypeScript
- `@chenglou/pretext` for text measurement
- Dev server on port **19847** (arcane port to avoid conflicts)
- No additional UI libraries -- plain CSS

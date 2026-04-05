# Simple Contenteditable Chatbox

## Approach

This component uses a plain `<div contenteditable="true">` for text input, with mention highlighting applied by re-scanning and re-wrapping content on every input event.

### Why this works

Since `@tanmai` is 7 actual characters (not an atomic node), there's no cursor mapping problem:
- 1 character = 1 character in the DOM
- Native caret, selection, IME, and touch all work without special handling
- We simply wrap valid mentions in `<span class="mention">@tanmai</span>` for blue styling

### Key techniques

1. **Re-scan on input**: Every input event extracts plain text, then re-renders with mention spans highlighted. Caret position is saved/restored across re-renders.

2. **Undo-safe insertion**: `document.execCommand('insertHTML')` preserves the browser's native undo stack, so Ctrl+Z works after mention insertion.

3. **Paste sanitization**: Paste events are intercepted and inserted as plain text via `document.execCommand('insertText')`.

4. **Enter handling**: Enter sends the message, Shift+Enter inserts a line break via `document.execCommand('insertLineBreak')`.

5. **Autocomplete dropdown**: Typing `@` triggers a dropdown filtered by the partial username. Arrow keys navigate, Enter/Tab selects, Escape dismisses.

### Files

- `src/SimpleChatbox.tsx` - The contenteditable chat input component
- `src/App.tsx` - Demo app using SimpleChatbox
- `src/index.css` - Styles including `.mention` class

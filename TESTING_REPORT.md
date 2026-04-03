# Hybrid Chatbox Testing Report

**Date:** 2026-04-02  
**Test Framework:** Playwright 1.52  
**Browser:** Chromium (headless)  
**Viewports:** Desktop (1280x800), Mobile (375x812)  
**Total Tests:** 30 (15 per viewport)  
**Pass Rate:** 30/30 (100%)

## Summary

The hybrid chatbox MVP works remarkably well. The transparent-contenteditable-over-overlay architecture produces **zero per-character cursor drift** in single-line text and consistent behavior across desktop and mobile viewports. The design choice to use identical CSS properties on both layers (same `font`, `padding`, `line-height`, `white-space`, `word-break`) is validated by the measurements.

## What Worked Correctly

### Input Types (Tests 01-06)
All input types render correctly on both desktop and mobile:
- **Simple text** (`desktop-01-simple-text.png`, `mobile-01-simple-text.png`): Clean rendering
- **Multiline with Shift+Enter** (`desktop-02-multiline.png`, `mobile-02-multiline.png`): Line breaks preserved correctly, auto-height grows properly
- **Long paragraph wrapping** (`desktop-03-long-paragraph.png`, `mobile-03-long-paragraph.png`): Word-wrap works identically in both layers
- **Special characters** (`desktop-04-special-chars.png`, `mobile-04-special-chars.png`): Emoji (🎉🚀✨), quotes, backticks, HTML entities all render correctly
- **Long single word** (`desktop-05-long-word.png`, `mobile-05-long-word.png`): `overflow-wrap: break-word` breaks correctly at container edge
- **Mixed line lengths** (`desktop-06-mixed-lines.png`, `mobile-06-mixed-lines.png`): Short line + wrapped long line + short line -- height and wrapping both correct

### Cursor Mapping (Tests 07-14)
- **Click positioning** (Test 07): Clicking in the middle of text places the caret at the correct character. On desktop, clicking at 40% width of "The quick brown fox jumps over" landed at offset 29 ("ove"), consistent with the click target being over the editable's transparent text at that position.
- **Text selection by drag** (Test 08, `desktop-08-text-selection.png`, `mobile-08-text-selection.png`): Selection highlight aligns perfectly with the visible overlay text. The semi-transparent selection (`rgba(74, 158, 255, 0.3)`) overlays the visible text correctly.
- **Arrow key navigation** (Test 09): After pressing Home + 5x ArrowRight on "ABCDEFGHIJ", caret was at offset 5 ("ABCDE") with the correct X position.
- **Line boundary cursors** (Test 10, `desktop-10d-cursor-start-line1.png`): Home/End and ArrowUp/ArrowDown navigate correctly between explicit newlines.
- **Per-character position comparison** (Test 13): **Zero drift** -- every character A-Z had `driftX: 0, driftY: 0` between the editable and overlay layers.

### Layer Property Match (Test 12)
Computed styles are identical between layers:

| Property | Overlay | Editable | Match? |
|----------|---------|----------|--------|
| font | `16px / 24px Inter, -apple-system, "system-ui", sans-serif` | Same | Yes |
| fontSize | `16px` | `16px` | Yes |
| lineHeight | `24px` | `24px` | Yes |
| padding | `12px 16px` | `12px 16px` | Yes |
| whiteSpace | `pre-wrap` | `pre-wrap` | Yes |
| wordBreak | `normal` | `normal` | Yes |
| overflowWrap | `break-word` | `break-word` | Yes |
| position | `absolute` | `absolute` | Yes |
| inset | `0px` | `0px` | Yes |
| width (clientWidth) | Identical | Identical | Yes |

### Send Message (Test 15)
Enter key sends the message, clears the chatbox, and the message appears in the message list correctly (`desktop-15b-after-send.png`).

## Minor Issues Found

### 1. scrollHeight Discrepancy (2px)

**Observed in:** Tests 11, 12, 14  
**Severity:** Cosmetic / negligible  
**Details:**

The `scrollHeight` of the editable layer is consistently **2px taller** than the overlay layer:

| Test | Overlay scrollHeight | Editable scrollHeight | Delta |
|------|---------------------|-----------------------|-------|
| Desktop single line (test 12) | 46px | 48px | +2px |
| Mobile wrapping (test 14) | 70px | 72px | +2px |

**Why this happens:** `contenteditable` divs in Chromium add a small amount of extra scroll height due to the trailing `<br>` element that the browser inserts for the editing caret. This does not affect visual rendering or cursor alignment because:
- The container height is controlled by pretext's `layout()` computation, not by either layer's scrollHeight
- Both layers use `position: absolute; inset: 0` so their visual bounds are determined by the container, not their content

**Impact:** None. The container's height is set programmatically via pretext, so this internal scrollHeight difference is invisible to the user.

### 2. Height Is Pretext-Computed, Not Pretext-Rendered

**Observed in:** Code review during testing  
**Severity:** Architectural note (not a bug)  
**Details:**

The MVP uses pretext's `prepare()` + `layout()` for **height computation only**. The overlay renders text using a simple `<div>` with `white-space: pre-wrap`, relying on the browser for line breaking. This works because both the overlay and the contenteditable use identical CSS, so the browser breaks lines at the same points.

However, this means the MVP is not yet leveraging pretext's `layoutWithLines()` for rendering -- the text displayed in the overlay is a plain text node, not pretext-positioned spans. For the plain-text MVP this is fine, but for rich rendering (syntax highlighting, inline decorations) the overlay would need to switch to pretext-driven line-by-line rendering, which could introduce line-break divergence if pretext's line-breaking algorithm differs from the browser's.

### 3. Wrapping Line Break Consistency

**Observed in:** Test 14  
**Severity:** Low (validated as working for MVP)  
**Details:**

On mobile (375px width), the text "This is text that should wrap to multiple lines in the chatbox area" breaks at:
- Editable: `"This is text that should wrap to multiple "` (42 chars on line 1)

The overlay shows the same break point visually. This confirms browser line-breaking is consistent between the two layers **when CSS properties match**. The pretext `layout()` height calculation also agrees (both produce 2-line height).

## Hypotheses About Potential Future Cursor Mapping Issues

While the MVP shows zero drift, here are scenarios that could break alignment in future iterations:

1. **Rich text rendering with pretext `layoutWithLines()`**: If the overlay switches from browser-rendered `pre-wrap` to pretext-computed line breaks with positioned spans, any difference in line-break decisions between pretext and the browser would cause the visible text to be on different lines than the contenteditable's text, breaking cursor Y alignment.

2. **Font loading race**: If the web font (Inter) hasn't loaded when pretext measures text, its height calculation could be wrong. The current MVP mitigates this because the overlay uses browser rendering, but a pretext-rendered overlay would be vulnerable.

3. **Inline decorations with different font metrics**: If chips, code spans, or other inline elements use different fonts/sizes (like the pretext `rich-note.ts` demo), the contenteditable would need matching inline elements to maintain cursor alignment -- which largely defeats the purpose of the hybrid approach.

4. **Scrollable content**: When text exceeds MAX_LINES (10), the editable becomes scrollable (`overflow-y: auto`). If the overlay doesn't scroll in sync, cursor position would diverge vertically.

## Screenshots Reference

All screenshots are in the `screenshots/` directory, named as `{viewport}-{test-number}-{description}.png`.

Key screenshots to examine:
- `desktop-08-text-selection.png` -- Selection highlight alignment (excellent)
- `mobile-03-long-paragraph.png` -- Multi-line wrapping on narrow viewport
- `mobile-05-long-word.png` -- Word break on unbreakable word
- `desktop-15b-after-send.png` -- Message sent successfully
- `desktop-12-font-comparison.png` -- Various character widths rendered correctly

## Conclusion

The hybrid chatbox MVP **works correctly for its stated scope**. The transparent-contenteditable trick eliminates cursor mapping complexity entirely -- both layers use the same DOM rendering engine with identical CSS, so positions match by construction. The zero-drift measurement on per-character positions confirms this.

The architecture's elegance is also its limitation: it only works for plain text where both layers render identically. The moment the overlay diverges from the contenteditable's rendering (custom line breaks, inline decorations, different fonts), cursor mapping breaks. This is the fundamental tension the project will need to address beyond MVP.

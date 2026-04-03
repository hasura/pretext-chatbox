import { useRef, useState, useCallback, useEffect, type KeyboardEvent } from 'react'
import { parseDocument } from './core/parser.js'
import {
  buildPositionMap, toVisualText, positionToSource, positionToVisual,
  sourceToPosition, findMappingAtSource,
} from './core/position-map.js'
import { moveCursor, documentStart, documentEnd } from './core/cursor.js'
import {
  collapsedSelection, sourceOffset,
  type Selection, type Document, type PositionMap,
} from './types/document.js'
import { RichOverlay, computeRichHeight } from './components/RichOverlay.js'

const MIN_HEIGHT = 48
const PADDING_X = 16

type Props = {
  onSend: (source: string) => void
  placeholder?: string
  initialSource?: string
}

export function HybridChatbox({
  onSend,
  placeholder = 'Type a message...',
  initialSource = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Core state: raw source string is the single source of truth
  const [source, setSource] = useState(initialSource)

  // Derived state: parsed document + position map + selection
  const [doc, setDoc] = useState<Document>(() => parseDocument(initialSource))
  const [posMap, setPosMap] = useState<PositionMap>(() => buildPositionMap(parseDocument(initialSource)))
  const [selection, setSelection] = useState<Selection>(() =>
    collapsedSelection(documentEnd(parseDocument(initialSource)))
  )
  const [focused, setFocused] = useState(false)
  const [height, setHeight] = useState(MIN_HEIGHT)

  // Re-parse when source changes and preserve cursor from textarea
  const updateFromSource = useCallback((newSource: string) => {
    setSource(newSource)
    const newDoc = parseDocument(newSource)
    const newMap = buildPositionMap(newDoc)
    setDoc(newDoc)
    setPosMap(newMap)

    // Preserve cursor position from textarea (after user typed/deleted)
    const textarea = textareaRef.current
    if (textarea) {
      const cursorSrc = sourceOffset(textarea.selectionStart)
      const cursorPos = sourceToPosition(newMap, cursorSrc)
      setSelection(collapsedSelection(cursorPos))
    } else {
      setSelection(collapsedSelection(documentEnd(newDoc)))
    }

    // Update height
    const containerWidth = containerRef.current?.clientWidth ?? 0
    const visualText = toVisualText(newDoc)
    setHeight(computeRichHeight(visualText, containerWidth))
  }, [])

  // Sync textarea cursor to React selection state (SOURCE offsets, not visual!)
  const syncTextareaCursor = useCallback((sel: Selection, map: PositionMap) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const srcStart = positionToSource(map, sel.anchor)
    const srcEnd = positionToSource(map, sel.focus)
    textarea.setSelectionRange(srcStart, srcEnd)
  }, [])

  // Handle textarea input
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    updateFromSource(textarea.value)
  }, [updateFromSource])

  // Handle selection changes (clicks, native arrow keys without mentions)
  // This syncs the textarea's native selection → React state
  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const rawStart = textarea.selectionStart
    const rawEnd = textarea.selectionEnd

    const startPos = sourceToPosition(posMap, sourceOffset(rawStart))
    const endPos = rawStart === rawEnd
      ? startPos
      : sourceToPosition(posMap, sourceOffset(rawEnd))

    const newSel = rawStart === rawEnd
      ? collapsedSelection(startPos)
      : { anchor: startPos, focus: endPos }

    setSelection(newSel)

    // If cursor landed inside a mention, snap to the atomic boundary
    // and sync the snapped position back to the textarea
    const snappedStart = positionToSource(posMap, startPos)
    const snappedEnd = positionToSource(posMap, endPos)
    if (snappedStart !== rawStart || snappedEnd !== rawEnd) {
      textarea.setSelectionRange(snappedStart, snappedEnd)
    }
  }, [posMap])

  // Handle keyboard navigation with atomic skip
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const trimmed = source.trim()
      if (!trimmed) return
      onSend(trimmed)
      if (textareaRef.current) textareaRef.current.value = ''
      updateFromSource('')
      return
    }

    // Arrow key navigation with atomic skip
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? 'left' as const : 'right' as const
      const hasMentions = doc.segments.some(s => s.kind === 'mention')

      if (hasMentions) {
        e.preventDefault()
        const newSel = moveCursor(doc, selection, dir, e.shiftKey)
        setSelection(newSel)
        // Sync to textarea using SOURCE offsets (not visual!)
        syncTextareaCursor(newSel, posMap)
      }
      // If no mentions, let native textarea handle arrows.
      // The onSelect handler will sync React state afterward.
    }

    // Home: go to document start
    if (e.key === 'Home' && doc.segments.some(s => s.kind === 'mention')) {
      e.preventDefault()
      const start = documentStart(doc)
      const newSel = e.shiftKey
        ? { anchor: selection.anchor, focus: start }
        : collapsedSelection(start)
      setSelection(newSel)
      syncTextareaCursor(newSel, posMap)
    }

    // End: go to document end
    if (e.key === 'End' && doc.segments.some(s => s.kind === 'mention')) {
      e.preventDefault()
      const end = documentEnd(doc)
      const newSel = e.shiftKey
        ? { anchor: selection.anchor, focus: end }
        : collapsedSelection(end)
      setSelection(newSel)
      syncTextareaCursor(newSel, posMap)
    }
  }, [source, doc, posMap, selection, onSend, updateFromSource, syncTextareaCursor])

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const containerWidth = containerRef.current?.clientWidth ?? 0
      const visualText = toVisualText(doc)
      setHeight(computeRichHeight(visualText, containerWidth))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [doc])

  // Sync textarea value when source changes externally
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== source) {
      textareaRef.current.value = source
    }
  }, [source])

  const containerWidth = containerRef.current?.clientWidth ?? 0
  const visualText = toVisualText(doc)
  const showPlaceholder = visualText.length === 0

  return (
    <div
      ref={containerRef}
      className={`hybrid-chatbox ${focused ? 'hybrid-chatbox--focused' : ''}`}
      style={{ height }}
      onClick={() => textareaRef.current?.focus()}
    >
      {/* Rich overlay with mention pills and custom cursor */}
      {showPlaceholder ? (
        <div className="rich-overlay" aria-hidden>
          <div className="rich-overlay__text">
            <span className="hybrid-chatbox__placeholder">{placeholder}</span>
          </div>
        </div>
      ) : (
        <RichOverlay
          doc={doc}
          posMap={posMap}
          selection={selection}
          containerWidth={containerWidth}
          focused={focused}
        />
      )}

      {/* Hidden textarea for input capture — native caret is hidden via CSS */}
      <textarea
        ref={textareaRef}
        className="hybrid-chatbox__textarea"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck
        autoComplete="off"
        defaultValue={source}
      />
    </div>
  )
}

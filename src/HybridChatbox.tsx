import { useRef, useState, useCallback, useEffect, type KeyboardEvent } from 'react'
import { parseDocument } from './core/parser.js'
import { buildPositionMap, toVisualText, positionToVisual } from './core/position-map.js'
import { movePosition, documentStart, documentEnd, moveCursor } from './core/cursor.js'
import { collapsedSelection, type Selection, type Document, type PositionMap } from './types/document.js'
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
    collapsedSelection(documentStart(parseDocument(initialSource)))
  )
  const [focused, setFocused] = useState(false)
  const [height, setHeight] = useState(MIN_HEIGHT)

  // Re-parse when source changes
  const updateFromSource = useCallback((newSource: string) => {
    setSource(newSource)
    const newDoc = parseDocument(newSource)
    const newMap = buildPositionMap(newDoc)
    setDoc(newDoc)
    setPosMap(newMap)
    // Move cursor to end
    setSelection(collapsedSelection(documentEnd(newDoc)))
    // Update height
    const containerWidth = containerRef.current?.clientWidth ?? 0
    const visualText = toVisualText(newDoc)
    setHeight(computeRichHeight(visualText, containerWidth))
  }, [])

  // Handle textarea input
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    updateFromSource(textarea.value)
  }, [updateFromSource])

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

        // Sync textarea cursor to match the new position
        const textarea = textareaRef.current
        if (textarea) {
          const visualPos = positionToVisual(posMap, newSel.focus)
          textarea.setSelectionRange(visualPos, visualPos)
        }
      }
      // If no mentions, let native textarea handle arrows
    }

    // Home: go to document start
    if (e.key === 'Home' && doc.segments.some(s => s.kind === 'mention')) {
      e.preventDefault()
      const start = documentStart(doc)
      setSelection(e.shiftKey
        ? { anchor: selection.anchor, focus: start }
        : collapsedSelection(start)
      )
    }

    // End: go to document end
    if (e.key === 'End' && doc.segments.some(s => s.kind === 'mention')) {
      e.preventDefault()
      const end = documentEnd(doc)
      setSelection(e.shiftKey
        ? { anchor: selection.anchor, focus: end }
        : collapsedSelection(end)
      )
    }
  }, [source, doc, posMap, selection, onSend, updateFromSource])

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

      {/* Hidden textarea for input capture */}
      <textarea
        ref={textareaRef}
        className="hybrid-chatbox__textarea"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck
        autoComplete="off"
        defaultValue={source}
      />
    </div>
  )
}

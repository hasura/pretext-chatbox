import { useRef, useState, useCallback, useEffect, type KeyboardEvent } from 'react'
import { prepare, layout } from '@chenglou/pretext'

const FONT = '16px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
const LINE_HEIGHT = 24
const PADDING_Y = 12
const PADDING_X = 16
const MIN_HEIGHT = LINE_HEIGHT + PADDING_Y * 2
const MAX_LINES = 10

type Props = {
  onSend: (text: string) => void
  placeholder?: string
}

export function HybridChatbox({ onSend, placeholder = 'Type a message...' }: Props) {
  const editableRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [height, setHeight] = useState(MIN_HEIGHT)
  const [focused, setFocused] = useState(false)

  const computeHeight = useCallback((value: string, width: number) => {
    if (!value || width <= 0) return MIN_HEIGHT
    const prepared = prepare(value, FONT, { whiteSpace: 'pre-wrap' })
    const result = layout(prepared, width, LINE_HEIGHT)
    const clampedLines = Math.min(result.lineCount, MAX_LINES)
    return clampedLines * LINE_HEIGHT + PADDING_Y * 2
  }, [])

  const syncText = useCallback(() => {
    const el = editableRef.current
    if (!el) return
    // Use innerText to preserve newlines from contenteditable
    const value = el.innerText ?? ''
    setText(value)

    const containerWidth = containerRef.current?.clientWidth ?? 0
    const textWidth = containerWidth - PADDING_X * 2
    setHeight(computeHeight(value, textWidth))
  }, [computeHeight])

  // Recompute height on resize
  useEffect(() => {
    const handleResize = () => {
      const containerWidth = containerRef.current?.clientWidth ?? 0
      const textWidth = containerWidth - PADDING_X * 2
      setHeight(computeHeight(text, textWidth))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [text, computeHeight])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const value = editableRef.current?.innerText?.trim() ?? ''
      if (!value) return
      onSend(value)
      if (editableRef.current) {
        editableRef.current.textContent = ''
      }
      setText('')
      setHeight(MIN_HEIGHT)
    }
  }, [onSend])

  const showPlaceholder = !text

  return (
    <div
      ref={containerRef}
      className={`hybrid-chatbox ${focused ? 'hybrid-chatbox--focused' : ''}`}
      style={{ height }}
    >
      {/* Pretext-rendered overlay (visible text) */}
      <div ref={overlayRef} className="hybrid-chatbox__overlay" aria-hidden>
        {text || (showPlaceholder ? <span className="hybrid-chatbox__placeholder">{placeholder}</span> : null)}
      </div>

      {/* Transparent contenteditable (captures input, shows native caret) */}
      <div
        ref={editableRef}
        className="hybrid-chatbox__editable"
        contentEditable
        suppressContentEditableWarning
        onInput={syncText}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck
      />
    </div>
  )
}

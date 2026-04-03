import { useState, useRef, useCallback } from 'react'
import { HybridChatbox } from './HybridChatbox'

type Message = {
  id: number
  source: string
}

let nextId = 1

const PRESETS = [
  {
    label: 'Plain text',
    source: 'Hello world, this is a plain message',
  },
  {
    label: '@mention',
    source: 'Hey <user_mention id="Maya Chen" /> can you review this PR?',
  },
  {
    label: 'Multiple mentions',
    source: '<user_mention id="Maya Chen" /> and <user_mention id="Alex Kim" /> please check <promptql_mention /> results',
  },
  {
    label: 'Mention at start',
    source: '<user_mention id="Maya Chen" /> what do you think?',
  },
  {
    label: 'Mention at end',
    source: 'Assigned to <user_mention id="Alex Kim" />',
  },
]

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSource, setActiveSource] = useState('')
  const chatboxKey = useRef(0)

  const handleSend = useCallback((source: string) => {
    setMessages(prev => [...prev, { id: nextId++, source }])
    chatboxKey.current++
    setActiveSource('')
  }, [])

  const loadPreset = useCallback((source: string) => {
    chatboxKey.current++
    setActiveSource(source)
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <h1>pretext-chatbox</h1>
        <p className="app__subtitle">
          CM6-style cursor mapping with type-driven @mention pills
        </p>
      </header>

      <div className="app__messages">
        {messages.length === 0 && (
          <div className="app__empty">
            Try the presets below, or type a message.<br />
            Mentions use: &lt;user_mention id="Name" /&gt;
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="message">
            <div className="message__text">{msg.source}</div>
          </div>
        ))}
      </div>

      <div className="app__presets">
        {PRESETS.map(p => (
          <button
            key={p.label}
            className="app__preset-btn"
            onClick={() => loadPreset(p.source)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="app__input">
        <HybridChatbox
          key={chatboxKey.current}
          onSend={handleSend}
          initialSource={activeSource}
        />
      </div>
    </div>
  )
}

import { useState } from 'react'
import { HybridChatbox } from './HybridChatbox'

type Message = {
  id: number
  text: string
}

let nextId = 1

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])

  const handleSend = (text: string) => {
    setMessages(prev => [...prev, { id: nextId++, text }])
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>pretext-chatbox</h1>
        <p className="app__subtitle">
          Hybrid chatbox: transparent contenteditable + pretext overlay
        </p>
      </header>

      <div className="app__messages">
        {messages.length === 0 && (
          <div className="app__empty">Send a message to get started</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="message">
            <div className="message__text">{msg.text}</div>
          </div>
        ))}
      </div>

      <div className="app__input">
        <HybridChatbox onSend={handleSend} />
      </div>
    </div>
  )
}

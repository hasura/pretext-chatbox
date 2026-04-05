import { useState } from 'react';
import SimpleChatbox from './SimpleChatbox';
import './App.css';

interface Message {
  id: number;
  text: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSend = (text: string) => {
    setMessages((prev) => [...prev, { id: Date.now(), text }]);
  };

  return (
    <div className="chat-app">
      <h1>Simple Chatbox Demo</h1>
      <div className="messages">
        {messages.length === 0 && (
          <p className="empty-state">No messages yet. Type below to start chatting!</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="message">
            {msg.text}
          </div>
        ))}
      </div>
      <SimpleChatbox onSend={handleSend} />
    </div>
  );
}

export default App;

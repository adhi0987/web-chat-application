import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css' // Import standard CSS

function App() {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  
  const messagesEndRef = useRef(null)

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (!isLoggedIn) return;

    // 1. Fetch old messages
    getMessages()

    // 2. Listen for new messages in Realtime
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn])

  // Scroll whenever messages update
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const getMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (error) console.error('Error fetching messages:', error)
    else setMessages(data)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const { error } = await supabase
      .from('messages')
      .insert([{ username: username, content: newMessage }])

    if (error) console.error('Error sending message:', error)
    setNewMessage('')
  }

  // --- RENDER: LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Welcome to Chat</h1>
          <p>Enter your name to join the room</p>
          <input
            type="text"
            className="login-input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button 
            className="login-btn"
            onClick={() => username && setIsLoggedIn(true)}
          >
            Join Room
          </button>
        </div>
      </div>
    )
  }

  // --- RENDER: CHAT SCREEN ---
  return (
    <div className="app-container">
      {/* Header */}
      <header className="chat-header">
        <h3>Global Room</h3>
        <span className="status-dot">● {username}</span>
      </header>

      {/* Messages List */}
      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          return (
            <div key={msg.id} className={`message-row ${isMe ? 'mine' : 'theirs'}`}>
              <div className="bubble">
                {!isMe && <span className="sender-name">{msg.username}</span>}
                {msg.content}
                <span className="timestamp">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          )
        })}
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="input-form">
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button type="submit" className="send-btn">Send</button>
      </form>
    </div>
  )
}

export default App
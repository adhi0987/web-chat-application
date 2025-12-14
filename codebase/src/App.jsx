import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  
  // States for features
  const [replyTo, setReplyTo] = useState(null)     // The message object being replied to
  const [editingId, setEditingId] = useState(null) // ID of message being edited
  
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // --- 1. SETUP & REALTIME ---
  useEffect(() => {
    if (!isLoggedIn) return;

    console.log('User logged in, initializing chat...');
    fetchMessages()

    // Listen for ALL changes (Insert, Update, Delete)
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        console.log('🔴 Realtime Event Received:', payload);
        handleRealtimeEvent(payload)
      })
      .subscribe((status) => {
        // Log the connection status (SUBSCRIBED, CLOSED, CHANNEL_ERROR, TIMED_OUT)
        console.log('Mj Supabase Subscription Status:', status);
      })

    return () => {
      console.log('Cleaning up: Removing Supabase channel...');
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn])

  // Scroll to bottom only on new messages (Insert)
  useEffect(() => {
    // Only scroll if we are not editing/replying to avoid jumping 
    if (!editingId && !replyTo) {
      scrollToBottom()
    }
  }, [messages.length])

  // --- 2. DATA HANDLERS ---
  const fetchMessages = async () => {
    console.log('Fetching initial messages...');
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('❌ Error fetching messages:', error);
    } else {
      console.log('✅ Messages fetched successfully:', data.length, 'messages found.');
      setMessages(data)
    }
  }

  const handleRealtimeEvent = (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    
    console.log(`Processing ${eventType} event...`);

    setMessages((prev) => {
      if (eventType === 'INSERT') {
        console.log('➕ Adding new message to state:', newRow);
        return [...prev, newRow]
      } 
      else if (eventType === 'UPDATE') {
        console.log('✎ Updating message in state:', newRow);
        return prev.map(msg => (msg.id === newRow.id ? newRow : msg))
      } 
      else if (eventType === 'DELETE') {
        console.log('wm Deleting message from state:', oldRow);
        return prev.filter(msg => msg.id !== oldRow.id)
      }
      return prev
    })
  }

  // --- 3. ACTIONS (SEND, EDIT, REPLY, DELETE) ---
  const handleSubmit = async (e) => {
    e.preventDefault() // Only triggers on button click if form is set up right
    if (!inputText.trim()) {
      console.warn('⚠️ Attempted to send empty message');
      return
    }

    if (editingId) {
      // Logic for EDITING
      console.log(`Attempting to UPDATE message ID: ${editingId} with content: "${inputText}"`);
      const { error } = await supabase
        .from('messages')
        .update({ content: inputText, is_edited: true })
        .eq('id', editingId)
      
      if (error) console.error('❌ Error updating message:', error);
      else console.log('✅ Message updated successfully');

      setEditingId(null)
    } else {
      // Logic for SENDING (New or Reply)
      const payload = {
        username: username,
        content: inputText,
        reply_to_id: replyTo ? replyTo.id : null
      }
      
      console.log('Attempting to INSERT new message:', payload);
      const { error } = await supabase.from('messages').insert([payload])

      if (error) console.error('❌ Error sending message:', error);
      else console.log('✅ Message sent successfully');

      setReplyTo(null)
    }
    
    setInputText('')
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this message?")) return
    
    console.log(`Attempting to DELETE message ID: ${id}`);
    const { error } = await supabase.from('messages').delete().eq('id', id)

    if (error) console.error('❌ Error deleting message:', error);
    else console.log('✅ Message deleted request sent');
  }

  const startReply = (msg) => {
    console.log('UI: Started reply to', msg.id);
    setEditingId(null)
    setReplyTo(msg)
    // Focus input? (Optional)
  }

  const startEdit = (msg) => {
    console.log('UI: Started edit for', msg.id);
    setReplyTo(null)
    setEditingId(msg.id)
    setInputText(msg.content)
  }

  const cancelAction = () => {
    console.log('UI: Cancelled action');
    setReplyTo(null)
    setEditingId(null)
    setInputText('')
  }

  // --- 4. RENDER HELPERS ---
  // Find the content of the message being replied to (for display)
  const getReplyingToContent = (id) => {
    const parent = messages.find(m => m.id === id)
    if (!parent) return "Message deleted"
    return parent.content.length > 50 ? parent.content.substring(0, 50) + "..." : parent.content
  }
  
  const getReplyingToUser = (id) => {
    const parent = messages.find(m => m.id === id)
    return parent ? parent.username : "Unknown"
  }

  // --- 5. RENDER UI ---
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2 style={{color: '#008069', marginBottom: '1rem'}}>Join Chat</h2>
          <input
            type="text"
            className="login-input"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button className="login-btn" onClick={() => {
            console.log('User logging in as:', username);
            if (username) setIsLoggedIn(true)
          }}>
            Start Chatting
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="chat-header">
        <h3>Chat Room</h3>
        <span>{username}</span>
      </header>

      {/* Messages */}
      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          return (
            <div key={msg.id} className={`message-row ${isMe ? 'mine' : 'theirs'}`}>
              <div className="bubble">
                
                {/* 1. Reply Quote (If this message is a reply) */}
                {msg.reply_to_id && (
                  <div className="reply-quote">
                    <strong>{getReplyingToUser(msg.reply_to_id)}</strong>
                    {getReplyingToContent(msg.reply_to_id)}
                  </div>
                )}

                {/* 2. Sender Name (Only for others) */}
                {!isMe && <span className="sender-name">{msg.username}</span>}

                {/* 3. Message Content */}
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                {/* 4. Footer: Time, Edited, Actions */}
                <div className="bubble-footer">
                  {msg.is_edited && <span className="edited-tag">(edited)</span>}
                  <span className="timestamp">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Actions Menu */}
                  <div className="msg-actions">
                    <button className="action-btn" onClick={() => startReply(msg)} title="Reply">↩</button>
                    {isMe && (
                      <>
                        <button className="action-btn" onClick={() => startEdit(msg)} title="Edit">✎</button>
                        <button className="action-btn delete-btn" onClick={() => handleDelete(msg.id)} title="Delete">🗑️</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className="footer-container">
        {/* Banner: Editing or Replying */}
        {(replyTo || editingId) && (
          <div className="reply-banner">
            <div>
              {editingId ? (
                <strong>Editing Message</strong>
              ) : (
                <>
                  <strong>Replying to {replyTo.username}</strong>
                  <span style={{fontSize: '0.8em', color: '#555'}}>
                    {replyTo.content.substring(0, 40)}...
                  </span>
                </>
              )}
            </div>
            <button className="close-reply" onClick={cancelAction}>✕</button>
          </div>
        )}

        {/* Form */}
        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            className="chat-input"
            placeholder={editingId ? "Edit your message..." : "Type a message..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            // Shift+Enter handled by browser (new line), Enter does nothing unless we add logic
          />
          <button type="submit" className="send-btn">
            {editingId ? 'Save' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
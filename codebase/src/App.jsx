import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // --- NEW STATES for Search & Stats ---
  const [activeUsers, setActiveUsers] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMatches, setSearchMatches] = useState([]) // Array of Message IDs that match
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1) // Index within searchMatches

  // States for features
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // --- 1. SETUP & REALTIME ---
  useEffect(() => {
    if (!isLoggedIn) return;

    console.log('User logged in, initializing chat...');
    fetchMessages()

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        handleRealtimeEvent(payload)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const count = Object.keys(state).length
        setActiveUsers(count)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: username, online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn])

  // Scroll to bottom on new messages (unless searching or editing)
  useEffect(() => {
    if (!editingId && !replyTo && !searchTerm) {
      scrollToBottom()
    }
  }, [messages.length])

  // --- 2. SEARCH LOGIC ---
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([])
      setCurrentMatchIndex(-1)
      return
    }

    // Find all message IDs that contain the search term
    const matches = messages.reduce((acc, msg) => {
      const matchContent = msg.content.toLowerCase().includes(searchTerm.toLowerCase())
      const matchUser = msg.username.toLowerCase().includes(searchTerm.toLowerCase())
      if (matchContent || matchUser) {
        acc.push(msg.id)
      }
      return acc
    }, [])

    setSearchMatches(matches)
    
    // If we found matches, select the first one (or keep relative position if improved)
    if (matches.length > 0) {
      setCurrentMatchIndex(0) 
    } else {
      setCurrentMatchIndex(-1)
    }
  }, [searchTerm, messages])

  // Scroll to the current match whenever index changes
  useEffect(() => {
    if (currentMatchIndex >= 0 && searchMatches.length > 0) {
      const matchId = searchMatches[currentMatchIndex]
      const element = document.getElementById(`msg-${matchId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [currentMatchIndex, searchMatches])

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length)
  }

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length)
  }

  // --- 3. DATA HANDLERS ---
  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) console.error('Error fetching messages:', error);
    else setMessages(data)
  }

  const handleRealtimeEvent = (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    setMessages((prev) => {
      if (eventType === 'INSERT') return [...prev, newRow]
      else if (eventType === 'UPDATE') return prev.map(msg => (msg.id === newRow.id ? newRow : msg))
      else if (eventType === 'DELETE') return prev.filter(msg => msg.id !== oldRow.id)
      return prev
    })
  }

  // --- 4. ACTIONS ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputText.trim()) return

    if (editingId) {
      await supabase.from('messages').update({ content: inputText, is_edited: true }).eq('id', editingId)
      setEditingId(null)
    } else {
      const payload = { username: username, content: inputText, reply_to_id: replyTo ? replyTo.id : null }
      await supabase.from('messages').insert([payload])
      setReplyTo(null)
    }
    setInputText('')
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this message?")) return
    await supabase.from('messages').delete().eq('id', id)
  }

  const deleteAllConversations = async () => {
    if (!confirm("⚠️ DELETE ALL conversations? This cannot be undone.")) return;
    const { error } = await supabase.from('messages').delete().neq('id', -1)
    if (error) alert("Failed to delete. Check RLS policies.")
    else setMessages([])
  }

  const startReply = (msg) => { setEditingId(null); setReplyTo(msg); }
  const startEdit = (msg) => { setReplyTo(null); setEditingId(msg.id); setInputText(msg.content); }
  const cancelAction = () => { setReplyTo(null); setEditingId(null); setInputText(''); }

  // --- 5. RENDER HELPERS ---
  const highlightText = (text) => {
    if (!searchTerm.trim()) return text;
    // Split text by search term (case insensitive capture group to keep delimiters)
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} style={{ backgroundColor: '#ffeb3b', color: 'black', borderRadius: '2px' }}>{part}</mark> 
        : part
    );
  }

  const getReplyingToContent = (id) => {
    const parent = messages.find(m => m.id === id)
    return parent ? parent.content.substring(0, 50) + "..." : "Message deleted"
  }
  
  const getReplyingToUser = (id) => {
    const parent = messages.find(m => m.id === id)
    return parent ? parent.username : "Unknown"
  }

  // --- 6. RENDER UI ---
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2 style={{ color: '#008069' }}>Rayabaari</h2>
          <h2 style={{ color: '#008069' }}>Chat Room</h2>
          <input type="text" className="login-input" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button className="login-btn" onClick={() => username && setIsLoggedIn(true)}>Start Chatting</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="chat-header" style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: 'auto', padding: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
             <h3>Rayabaari</h3>
             <span style={{ fontSize: '0.8rem', backgroundColor: '#25d366', color: 'white',fontWeight:'600',margin: '0 5px', padding: '2px 8px', borderRadius: '10px' }}>
               {activeUsers} Active
             </span>
          </div>
          <span>{username}</span>
        </div>

        {/* Search & Toolbar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px', borderRadius: '8px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
            <input 
              type="text" 
              placeholder=" Find in chat..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', outline: 'none' }}
            />
            {/* Match Counter */}
            {searchTerm && searchMatches.length > 0 && (
              <span style={{ position: 'absolute', right: '5px', color: '#555', fontSize: '0.8rem' }}>
                {currentMatchIndex + 1}/{searchMatches.length}
              </span>
            )}
            {searchTerm && searchMatches.length === 0 && (
               <span style={{ position: 'absolute', right: '5px', color: '#d32f2f', fontSize: '0.8rem' }}>0/0</span>
            )}
          </div>

          {/* Navigation Buttons */}
          <button onClick={handlePrevMatch} disabled={searchMatches.length === 0} style={{ padding: '4px 8px', cursor: 'pointer' }}>▲</button>
          <button onClick={handleNextMatch} disabled={searchMatches.length === 0} style={{ padding: '4px 8px', cursor: 'pointer' }}>▼</button>

          <button onClick={deleteAllConversations} style={{ backgroundColor: '#d32f2f', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '10px', cursor: 'pointer', marginLeft: 'auto' }} title="Delete All">
            Delete All
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          // Check if this specific message is the currently selected search result
          const isCurrentMatch = searchMatches[currentMatchIndex] === msg.id;

          return (
            <div 
              key={msg.id} 
              id={`msg-${msg.id}`} // crucial for scrolling
              className={`message-row ${isMe ? 'mine' : 'theirs'}`}
              style={isCurrentMatch ? { transition: '0.3s', transform: 'scale(1.02)' } : {}}
            >
              <div 
                className="bubble"
                style={isCurrentMatch ? { border: '2px solid #ffeb3b', boxShadow: '0 0 10px #ffeb3b' } : {}}
              >
                {/* Reply Section */}
                {msg.reply_to_id && (
                  <div className="reply-quote">
                    <strong>{getReplyingToUser(msg.reply_to_id)}</strong>
                    {getReplyingToContent(msg.reply_to_id)}
                  </div>
                )}

                {!isMe && <span className="sender-name">{highlightText(msg.username)}</span>}
                
                {/* Content with Highlights */}
                <div style={{ whiteSpace: 'pre-wrap' }}>{highlightText(msg.content)}</div>

                <div className="bubble-footer">
                  {msg.is_edited && <span className="edited-tag">(edited)</span>}
                  <span className="timestamp">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="msg-actions">
                    <button className="action-btn" onClick={() => startReply(msg)}>↩</button>
                    {isMe && (
                      <>
                        <button className="action-btn" onClick={() => startEdit(msg)}>✎</button>
                        <button className="action-btn delete-btn" onClick={() => handleDelete(msg.id)}>🗑️</button>
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

      {/* Input */}
      <div className="footer-container">
        {(replyTo || editingId) && (
          <div className="reply-banner">
            <div>
              {editingId ? <strong>Editing Message</strong> : <strong>Replying to {replyTo.username}</strong>}
            </div>
            <button className="close-reply" onClick={cancelAction}>✕</button>
          </div>
        )}
        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            className="chat-input"
            placeholder={editingId ? "Edit..." : "Type a message..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button type="submit" className="send-btn">{editingId ? 'Save' : 'Send'}</button>
        </form>
      </div>
    </div>
  )
}

export default App
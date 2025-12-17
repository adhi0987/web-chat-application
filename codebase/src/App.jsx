import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

import {Paperclip,Send,Edit,Trash2,Reply,ChevronUp,
  ChevronDown,Search,
  X
} from 'lucide-react';

function App() {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // --- NEW STATES for Search & Stats ---
  const [activeUsers, setActiveUsers] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMatches, setSearchMatches] = useState([]) 
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1) 

  // --- NEW STATES for Image Upload ---
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

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

  // Scroll to bottom on new messages
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

    const matches = messages.reduce((acc, msg) => {
      const matchContent = (msg.content || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchUser = msg.username.toLowerCase().includes(searchTerm.toLowerCase())
      if (matchContent || matchUser) {
        acc.push(msg.id)
      }
      return acc
    }, [])

    setSearchMatches(matches)
    
    if (matches.length > 0) {
      setCurrentMatchIndex(0) 
    } else {
      setCurrentMatchIndex(-1)
    }
  }, [searchTerm, messages])

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

  // --- 4. FILE & SUBMIT ACTIONS ---
  
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Prevent empty send (unless a file is selected)
    if (!inputText.trim() && !selectedFile) return

    if (editingId) {
      // Logic for editing (currently text only)
      await supabase.from('messages').update({ content: inputText, is_edited: true }).eq('id', editingId)
      setEditingId(null)
      setInputText('')
      return
    }

    let imageUrl = null

    // Upload Image if exists
    if (selectedFile) {
      setIsUploading(true)
      try {
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random()}.${fileExt}`
        const filePath = `${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('chat_images')
          .upload(filePath, selectedFile)

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('chat_images').getPublicUrl(filePath)
        imageUrl = data.publicUrl
      } catch (error) {
        console.error('Upload failed:', error)
        alert('Failed to upload image')
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }

    // Insert Message
    const payload = { 
      username: username, 
      content: inputText, 
      reply_to_id: replyTo ? replyTo.id : null,
      image_url: imageUrl
    }

    await supabase.from('messages').insert([payload])
    
    // Reset inputs
    setReplyTo(null)
    setSelectedFile(null)
    setInputText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  const startReply = (msg) => { 
    setEditingId(null); 
    setReplyTo(msg); 
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSelectedFile(null)
  }
  
  const startEdit = (msg) => { 
    setReplyTo(null); 
    setEditingId(msg.id); 
    setInputText(msg.content); 
    setSelectedFile(null) // Disable file upload during edit for simplicity
  }
  
  const cancelAction = () => { 
    setReplyTo(null); 
    setEditingId(null); 
    setInputText(''); 
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- 5. RENDER HELPERS ---
  const highlightText = (text) => {
    if (!text) return null;
    if (!searchTerm.trim()) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} style={{ backgroundColor: '#ffeb3b', color: 'black', borderRadius: '2px' }}>{part}</mark> 
        : part
    );
  }

  const getReplyingToContent = (id) => {
    const parent = messages.find(m => m.id === id)
    if (!parent) return "Message deleted"
    if (parent.image_url && !parent.content) return "📷 photo"
    return parent.content.substring(0, 50) + (parent.content.length > 50 ? "..." : "")
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
            {/* <Search size={16} style={{ position: 'absolute', left: '5px', color: '#555' }} /> */}
            <input 
              type="text" 
              placeholder=" Find in chat..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: 'none', outline: 'none' }}
            />
            {searchTerm && searchMatches.length > 0 && (
              <span style={{ position: 'absolute', right: '5px', color: '#555', fontSize: '0.8rem' }}>
                {currentMatchIndex + 1}/{searchMatches.length}
              </span>
            )}
            {searchTerm && searchMatches.length === 0 && (
               <span style={{ position: 'absolute', right: '5px', color: '#d32f2f', fontSize: '0.8rem' }}>0/0</span>
            )}
          </div>
          <button onClick={handlePrevMatch} disabled={searchMatches.length === 0} style={{ padding: '4px 8px', cursor: 'pointer' }}><ChevronUp size={16} /></button>
          <button onClick={handleNextMatch} disabled={searchMatches.length === 0} style={{ padding: '4px 8px', cursor: 'pointer' }}><ChevronDown size={16} /></button>
          <button onClick={deleteAllConversations} style={{ backgroundColor: '#d32f2f', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '10px', cursor: 'pointer', marginLeft: 'auto' }} title="Delete All">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          const isCurrentMatch = searchMatches[currentMatchIndex] === msg.id;

          return (
            <div 
              key={msg.id} 
              id={`msg-${msg.id}`} 
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
                
                {/* IMAGE RENDERING */}
                {msg.image_url && (
                  <div className="image-container">
                    <img src={msg.image_url} alt="Shared" className="chat-image" loading="lazy" />
                  </div>
                )}

                {/* Text Content */}
                {msg.content && <div style={{ whiteSpace: 'pre-wrap' }}>{highlightText(msg.content)}</div>}

                <div className="bubble-footer">
                  {msg.is_edited && <span className="edited-tag">(edited)</span>}
                  <span className="timestamp">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="msg-actions">
                    <button className="action-btn" onClick={() => startReply(msg)}><Reply size={16} /></button>
                    {isMe && (
                      <>
                         {/* Only allow editing text content */}
                        <button className="action-btn" onClick={() => startEdit(msg)}><Edit size={16} /></button>
                        <button className="action-btn delete-btn" onClick={() => handleDelete(msg.id)}><Trash2 size={16} /></button>
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

      {/* Input Area */}
      <div className="footer-container">
        {/* Reply / Edit Banner */}
        {(replyTo || editingId) && (
          <div className="reply-banner">
            <div>
              {editingId ? <strong>Editing Message</strong> : <strong>Replying to {replyTo.username}</strong>}
            </div>
            <button className="close-reply" onClick={cancelAction}><X size={16} /></button>
          </div>
        )}

        {/* Image Preview Banner */}
        {selectedFile && !editingId && (
          <div className="preview-banner">
            <span style={{ fontSize: '0.9rem' }}><Paperclip size={16} /> {selectedFile.name}</span>
            <button className="close-reply" onClick={() => setSelectedFile(null)}><X size={16} /></button>
          </div>
        )}

        <form className="input-form" onSubmit={handleSubmit}>
          {/* File Input (Hidden) */}
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={!!editingId} // Disable file attach during edit
          />
          
          {/* File Trigger Button */}
          {!editingId && (
            <button 
              type="button" 
              className="attach-btn" 
              onClick={() => fileInputRef.current?.click()}
              title="Attach Image"
            >
              <Paperclip size ={18}/>
            </button>
          )}

          <textarea
            className="chat-input"
            placeholder={editingId ? "Edit text..." : "Type a message..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button type="submit" className="send-btn" disabled={isUploading}>
            {/* {isUploading ? '...' : (editingId ? 'Save' : 'Send')} */}
            <Send size={18}/>
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
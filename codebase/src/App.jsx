import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

import { 
  Paperclip, Send, Edit, Trash2, Reply, 
  ChevronUp, ChevronDown, X 
} from 'lucide-react';

function App() {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [username, setUsername] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // --- Search & Stats ---
  const [activeUsers, setActiveUsers] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)

  // --- Image Upload ---
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // --- UI States ---
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // --- 1. SETUP & REALTIME ---
  useEffect(() => {
    if (!isLoggedIn) return;

    fetchMessages()

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        handleRealtimeEvent(payload)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setActiveUsers(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: username, online_at: new Date().toISOString() })
        }
      })

    return () => { supabase.removeChannel(channel) }
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

    const matches = messages
      .filter(msg => 
        (msg.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.username.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map(msg => msg.id)

    setSearchMatches(matches)
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1)
  }, [searchTerm, messages])

  useEffect(() => {
    if (currentMatchIndex >= 0 && searchMatches.length > 0) {
      const matchId = searchMatches[currentMatchIndex]
      document.getElementById(`msg-${matchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentMatchIndex])

  // --- 3. DATA HANDLERS ---
  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) console.error('Error:', error)
    else setMessages(data)
  }

  const handleRealtimeEvent = (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload
    setMessages((prev) => {
      if (eventType === 'INSERT') return [...prev, newRow]
      if (eventType === 'UPDATE') return prev.map(msg => (msg.id === newRow.id ? newRow : msg))
      if (eventType === 'DELETE') return prev.filter(msg => msg.id !== oldRow.id)
      return prev
    })
  }

  // --- 4. ACTIONS (SUBMIT & DELETE) ---

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputText.trim() && !selectedFile) return

    // HANDLE EDIT
    if (editingId) {
      await supabase.from('messages').update({ content: inputText, is_edited: true }).eq('id', editingId)
      cancelAction()
      return
    }

    let imageUrl = null

    // HANDLE IMAGE UPLOAD
    if (selectedFile) {
      setIsUploading(true)
      try {
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('chat_images')
          .upload(fileName, selectedFile)

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('chat_images').getPublicUrl(fileName)
        imageUrl = data.publicUrl
      } catch (error) {
        alert('Upload failed: ' + error.message)
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }

    // INSERT MESSAGE
    const { error } = await supabase.from('messages').insert([{ 
      username, 
      content: inputText, 
      reply_to_id: replyTo?.id || null,
      image_url: imageUrl
    }])

    if (!error) cancelAction()
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this message permanently?")) return

    try {
      const msgToDelete = messages.find(m => m.id === id)
      
      // FIX: Also delete from Storage if an image exists
      if (msgToDelete?.image_url) {
        const urlParts = msgToDelete.image_url.split('/')
        const fileName = urlParts[urlParts.length - 1]
        
        await supabase.storage
          .from('chat_images')
          .remove([fileName])
      }

      // Delete from DB
      await supabase.from('messages').delete().eq('id', id)

      // Cleanup local UI states
      if (replyTo?.id === id) setReplyTo(null)
      if (editingId === id) cancelAction()
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }

  const deleteAllConversations = async () => {
    if (!confirm("⚠️ DELETE ALL? This wipes the database and storage records.")) return
    
    // Note: This logic only deletes DB rows. In a production app, 
    // you'd need an Edge Function to loop and delete all storage files.
    const { error } = await supabase.from('messages').delete().neq('id', -1)
    if (error) alert("Check RLS policies")
  }

  const cancelAction = () => {
    setReplyTo(null)
    setEditingId(null)
    setInputText('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- 5. RENDER HELPERS ---
  const highlightText = (text) => {
    if (!text || !searchTerm.trim()) return text
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} className="search-highlight">{part}</mark> : part
    )
  }

  // --- 6. UI RENDER ---
  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2 style={{ color: '#008069' }}>Rayabaari Chat</h2>
          <input 
            type="text" 
            className="login-input" 
            placeholder="Username" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
          <button className="login-btn" onClick={() => username && setIsLoggedIn(true)}>Join Room</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="chat-header">
        <div className="header-top">
          <div className="logo-area">
            <h3>Rayabaari</h3>
            <span className="badge">{activeUsers} Active</span>
          </div>
          <span className="user-tag">{username}</span>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search chat..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <span className="search-count">
                {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
              </span>
            )}
          </div>
          <button onClick={() => setCurrentMatchIndex(p => (p - 1 + searchMatches.length) % searchMatches.length)} disabled={!searchMatches.length}><ChevronUp size={18}/></button>
          <button onClick={() => setCurrentMatchIndex(p => (p + 1) % searchMatches.length)} disabled={!searchMatches.length}><ChevronDown size={18}/></button>
          <button className="danger-btn" onClick={deleteAllConversations}><Trash2 size={18}/></button>
        </div>
      </header>

      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          const isMatch = searchMatches[currentMatchIndex] === msg.id;

          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={`message-row ${isMe ? 'mine' : 'theirs'}`}>
              <div className={`bubble ${isMatch ? 'highlight-bubble' : ''}`}>
                
                {/* Reply Context */}
                {msg.reply_to_id && (
                  <div className="reply-quote">
                    <strong>{messages.find(m => m.id === msg.reply_to_id)?.username || 'Unknown'}</strong>
                    <p>{messages.find(m => m.id === msg.reply_to_id)?.content || '📷 Attachment'}</p>
                  </div>
                )}

                {!isMe && <span className="sender-name">{msg.username}</span>}
                
                {msg.image_url && <img src={msg.image_url} alt="Shared" className="chat-image" />}
                {msg.content && <div className="text-content">{highlightText(msg.content)}</div>}

                <div className="bubble-footer">
                  {msg.is_edited && <span className="edited-tag">edited</span>}
                  <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="msg-actions">
                    <button onClick={() => { setReplyTo(msg); setEditingId(null); }}><Reply size={14}/></button>
                    {isMe && (
                      <>
                        <button onClick={() => { setEditingId(msg.id); setInputText(msg.content); }}><Edit size={14}/></button>
                        <button onClick={() => handleDelete(msg.id)} className="delete-icon"><Trash2 size={14}/></button>
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

      <div className="footer-container">
        {(replyTo || editingId) && (
          <div className="action-banner">
            <span>{editingId ? "Editing message..." : `Replying to ${replyTo.username}`}</span>
            <button onClick={cancelAction}><X size={16}/></button>
          </div>
        )}

        {selectedFile && (
          <div className="preview-banner">
            <span>📎 {selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)}><X size={16}/></button>
          </div>
        )}

        <form className="input-form" onSubmit={handleSubmit}>
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
          {!editingId && (
            <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()}>
              <Paperclip size={20}/>
            </button>
          )}
          <textarea 
            className="chat-input" 
            placeholder="Type here..." 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }}}
          />
          <button type="submit" className="send-btn" disabled={isUploading}>
            {isUploading ? <div className="spinner" /> : <Send size={20}/>}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
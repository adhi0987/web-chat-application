import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

import { 
  Paperclip, Send, Edit, Trash2, Reply, 
  ChevronUp, ChevronDown, X, Download, Share2, FileText 
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

  // --- File Upload ---
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // --- UI States ---
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, type: null })
  const [activeUserList, setActiveUserList] = useState([])
  const [presenceModalOpen, setPresenceModalOpen] = useState(false) // RESTORED
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
        const values = Object.values(state || {})
        const names = values.flatMap((v) => {
          if (!v) return []
          if (Array.isArray(v)) return v.map(p => p?.user).filter(Boolean)
          if (typeof v === 'object') {
            if (v.user) return [v.user]
            return Object.values(v).flatMap(x => x?.user ? [x.user] : [])
          }
          return []
        })
        const unique = [...new Set(names)]
        setActiveUsers(unique.length)
        setActiveUserList(unique)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: username, online_at: new Date().toISOString() })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [isLoggedIn])

  useEffect(() => {
    if (!editingId && !replyTo && !searchTerm) scrollToBottom()
  }, [messages.length])

  // --- 2. SEARCH & DATA ---
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

  const fetchMessages = async () => {
    const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
    if (!error) setMessages(data)
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

  // --- 3. ACTIONS (UPLOAD, SHARE, DOWNLOAD) ---
  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputText.trim() && !selectedFile) return

    if (editingId) {
      await supabase.from('messages').update({ content: inputText, is_edited: true }).eq('id', editingId)
      cancelAction()
      return
    }

    let fileUrl = null
    if (selectedFile) {
      setIsUploading(true)
      try {
        const fileExt = selectedFile.name.split('.').pop().toLowerCase()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        
        let bucket = 'chat_images'
        if (selectedFile.type.startsWith('video/')) bucket = 'chat_videos'
        else if (selectedFile.type === 'application/pdf') bucket = 'chat_pdfs'

        const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, selectedFile)
        if (uploadError) throw uploadError

        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
        fileUrl = data.publicUrl
      } catch (error) {
        alert('Upload failed: ' + error.message)
      }
      setIsUploading(false)
    }

    const { error } = await supabase.from('messages').insert([{ 
      username, 
      content: inputText, 
      reply_to_id: replyTo?.id || null,
      image_url: fileUrl 
    }])
    if (!error) cancelAction()
  }

  const handleDownload = async (url, originalName) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = originalName || 'downloaded-file'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) { alert("Download failed") }
  }

  const handleShare = (url) => {
    navigator.clipboard.writeText(url)
    alert("Link copied to clipboard!")
  }

  const cancelAction = () => {
    setReplyTo(null)
    setEditingId(null)
    setInputText('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- 4. RENDER HELPERS ---
  const renderMedia = (url) => {
    if (!url) return null
    const ext = url.split('.').pop().toLowerCase()
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return (
        <div className="media-container">
          <img src={url} alt="Shared" className="chat-image" />
          <div className="media-overlay">
            <button onClick={() => handleDownload(url, `img-${Date.now()}.${ext}`)}><Download size={16}/></button>
            <button onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }
    
    if (['mp4', 'webm', 'mov'].includes(ext)) {
      return (
        <div className="media-container">
          <video src={url} controls className="chat-video" />
          <div className="media-overlay always-visible">
            <button onClick={() => handleDownload(url, `vid-${Date.now()}.${ext}`)}><Download size={16}/></button>
            <button onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }

    if (ext === 'pdf') {
      return (
        <div className="pdf-attachment">
          <div className="pdf-info"><FileText size={24} color="#f40f0f" /><span>Document.pdf</span></div>
          <div className="pdf-actions">
            <button onClick={() => window.open(url, '_blank')}>View</button>
            <button onClick={() => handleDownload(url, 'document.pdf')}><Download size={16}/></button>
            <button onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }
    return <a href={url} target="_blank" rel="noreferrer">File Attachment</a>
  }

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2 style={{ color: '#008069' }}>Rayabaari Chat</h2>
          <input type="text" className="login-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
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
            {/* RESTORED BADGE ACTION */}
            <span className="badge" onClick={() => setPresenceModalOpen(true)} title="View active users">{activeUsers} Active</span>
          </div>
          <span className="user-tag">{username}</span>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button onClick={() => setCurrentMatchIndex(p => (p - 1 + searchMatches.length) % searchMatches.length)} disabled={!searchMatches.length}><ChevronUp size={18}/></button>
          <button onClick={() => setCurrentMatchIndex(p => (p + 1) % searchMatches.length)} disabled={!searchMatches.length}><ChevronDown size={18}/></button>
          <button className="danger-btn" onClick={() => setDeleteModal({ open: true, id: null, type: 'all' })}><Trash2 size={18}/></button>
        </div>
      </header>

      <div className="messages-list">
        {messages.map((msg) => (
          <div key={msg.id} id={`msg-${msg.id}`} className={`message-row ${msg.username === username ? 'mine' : 'theirs'}`}>
            <div className={`bubble ${searchMatches[currentMatchIndex] === msg.id ? 'highlight-bubble' : ''}`}>
              {msg.reply_to_id && <div className="reply-quote"><p>Replying to message...</p></div>}
              {msg.username !== username && <span className="sender-name">{msg.username}</span>}
              {renderMedia(msg.image_url)}
              {msg.content && <div className="text-content">{msg.content}</div>}
              <div className="bubble-footer">
                <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="msg-actions">
                  <button onClick={() => setReplyTo(msg)}><Reply size={14}/></button>
                  {msg.username === username && <button onClick={() => { setEditingId(msg.id); setInputText(msg.content); }}><Edit size={14}/></button>}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="footer-container">
        <form className="input-form" onSubmit={handleSubmit}>
          <input type="file" accept="image/*,video/*,application/pdf" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
          <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()}><Paperclip size={20}/></button>
          <textarea className="chat-input" placeholder="Type here..." value={inputText} onChange={(e) => setInputText(e.target.value)} />
          <button type="submit" className="send-btn" disabled={isUploading}>{isUploading ? <div className="spinner" /> : <Send size={20}/>}</button>
        </form>
      </div>

      {/* RESTORED PRESENCE MODAL */}
      {presenceModalOpen && (
        <div className="modal-overlay" onClick={() => setPresenceModalOpen(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Active Users ({activeUserList.length})</h4>
            <div className="presence-list">
              {activeUserList.length === 0 ? <p>No active users</p> : activeUserList.map((u, i) => <div key={i} className="presence-item">{u}</div>)}
            </div>
            <div className="modal-actions"><button onClick={() => setPresenceModalOpen(false)} className="btn">Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
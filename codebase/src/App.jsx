import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

import { 
  Paperclip, Send, Edit, Trash2, Reply, 
  ChevronUp, ChevronDown, X, Download, Share2, FileText, Video, ImageIcon
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
  const [presenceModalOpen, setPresenceModalOpen] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

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

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0])
    }
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
    let fileType = null

    if (selectedFile) {
      setIsUploading(true)
      try {
        const fileExt = selectedFile.name.split('.').pop().toLowerCase()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        
        // Determine Bucket based on type
        let bucket = 'chat_images'
        fileType = 'image'
        if (selectedFile.type.startsWith('video/')) {
          bucket = 'chat_videos'
          fileType = 'video'
        } else if (selectedFile.type === 'application/pdf') {
          bucket = 'chat_pdfs'
          fileType = 'pdf'
        }

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, selectedFile)

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
        fileUrl = data.publicUrl
      } catch (error) {
        alert('Upload failed: ' + error.message)
        setIsUploading(false)
        return
      }
      setIsUploading(false)
    }

    // Note: If you haven't added a 'file_type' column to your messages table, 
    // it will still work but won't store the type explicitly. 
    // I'm using image_url as the general purpose file_url here for compatibility.
    const { error } = await supabase.from('messages').insert([{ 
      username, 
      content: inputText, 
      reply_to_id: replyTo?.id || null,
      image_url: fileUrl // reusing image_url column as a general file_url
    }])

    if (!error) cancelAction()
  }

  // --- SHARE & DOWNLOAD HELPERS ---
  const handleDownload = async (url, fileName) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName || 'download'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert("Download failed")
    }
  }

  const handleShare = (url) => {
    navigator.clipboard.writeText(url)
    alert("Link copied to clipboard!")
  }

  const confirmDelete = async () => {
    try {
      if (deleteModal.type === 'single') {
        const id = deleteModal.id
        const msgToDelete = messages.find(m => m.id === id)
        if (msgToDelete?.image_url) {
          // Detect bucket from URL
          const url = msgToDelete.image_url
          const bucket = url.includes('chat_videos') ? 'chat_videos' : url.includes('chat_pdfs') ? 'chat_pdfs' : 'chat_images'
          const fileName = url.split('/').pop()
          await supabase.storage.from(bucket).remove([fileName])
        }
        await supabase.from('messages').delete().eq('id', id)
      } else if (deleteModal.type === 'all') {
        await supabase.from('messages').delete().neq('id', -1)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleteModal({ open: false, id: null, type: null })
    }
  }

  const handleDelete = (id) => setDeleteModal({ open: true, id, type: 'single' })
  const cancelDelete = () => setDeleteModal({ open: false, id: null, type: null })
  const cancelAction = () => {
    setReplyTo(null)
    setEditingId(null)
    setInputText('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const highlightText = (text) => {
    if (!text || !searchTerm.trim()) return text
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} className="search-highlight">{part}</mark> : part
    )
  }

  // Helper to render media content
  const renderMedia = (url) => {
    if (!url) return null
    const ext = url.split('.').pop().toLowerCase()
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return (
        <div className="media-container">
          <img src={url} alt="Shared" className="chat-image" />
          <div className="media-overlay">
            <button title="Download" onClick={() => handleDownload(url, `image.${ext}`)}><Download size={16}/></button>
            <button title="Share" onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }
    
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      return (
        <div className="media-container">
          <video src={url} controls className="chat-video" />
          <div className="media-overlay always-visible">
            <button title="Download" onClick={() => handleDownload(url, `video.${ext}`)}><Download size={16}/></button>
            <button title="Share" onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }

    if (ext === 'pdf') {
      return (
        <div className="pdf-attachment">
          <div className="pdf-info">
            <FileText size={24} color="#f40f0f" />
            <span>Document.pdf</span>
          </div>
          <div className="pdf-actions">
            <button onClick={() => window.open(url, '_blank')}>View</button>
            <button onClick={() => handleDownload(url, 'document.pdf')}><Download size={16}/></button>
            <button onClick={() => handleShare(url)}><Share2 size={16}/></button>
          </div>
        </div>
      )
    }

    return <a href={url} target="_blank" rel="noreferrer">Attached File</a>
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
            <span className="badge" onClick={() => setPresenceModalOpen(true)}>{activeUsers} Active</span>
          </div>
          <span className="user-tag">{username}</span>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && <span className="search-count">{searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}</span>}
          </div>
          <button onClick={() => setCurrentMatchIndex(p => (p - 1 + searchMatches.length) % searchMatches.length)} disabled={!searchMatches.length}><ChevronUp size={18}/></button>
          <button onClick={() => setCurrentMatchIndex(p => (p + 1) % searchMatches.length)} disabled={!searchMatches.length}><ChevronDown size={18}/></button>
          <button className="danger-btn" onClick={() => setDeleteModal({ open: true, id: null, type: 'all' })}><Trash2 size={18}/></button>
        </div>
      </header>

      <div className="messages-list">
        {messages.map((msg) => {
          const isMe = msg.username === username;
          const isMatch = searchMatches[currentMatchIndex] === msg.id;
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={`message-row ${isMe ? 'mine' : 'theirs'}`}>
              <div className={`bubble ${isMatch ? 'highlight-bubble' : ''}`}>
                {msg.reply_to_id && (
                  <div className="reply-quote">
                    <strong>{messages.find(m => m.id === msg.reply_to_id)?.username || 'Unknown'}</strong>
                    <p>{messages.find(m => m.id === msg.reply_to_id)?.content || '📎 Attachment'}</p>
                  </div>
                )}
                {!isMe && <span className="sender-name">{msg.username}</span>}
                
                {renderMedia(msg.image_url)}
                
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
            <span>{editingId ? "Editing..." : `Replying to ${replyTo.username}`}</span>
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
          {/* Changed accept to support images, videos, and pdfs */}
          <input 
            type="file" 
            accept="image/*,video/*,application/pdf" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            style={{ display: 'none' }} 
          />
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

      {deleteModal.open && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <h4>{deleteModal.type === 'all' ? 'Delete All?' : 'Delete Message?'}</h4>
            <div className="modal-actions">
              <button onClick={cancelDelete} className="btn">Cancel</button>
              <button onClick={confirmDelete} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
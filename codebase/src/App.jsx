import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import CryptoJS from 'crypto-js'
import './App.css'

import { 
  Paperclip, Send, Edit, Trash2, Reply, 
  ChevronUp, ChevronDown, X, Download, FileText, ArrowLeft
} from 'lucide-react';

// Secure key for encryption/decryption
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

function App() {
  // --- Navigation & Auth States ---
  const [view, setView] = useState('login'); // 'login', 'chat', 'room-creator'
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [secretCode, setSecretCode] = useState('')
  const [roomName, setRoomName] = useState('')
  const [loginError, setLoginError] = useState('')

  // --- Core Data States ---
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [roomsList, setRoomsList] = useState([])

  // --- Search & Stats ---
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [activeUsers, setActiveUsers] = useState(0)
  const [activeUserList, setActiveUserList] = useState([])

  // --- UI & Interaction States ---
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, type: null })
  const [presenceModalOpen, setPresenceModalOpen] = useState(false)
  
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  // --- 1. DEBUGGING & UTILITY HELPERS ---
  const encryptData = (text) => {
    if (!text) return '';
    try {
      return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
    } catch (e) {
      console.error("Encryption error:", e);
      return text;
    }
  };

  const decryptData = (cipherText) => {
    if (!cipherText) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      if (!originalText) throw new Error("Decryption returned empty string");
      return originalText;
    } catch (e) {
      return "[Encrypted Content]";
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages])

  // --- 2. AUTHENTICATION (LOGIN) ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");

    try {
      const { data: rooms, error } = await supabase.from('rooms').select('*');
      if (error) throw error;

      const matchedRoom = rooms.find(r => {
        const decryptedStored = decryptData(r.secret_code);
        return decryptedStored === secretCode || r.secret_code === secretCode;
      });

      if (matchedRoom) {
        setRoomName(matchedRoom.room_name);
        setIsLoggedIn(true);
        setView('chat');
      } else {
        setLoginError("Invalid Secret Code.");
      }
    } catch (err) {
      setLoginError("Connection failed.");
    }
  };

  // --- 3. DATA FETCHING & REAL-TIME ---
  useEffect(() => {
    if (!isLoggedIn || view !== 'chat') return;

    fetchMessages();

    // Use unique channel per secret code for better isolation
    const channel = supabase
      .channel(`room-${secretCode.substring(0, 8)}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'messages',
        filter: `room_secret_code=eq.${secretCode}` 
      }, (payload) => {
        handleRealtimeEvent(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const names = Object.values(state || {}).flatMap(v => v.map(p => p.user)).filter(Boolean);
        const unique = [...new Set(names)];
        setActiveUsers(unique.length);
        setActiveUserList(unique);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user: username, online_at: new Date().toISOString() });
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [isLoggedIn, view, secretCode]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_secret_code', secretCode)
      .order('created_at', { ascending: true });
    
    if (!error) {
      const decrypted = data.map(msg => ({
        ...msg,
        content: decryptData(msg.content)
      }));
      setMessages(decrypted);
    }
  };

  const handleRealtimeEvent = (payload) => {
    const { eventType, new: newRow, old: oldRow } = payload;
    setMessages((prev) => {
      if (eventType === 'INSERT') {
        const exists = prev.find(m => m.id === newRow.id);
        if (exists) return prev;
        return [...prev, { ...newRow, content: decryptData(newRow.content) }];
      }
      if (eventType === 'UPDATE') {
        return prev.map(m => m.id === newRow.id ? { ...newRow, content: decryptData(newRow.content) } : m);
      }
      if (eventType === 'DELETE') {
        return prev.filter(m => m.id !== oldRow.id);
      }
      return prev;
    });
  };

  // --- 4. SEARCH LOGIC ---
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches = messages
      .filter(msg => 
        (msg.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.username.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map(msg => msg.id);

    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [searchTerm, messages]);

  useEffect(() => {
    if (currentMatchIndex >= 0 && searchMatches.length > 0) {
      const matchId = searchMatches[currentMatchIndex];
      document.getElementById(`msg-${matchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex]);

  // --- 5. CHAT ACTIONS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    // Redirection Trigger for Admin
    if (inputText.trim() === "new room creator page") {
      setInputText('');
      fetchRoomsForAdmin();
      setView('room-creator');
      return;
    }

    if (editingId) {
      await supabase.from('messages')
        .update({ content: encryptData(inputText), is_edited: true })
        .eq('id', editingId);
      cancelAction();
      return;
    }

    let fileUrl = null;
    if (selectedFile) {
      setIsUploading(true);
      try {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        let bucket = 'chat_images';
        if (selectedFile.type.startsWith('video/')) bucket = 'chat_videos';
        else if (selectedFile.type === 'application/pdf') bucket = 'chat_pdfs';
        
        const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, selectedFile);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
        fileUrl = data.publicUrl;
      } catch (err) { 
        alert('Upload failed: ' + err.message); 
      }
      setIsUploading(false);
    }

    const { error } = await supabase.from('messages').insert([{ 
      username, 
      content: encryptData(inputText), 
      room_secret_code: secretCode,
      reply_to_id: replyTo?.id || null,
      image_url: fileUrl 
    }]);

    if (!error) cancelAction();
  };

  const confirmDelete = async () => {
    try {
      if (deleteModal.type === 'single') {
        const msg = messages.find(m => m.id === deleteModal.id);
        if (msg?.image_url) {
          const url = msg.image_url;
          const bucket = url.includes('chat_videos') ? 'chat_videos' : url.includes('chat_pdfs') ? 'chat_pdfs' : 'chat_images';
          const fileName = url.split('/').pop();
          await supabase.storage.from(bucket).remove([fileName]);
        }
        await supabase.from('messages').delete().eq('id', deleteModal.id);
      } else {
        await supabase.from('messages').delete().eq('room_secret_code', secretCode);
      }
    } catch (err) { console.error("Delete error:", err); }
    finally { setDeleteModal({ open: false, id: null, type: null }); }
  };

  const cancelAction = () => {
    setReplyTo(null);
    setEditingId(null);
    setInputText('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fetchRoomsForAdmin = async () => {
    const { data } = await supabase.from('rooms').select('*');
    if (data) {
      setRoomsList(data.map(r => ({
        ...r,
        secret_code: decryptData(r.secret_code)
      })));
    }
  };

  const createNewRoom = async (e) => {
    e.preventDefault();
    const name = e.target.roomName.value;
    const code = e.target.roomCode.value;
    const { error } = await supabase.from('rooms').insert([{
      room_name: name,
      secret_code: encryptData(code)
    }]);
    if (!error) { e.target.reset(); fetchRoomsForAdmin(); }
  };

  // --- 6. RENDER HELPERS ---
  const highlightText = (text) => {
    if (!text || !searchTerm.trim()) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchTerm.toLowerCase() 
        ? <mark key={i} style={{backgroundColor: '#ffd700', borderRadius: '2px'}}>{part}</mark> : part
    );
  };

  const renderMedia = (url) => {
    if (!url) return null;
    const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
    const isPdf = url.toLowerCase().endsWith('.pdf');

    return (
      <div className="media-preview">
        {isVideo ? (
          <div className="video-container">
            <video controls className="chat-video">
              <source src={url} />
            </video>
            <a href={url} target="_blank" download className="media-download-btn">
              <Download size={14} /> Download Video
            </a>
          </div>
        ) : isPdf ? (
          <div className="file-attachment pdf">
            <FileText size={24} />
            <div className="file-info">
              <span>Document.pdf</span>
              <a href={url} target="_blank" rel="noreferrer">View / Download</a>
            </div>
          </div>
        ) : (
          <div className="image-container">
            <img src={url} className="chat-image" alt="shared" loading="lazy" />
            <a href={url} target="_blank" download className="image-overlay-btn">
              <Download size={16} />
            </a>
          </div>
        )}
      </div>
    );
  };

  // --- 7. VIEWS ---

  if (view === 'login') {
    return (
      <div className="login-container">
        <form className="login-card" onSubmit={handleLogin}>
          <h2 style={{ color: '#008069' }}>Rayabaari Secure Chat</h2>
          <input required type="text" className="login-input" placeholder="Display Name" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input required type="password" className="login-input" placeholder="Secret Access Code" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} />
          {loginError && <p style={{color: '#ff4d4d', fontSize: '13px', margin: '10px 0'}}>{loginError}</p>}
          <button type="submit" className="login-btn">Join Conversation</button>
        </form>
      </div>
    );
  }

  if (view === 'room-creator') {
    return (
      <div className="admin-container" style={{padding: '20px', maxWidth: '800px', margin: '0 auto'}}>
        <header className="chat-header" style={{borderRadius: '10px', marginBottom: '20px'}}>
           <div className="header-top">
              <button className="back-btn" onClick={() => setView('chat')} style={{background: 'none', border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                <ArrowLeft size={18}/> Back to Chat
              </button>
              <h3 style={{textTransform: 'capitalize', color: 'white'}}>Admin Management</h3>
           </div>
        </header>
        <form className="add-room-form" onSubmit={createNewRoom} style={{ gap: '10px', marginBottom: '30px'}}>
          <label htmlFor="roomName">Room name</label>
          <input name="roomName" className="login-input" placeholder="Room Name" required style={{flex: 1}} />
          <label htmlFor="roomCode">Room code</label>
          <input name="roomCode" className="login-input" placeholder="New Secret Code" required style={{flex: 1}} />
          <button type="submit" className="login-btn" style={{padding: '10px 25px',width:'50%',margin:'0px 25%'}}>Submit</button>
        </form>
        <table style={{width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden'}}>
          <thead style={{background: '#008069', color: 'white'}}>
            <tr><th style={{padding: '12px', textAlign: 'left'}}>Room Name</th><th style={{padding: '12px', textAlign: 'left'}}>Decrypted Code</th></tr>
          </thead>
          <tbody>
            {roomsList.map((r, i) => (
              <tr key={i} style={{borderBottom: '1px solid #eee'}}>
                <td style={{padding: '12px'}}>{r.room_name}</td>
                <td style={{padding: '12px', fontFamily: 'monospace'}}>{r.secret_code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="chat-header">
        <div className="header-top">
          <div className="logo-area">
            <h3 style={{textTransform: 'capitalize'}}>{roomName}</h3>
            <span className="badge" onClick={() => setPresenceModalOpen(true)}>{activeUsers} Online</span>
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
          <button className="danger-btn" onClick={() => setDeleteModal({ open: true, id: null, type: 'all' })} title="Clear Room History"><Trash2 size={18}/></button>
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
                    <strong>{messages.find(m => m.id === msg.reply_to_id)?.username || 'User'}</strong>
                    <p>{messages.find(m => m.id === msg.reply_to_id)?.content || '📎 Attachment'}</p>
                  </div>
                )}
                {!isMe && <span className="sender-name">{msg.username}</span>}
                
                {renderMedia(msg.image_url)}

                {msg.content && <div className="text-content">{highlightText(msg.content)}</div>}
                
                <div className="bubble-footer">
                  <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="msg-actions">
                    <button onClick={() => setReplyTo(msg)} title="Reply"><Reply size={14}/></button>
                    {isMe && (
                      <>
                        <button onClick={() => { setEditingId(msg.id); setInputText(msg.content); }} title="Edit"><Edit size={14}/></button>
                        <button onClick={() => setDeleteModal({ open: true, id: msg.id, type: 'single' })} className="delete-icon" title="Delete"><Trash2 size={14}/></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="footer-container">
        {(replyTo || editingId) && (
          <div className="action-banner">
            <span>{editingId ? "Editing Message..." : `Replying to ${replyTo.username}`}</span>
            <button onClick={cancelAction}><X size={16}/></button>
          </div>
        )}
        {selectedFile && (
          <div className="preview-banner">
            <span>📎 {selectedFile.name} ({(selectedFile.size/1024).toFixed(1)} KB)</span>
            <button onClick={() => setSelectedFile(null)}><X size={16}/></button>
          </div>
        )}
        <form className="input-form" onSubmit={handleSubmit}>
          <input type="file" ref={fileInputRef} onChange={(e) => setSelectedFile(e.target.files[0])} style={{ display: 'none' }} />
          <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()}><Paperclip size={20}/></button>
          <textarea 
            className="chat-input" 
            placeholder="Type a message..." 
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
            <h4>{deleteModal.type === 'all' ? 'Clear all messages?' : 'Delete this message?'}</h4>
            <div className="modal-actions">
              <button onClick={() => setDeleteModal({ open: false, id: null, type: null })} className="btn">Cancel</button>
              <button onClick={confirmDelete} className="btn btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      {presenceModalOpen && (
        <div className="modal-overlay" onClick={() => setPresenceModalOpen(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Online ({activeUserList.length})</h4>
            <div className="presence-list">{activeUserList.map((u, i) => <div key={i} className="presence-item">{u}</div>)}</div>
            <div className="modal-actions"><button onClick={() => setPresenceModalOpen(false)} className="btn">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
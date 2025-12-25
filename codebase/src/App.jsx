import { useState, useEffect } from 'react';
import { supabase } from './services/supabase';
import { encryptData } from './services/crypto';
import { useChat } from './hooks/useChat';
import { useSearch } from './hooks/useSearch';

import Header from './components/layout/Header';
import MessageList from './components/chat/MessageList';
import MessageInput from './components/chat/MessageInput';
import Login from './components/auth/Login';
import RoomManager from './components/admin/RoomManager';
import Modal from './components/ui/Modal';
import './App.css';

function App() {
  const [view, setView] = useState('login');
  const [user, setUser] = useState({ username: '', secretCode: '', roomName: '' });
  
  // UI Interaction states
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, type: null });
  const [presenceOpen, setPresenceOpen] = useState(false);

  const { messages, activeUsers, activeUserList } = useChat(user.secretCode, user.username);
  const searchProps = useSearch(messages);

  // Scroll to search match logic
  useEffect(() => {
    if (searchProps.currentMatchIndex >= 0) {
      const matchId = searchProps.searchMatches[searchProps.currentMatchIndex];
      document.getElementById(`msg-${matchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchProps.currentMatchIndex]);

 const handleSendMessage = async (text, file) => {
    console.log("[App] Attempting to send message...");
    
    if (editingId) {
      const { error } = await supabase.from('messages')
        .update({ content: encryptData(text), is_edited: true })
        .eq('id', editingId);
      if (error) console.error("[App] Update Error:", error.message);
      setEditingId(null);
      return;
    }

    let fileUrl = null;
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const bucket = file.type.startsWith('video/') ? 'chat_videos' : file.type === 'application/pdf' ? 'chat_pdfs' : 'chat_images';
      
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, file);
      if (!error) {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        fileUrl = publicData.publicUrl;
      }
    }

    const { error } = await supabase.from('messages').insert([{
      username: user.username,
      content: encryptData(text),
      room_secret_code: user.secretCode,
      reply_to_id: replyTo?.id || null,
      image_url: fileUrl
    }]);

    if (error) {
      console.error("[App] Insert Error:", error.message);
      alert("Failed to send message: " + error.message);
    } else {
      console.log("[App] Message inserted successfully");
    }
    
    setReplyTo(null);
  };

  const confirmDelete = async () => {
    if (deleteModal.type === 'single') {
      await supabase.from('messages').delete().eq('id', deleteModal.id);
    } else {
      await supabase.from('messages').delete().eq('room_secret_code', user.secretCode);
    }
    setDeleteModal({ open: false, id: null, type: null });
  };

  if (view === 'login') return <Login onLoginSuccess={(d) => { setUser(d); setView('chat'); }} />;
  if (view === 'room-creator') return <RoomManager onBack={() => setView('chat')} />;

  return (
    <div className="app-container">
      <Header 
        roomName={user.roomName} 
        activeUsers={activeUsers} 
        username={user.username}
        onPresenceClick={() => setPresenceOpen(true)}
        searchProps={searchProps}
        onClearHistory={() => setDeleteModal({ open: true, id: null, type: 'all' })}
      />

      <MessageList 
        messages={messages} 
        username={user.username} 
        searchMatches={searchProps.searchMatches}
        currentMatchIndex={searchProps.currentMatchIndex}
        onReply={setReplyTo}
        onEdit={(msg) => setEditingId(msg.id)}
        onDelete={(id) => setDeleteModal({ open: true, id, type: 'single' })}
      />

      <MessageInput 
        onSendMessage={handleSendMessage} 
        onTriggerAdmin={() => setView('room-creator')}
        replyTo={replyTo}
        editingId={editingId}
        onCancelAction={() => { setReplyTo(null); setEditingId(null); }}
      />

      {/* Modals */}
      {deleteModal.open && (
        <Modal 
          title={deleteModal.type === 'all' ? 'Clear history?' : 'Delete message?'}
          onClose={() => setDeleteModal({ open: false, id: null, type: null })}
          footerActions={<>
            <button className="btn" onClick={() => setDeleteModal({ open: false })}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
          </>}
        />
      )}

      {presenceOpen && (
        <Modal title={`Online (${activeUserList.length})`} onClose={() => setPresenceOpen(false)}>
          <div className="presence-list">
            {activeUserList.map((u, i) => <div key={i} className="presence-item">{u}</div>)}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;
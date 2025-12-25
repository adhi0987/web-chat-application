import { useState, useRef } from 'react';
import { Paperclip, Send, X } from 'lucide-react';

export default function MessageInput({ onSendMessage, onTriggerAdmin, replyTo, onCancelReply }) {
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // KEEPING SECRET TRIGGER AS REQUESTED
    if (inputText.trim() === "new room creator page") {
      setInputText('');
      onTriggerAdmin();
      return;
    }

    if (!inputText.trim() && !selectedFile) return;
    
    onSendMessage(inputText, selectedFile);
    setInputText('');
    setSelectedFile(null);
  };

  return (
    <div className="footer-container">
      {replyTo && (
        <div className="action-banner">
          <span>Replying to {replyTo.username}</span>
          <button onClick={onCancelReply}><X size={16} /></button>
        </div>
      )}
      <form className="input-form" onSubmit={handleSubmit}>
        <input type="file" ref={fileInputRef} hidden onChange={(e) => setSelectedFile(e.target.files[0])} />
        <button type="button" className="attach-btn" onClick={() => fileInputRef.current.click()}><Paperclip size={20} /></button>
        <textarea
          className="chat-input"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button type="submit" className="send-btn"><Send size={20} /></button>
      </form>
    </div>
  );
}
import React from 'react';
import { Reply, Edit, Trash2, Download, FileText, Smile } from 'lucide-react';
import { toggleReaction } from '../../services/reactions';

const MessageItem = React.memo(({ msg, username, isMe, isMatch, onReply, onEdit, onDelete, parentMsg }) => {
  
  const handleReaction = (emoji) => {
    toggleReaction(msg.id, username, emoji);
  };

  // Groups identical emojis together for count (e.g., 👍 2)
  const reactionGroups = (msg.reactions || []).reduce((acc, curr) => {
    acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
    return acc;
  }, {});

  const renderMedia = (url) => {
    if (!url) return null;
    const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
    const isPdf = url.toLowerCase().endsWith('.pdf');

    return (
      <div className="media-preview">
        {isVideo ? (
          <video controls className="chat-video"><source src={url} /></video>
        ) : isPdf ? (
          <div className="file-attachment pdf">
            <FileText size={24} />
            <a href={url} target="_blank" rel="noreferrer">View PDF</a>
          </div>
        ) : (
          <div className="image-container">
            <img src={url} className="chat-image" alt="shared" loading="lazy" />
            <a href={url} target="_blank" download className="image-overlay-btn"><Download size={16} /></a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id={`msg-${msg.id}`} className={`message-row ${isMe ? 'mine' : 'theirs'}`}>
      <div className={`bubble ${isMatch ? 'highlight-bubble' : ''}`}>
        {parentMsg && (
          <div className="reply-quote">
            <strong>{parentMsg.username}</strong>
            <p>{parentMsg.content || '📎 Attachment'}</p>
          </div>
        )}
        {!isMe && <span className="sender-name">{msg.username}</span>}
        {renderMedia(msg.image_url)}
        {msg.content && <div className="text-content">{msg.content}</div>}
        
        {/* Reactions Display */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className="reactions-display">
            {Object.entries(reactionGroups).map(([emoji, count]) => (
              <span key={emoji} className="reaction-badge" onClick={() => handleReaction(emoji)}>
                {emoji} {count}
              </span>
            ))}
          </div>
        )}

        <div className="bubble-footer">
          <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="msg-actions">
            {/* Reaction Menu */}
            <div className="reaction-picker-container">
               <button className="icon-btn"><Smile size={14} /></button>
               <div className="reaction-menu">
                  {['👍', '❤️', '😂', '😮', '😢'].map(emoji => (
                    <button key={emoji} onClick={() => handleReaction(emoji)}>{emoji}</button>
                  ))}
               </div>
            </div>

            <button onClick={() => onReply(msg)}><Reply size={14} /></button>
            {isMe && (
              <>
                <button onClick={() => onEdit(msg)}><Edit size={14} /></button>
                <button onClick={() => onDelete(msg.id)} className="delete-icon"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default MessageItem;
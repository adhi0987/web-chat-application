import { Reply, Edit, Trash2, Download, FileText } from 'lucide-react';

export default function MessageItem({ msg, isMe, isMatch, onReply, onEdit, onDelete, parentMsg }) {
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
        <div className="bubble-footer">
          <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="msg-actions">
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
}
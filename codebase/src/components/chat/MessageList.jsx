// src/components/chat/MessageList.jsx
import { useEffect, useRef, useState } from 'react';
import MessageItem from './MessageItem';

export default function MessageList({ 
  messages, username, searchMatches, currentMatchIndex, 
  onReply, onEdit, onDelete, 
  loadMore, hasMore, isLoading 
}) {
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const [prevCount, setPrevCount] = useState(0);
  const lastScrollHeight = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const { scrollHeight, scrollTop } = containerRef.current;

    // Preserve scroll position when older messages are loaded at the TOP
    if (messages.length > prevCount && scrollTop < 100 && prevCount !== 0) {
      containerRef.current.scrollTop = scrollHeight - lastScrollHeight.current;
    } 
    // Scroll to bottom for brand new messages
    else if (messages.length > prevCount) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    lastScrollHeight.current = scrollHeight;
    setPrevCount(messages.length);
  }, [messages]);

  return (
    <div 
      className="messages-list" 
      ref={containerRef} 
      style={{ overflowY: 'auto', height: '100%', padding: '10px' }}
    >
      {hasMore && (
        <div className="load-more-container" style={{ textAlign: 'center', margin: '20px 0' }}>
          <button 
            className="btn-secondary" 
            onClick={loadMore} 
            disabled={isLoading}
            style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer' }}
          >
            {isLoading ? "Loading..." : "Load older chats"}
          </button>
        </div>
      )}

      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          username={username}
          isMe={msg.username === username}
          isMatch={searchMatches && searchMatches[currentMatchIndex] === msg.id}
          parentMsg={messages.find(m => String(m.id) === String(msg.reply_to_id))}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      <div ref={scrollRef} />
    </div>
  );
}
import { useEffect, useRef } from 'react';
import MessageItem from './MessageItem';

export default function MessageList({ messages, username, searchMatches, currentMatchIndex, onReply, onEdit, onDelete }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="messages-list">
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          isMe={msg.username === username}
          isMatch={searchMatches && searchMatches[currentMatchIndex] === msg.id}
          parentMsg={messages.find(m => m.id === msg.reply_to_id)}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      <div ref={scrollRef} />
    </div>
  );
}
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
          username={username}
          isMe={msg.username === username}
          isMatch={searchMatches && searchMatches[currentMatchIndex] === msg.id}
          // Use loose equality (==) for bigint IDs which might come as strings from Realtime
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
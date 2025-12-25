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

  console.debug && console.debug('MessageList render', { messagesLength: messages.length, prevCount, hasMore, isLoading });

  useEffect(() => {
    if (!containerRef.current) {
      console.debug && console.debug('MessageList useEffect: no containerRef');
      return;
    }

    const { scrollHeight, scrollTop } = containerRef.current;
    console.debug && console.debug('MessageList useEffect start', { messagesLength: messages.length, prevCount, scrollTop, scrollHeight, lastScrollHeight: lastScrollHeight.current });

    // CASE 1: Messages were added to the TOP (Pagination)
    if(scrollTop<50)
    {
        console.log("prevCount:", prevCount);
        console.log("messages.length:", messages.length);
    }
    if (messages.length >= prevCount && scrollTop < 50 && prevCount !== 0) {
      console.debug && console.debug('MessageList: pagination detected - preserving scroll position', { prevCount, newCount: messages.length });
      // Maintain scroll position so the list doesn't "jump"
      containerRef.current.scrollTop = scrollHeight - lastScrollHeight.current;
    } 
    // CASE 2: New message at the BOTTOM (Real-time)
    else if (messages.length > prevCount) {
      console.debug && console.debug('MessageList: new message at bottom - scrolling into view', { prevCount, newCount: messages.length });
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    lastScrollHeight.current = scrollHeight;
    setPrevCount(messages.length);
    console.debug && console.debug('MessageList useEffect end', { lastScrollHeight: lastScrollHeight.current, prevCount: messages.length });
  }, [messages, username]);

  const handleScroll = (e) => {
    const top = e.target.scrollTop;
    console.debug && console.debug('MessageList handleScroll', { scrollTop: top, hasMore, isLoading });
    // If scrolled to top and there's more to load
    if (top === 0 && hasMore && !isLoading) {
      console.debug && console.debug('MessageList: reached top, calling loadMore');
      loadMore();
    }
  };

  return (
    <div 
      className="messages-list" 
      ref={containerRef} 
      onScroll={handleScroll}
      style={{ overflowY: 'auto', height: '100%' }}
    >
      {hasMore && (
        <div className="load-more-status" style={{ textAlign: 'center', padding: '10px', color: '#888' }}>
          {isLoading ? "Loading older messages..." : "Scroll up to load more"}
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
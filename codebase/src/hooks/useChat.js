import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { decryptData } from '../services/crypto';

export function useChat(secretCode, username) {
  const [messages, setMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [activeUserList, setActiveUserList] = useState([]);
  
  // Pagination State
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef([]); // Used to access current messages inside callbacks without triggering re-renders
  const PAGE_SIZE = 50;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const fetchMessages = useCallback(async (isInitial = true) => {
    if (isLoading) return;
    setIsLoading(true);

    let query = supabase
      .from('messages')
      .select('*, reactions:message_reactions(*)')
      .eq('room_secret_code', secretCode)
      .order('created_at', { ascending: false }) // Newest first
      .limit(PAGE_SIZE);

    // If loading older messages, get records older than our oldest current message
    if (!isInitial && messagesRef.current.length > 0) {
      const oldestTimestamp = messagesRef.current[0].created_at;
      query = query.lt('created_at', oldestTimestamp);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Chat] Fetch Error:", error.message);
      setIsLoading(false);
      return;
    }

    const processed = data.map(msg => ({ 
      ...msg, 
      content: decryptData(msg.content),
      reactions: msg.reactions || [] 
    })).reverse(); // Reverse to display in ascending order (bottom-to-top)

    if (isInitial) {
      setMessages(processed);
    } else {
      setMessages(prev => [...processed, ...prev]);
    }

    setHasMore(data.length === PAGE_SIZE);
    setIsLoading(false);
  }, [secretCode]);

  useEffect(() => {
    if (!secretCode) return;

    fetchMessages(true);

    const channel = supabase
      .channel(`room-${secretCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `room_secret_code=eq.${secretCode}`
      }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        
        setMessages((prev) => {
          if (eventType === 'INSERT') {
            return [...prev, { ...newRow, content: decryptData(newRow.content), reactions: [] }];
          }
          if (eventType === 'UPDATE') {
            return prev.map(m => String(m.id) === String(newRow.id) 
              ? { ...newRow, content: decryptData(newRow.content), reactions: m.reactions } 
              : m
            );
          }
          if (eventType === 'DELETE') {
            return prev.filter(m => String(m.id) !== String(oldRow.id));
          }
          return prev;
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions'
      }, () => {
        // For reactions, we could re-fetch the visible range, 
        // but for now, we just refresh the latest to keep it simple.
        fetchMessages(true); 
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const names = Object.values(state || {}).flatMap(v => v.map(p => p.user)).filter(Boolean);
        const unique = [...new Set(names)];
        setActiveUsers(unique.length);
        setActiveUserList(unique);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user: username, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [secretCode, username, fetchMessages]);

  return { 
    messages, 
    activeUsers, 
    activeUserList, 
    loadMore: () => fetchMessages(false), 
    hasMore, 
    isLoading 
  };
}
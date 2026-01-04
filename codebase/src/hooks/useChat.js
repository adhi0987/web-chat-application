import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { decryptData } from '../services/crypto';

const PAGE_SIZE = 30;

export function useChat(secretCode, username) {
    const [messages, setMessages] = useState([]);
    const [activeUsers, setActiveUsers] = useState(0);
    const [activeUserList, setActiveUserList] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchMessages = useCallback(async (isLoadMore = false) => {
        if (!secretCode || isLoading) return;
        
        setIsLoading(true);
        console.log(`[Chat] Fetching messages... (LoadMore: ${isLoadMore})`);

        let query = supabase
            .from('messages')
            .select('*, reactions:message_reactions(*)')
            .eq('room_secret_code', secretCode)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE);

        if (isLoadMore && messages.length > 0) {
            const oldestTimestamp = messages[0].created_at;
            query = query.lt('created_at', oldestTimestamp);
        }

        const { data, error } = await query;

        if (error) {
            console.error("[Chat] Fetch Error:", error.message);
            setIsLoading(false);
            return;
        }

        const processed = data.reverse().map(msg => ({
            ...msg,
            content: decryptData(msg.content),
            reactions: msg.reactions || []
        }));

        if (isLoadMore) {
            setMessages(prev => [...processed, ...prev]);
        } else {
            setMessages(processed);
        }

        setHasMore(data.length === PAGE_SIZE);
        setIsLoading(false);
    }, [secretCode, messages, isLoading]);

    useEffect(() => {
        if (secretCode) {
            fetchMessages(false);
        }
    }, [secretCode]); 

    useEffect(() => {
        if (!secretCode) return;

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
                        // BROWSER NOTIFICATION LOGIC
                        // Notify only if the message is from someone else AND the tab is hidden
                        console.log("[chat]docment hidden status:", document.hidden); 
                        // if(!document.hidden) {
                        //     document.hidden = true; // FOR TESTING PURPOSES ONLY
                        // }
                        if (newRow.username !== username && document.hidden) {
                            if (Notification.permission === 'granted') {
                                const decrypted = decryptData(newRow.content);
                                new Notification(`New message from ${newRow.username}`, {
                                    body: decrypted,
                                    icon: '/logo_2.svg', // Assumes logo.svg is in public folder
                                    tag: 'chat-notification',
                                });
                            }
                        }

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
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const names = Object.values(state || {}).flatMap(v => v.map(p => p.user)).filter(Boolean);
                setActiveUsers([...new Set(names)].length);
                setActiveUserList([...new Set(names)]);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    channel.track({ user: username, online_at: new Date().toISOString() });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [secretCode, username]);

    const loadMore = () => fetchMessages(true);

    return { messages, activeUsers, activeUserList, isLoading, hasMore, loadMore };
}
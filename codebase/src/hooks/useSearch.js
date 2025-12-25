import { useState, useEffect } from 'react';

export function useSearch(messages) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches = messages
      .filter(msg =>
        (msg.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.username.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .map(msg => msg.id);

    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [searchTerm, messages]);

  const nextMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(prev => (prev + 1) % searchMatches.length);
    }
  };

  const prevMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(prev => (prev - 1 + searchMatches.length) % searchMatches.length);
    }
  };

  return {
    searchTerm,
    setSearchTerm,
    searchMatches,
    currentMatchIndex,
    nextMatch,
    prevMatch
  };
}
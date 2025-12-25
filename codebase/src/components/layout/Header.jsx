import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

export default function Header({ 
  roomName, 
  activeUsers, 
  username, 
  onPresenceClick, 
  searchProps,
  onClearHistory 
}) {
  const { searchTerm, setSearchTerm, searchMatches, currentMatchIndex, nextMatch, prevMatch } = searchProps;

  return (
    <header className="chat-header">
      <div className="header-top">
        <div className="logo-area">
          <h3>{roomName}</h3>
          <span className="badge" onClick={onPresenceClick}>{activeUsers} Online</span>
        </div>
        <span className="user-tag">{username}</span>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
          {searchTerm && (
            <span className="search-count">
              {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
            </span>
          )}
        </div>
        <button onClick={prevMatch} disabled={!searchMatches.length}><ChevronUp size={18} /></button>
        <button onClick={nextMatch} disabled={!searchMatches.length}><ChevronDown size={18} /></button>
        <button className="danger-btn" onClick={onClearHistory} title="Clear Room History">
          <Trash2 size={18} />
        </button>
      </div>
    </header>
  );
}
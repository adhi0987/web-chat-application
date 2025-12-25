import { useState } from 'react';
import { supabase } from '../../services/supabase';
import { decryptData } from '../../services/crypto';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const { data: rooms, error: fetchError } = await supabase.from('rooms').select('*');
      if (fetchError) throw fetchError;

      const matchedRoom = rooms.find(r => {
        const decryptedStored = decryptData(r.secret_code);
        return decryptedStored === secretCode || r.secret_code === secretCode;
      });

      if (matchedRoom) {
        onLoginSuccess({
          username,
          secretCode: secretCode,
          roomName: matchedRoom.room_name
        });
      } else {
        setError("Invalid Secret Code.");
      }
    } catch (err) {
      setError("Connection failed.");
    }
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleLogin}>
        <h2 style={{ color: '#008069' }}>Rayabaari Secure Chat</h2>
        <input 
          required 
          type="text" 
          className="login-input" 
          placeholder="Display Name" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
        />
        <input 
          required 
          type="password" 
          className="login-input" 
          placeholder="Secret Access Code" 
          value={secretCode} 
          onChange={(e) => setSecretCode(e.target.value)} 
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="login-btn">Join Conversation</button>
      </form>
    </div>
  );
}
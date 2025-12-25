import { useState, useEffect } from 'react';
import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { encryptData, decryptData } from '../../services/crypto';

export default function RoomManager({ onBack }) {
  const [roomsList, setRoomsList] = useState([]);
  const [editingRoom, setEditingRoom] = useState(null);

  const fetchRooms = async () => {
    const { data } = await supabase.from('rooms').select('*');
    if (data) {
      setRoomsList(data.map(r => ({
        ...r,
        secret_code: decryptData(r.secret_code)
      })));
    }
  };

  useEffect(() => { fetchRooms(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = e.target.roomName.value;
    const code = e.target.roomCode.value;

    if (editingRoom) {
      const { error } = await supabase
        .from('rooms')
        .update({ room_name: name, secret_code: encryptData(code) })
        .eq('room_name', editingRoom.room_name);
      if (!error) setEditingRoom(null);
    } else {
      await supabase.from('rooms').insert([{ room_name: name, secret_code: encryptData(code) }]);
    }
    
    e.target.reset();
    fetchRooms();
  };

  const handleDelete = async (room) => {
    if (window.confirm(`Delete "${room.room_name}" and all history?`)) {
      await supabase.from('messages').delete().eq('room_secret_code', room.secret_code);
      await supabase.from('rooms').delete().eq('room_name', room.room_name);
      fetchRooms();
    }
  };

  return (
    <div className="admin-container">
      <header className="chat-header admin-header">
        <button className="back-btn" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <h3>{editingRoom ? 'Edit Room' : 'Admin Management'}</h3>
      </header>

      <form className="add-room-form" onSubmit={handleSubmit}>
        <input name="roomName" defaultValue={editingRoom?.room_name || ''} placeholder="Room Name" required />
        <input name="roomCode" defaultValue={editingRoom?.secret_code || ''} placeholder="Secret Code" required />
        <button type="submit" className="login-btn">
          {editingRoom ? 'Update Room' : 'Create Room'}
        </button>
      </form>

      <table className="rooms-table">
        <thead>
          <tr><th>Name</th><th>Code</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {roomsList.map((r, i) => (
            <tr key={i}>
              <td>{r.room_name}</td>
              <td><code>{r.secret_code}</code></td>
              <td className="actions-cell">
                <button onClick={() => setEditingRoom(r)} className="edit-btn"><Edit size={14} /></button>
                <button onClick={() => handleDelete(r)} className="delete-btn"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
import React from 'react';

interface Props {
  lore: string | null;
  onClose: () => void;
}

export const LoreModal: React.FC<Props> = ({ lore, onClose }) => {
  if (!lore) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#1e1e2e',
        border: '2px solid #cba6f7',
        borderRadius: 8,
        padding: 30,
        maxWidth: 500,
        color: '#cdd6f4',
        textAlign: 'center',
        boxShadow: '0 0 20px rgba(203, 166, 247, 0.4)'
      }}>
        <h2 style={{ color: '#cba6f7', fontFamily: 'serif', marginTop: 0 }}>📜 Ancient Lore Discovered</h2>
        <p style={{ fontStyle: 'italic', fontSize: '1.2rem', lineHeight: 1.5 }}>"{lore}"</p>
        <button 
          onClick={onClose}
          style={{
            marginTop: 20, padding: '10px 20px', background: '#cba6f7', 
            color: '#11111b', border: 'none', borderRadius: 4, cursor: 'pointer',
            fontWeight: 'bold'
          }}>
          Continue Quest
        </button>
      </div>
    </div>
  );
};

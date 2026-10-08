import React, { useEffect } from 'react';
import { useLoreMaster } from '../hooks/useLoreMaster';

interface Props {
  loreMaster: ReturnType<typeof useLoreMaster>;
}

export const GemmaDownloadBar: React.FC<Props> = ({ loreMaster }) => {
  const { status, progress, errorMessage, loadModel } = loreMaster;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadModel(e.target.files[0]);
    }
  };

  if (status === 'idle') {
    return (
      <div style={{ padding: 10, background: '#89b4fa', color: '#11111b', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>Gemma AI:</strong> Ready to load.</div>
        <div>
          <button onClick={() => loadModel()} style={{ marginRight: 10, background: '#313244', color: '#cdd6f4', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>
            Download Model (1.3GB)
          </button>
          <label style={{ background: '#313244', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', color: '#cdd6f4', fontSize: '0.9em' }}>
            Load Local .task File
            <input type="file" accept=".task" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
        </div>
      </div>
    );
  }
    if (e.target.files && e.target.files[0]) {
  if (status === 'unsupported') {
    return (
      <div style={{ padding: 10, background: '#f38ba8', color: '#11111b', borderRadius: 4 }}>
        <strong>Notice:</strong> {errorMessage}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ padding: 10, background: '#f38ba8', color: '#11111b', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div><strong>Error Loading Gemma:</strong> {errorMessage}</div>
        <div>
          <button onClick={() => loadModel()} style={{ marginRight: 10 }}>Retry Download</button>
          <span>OR</span>
          <label style={{ marginLeft: 10, background: '#313244', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', color: '#cdd6f4' }}>
            Load Local .task File
            <input type="file" accept=".task" style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
        </div>
      </div>
    );
  }

  if (status === 'ready' || status === 'generating') {
    return (
      <div style={{ padding: 10, background: '#a6e3a1', color: '#11111b', borderRadius: 4 }}>
        <strong>Gemma Lore Master:</strong> Ready (Offline Active)
      </div>
    );
  }

  return (
    <div style={{ padding: 10, background: '#89b4fa', color: '#11111b', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <strong>Downloading Lore Master (WebGPU Model)...</strong> {progress}%
      </div>
      <div>
        <label style={{ background: '#313244', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', color: '#cdd6f4', fontSize: '0.9em' }}>
          Load Local File Instead
          <input type="file" accept=".task" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
      </div>
    </div>
  );
};

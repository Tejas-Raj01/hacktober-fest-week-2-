import React, { useEffect } from 'react';
import { useLoreMaster } from '../hooks/useLoreMaster';

interface Props {
  loreMaster: ReturnType<typeof useLoreMaster>;
}

export const GemmaDownloadBar: React.FC<Props> = ({ loreMaster }) => {
  const { status, progress, errorMessage, loadModel } = loreMaster;

  useEffect(() => {
    if (status === 'idle') {
      loadModel();
    }
  }, [status, loadModel]);

  if (status === 'unsupported') {
    return (
      <div style={{ padding: 10, background: '#f38ba8', color: '#11111b', borderRadius: 4 }}>
        <strong>Notice:</strong> {errorMessage}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ padding: 10, background: '#f38ba8', color: '#11111b', borderRadius: 4 }}>
        <strong>Error Loading Gemma:</strong> {errorMessage}
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
    <div style={{ padding: 10, background: '#89b4fa', color: '#11111b', borderRadius: 4 }}>
      <strong>Downloading Lore Master (WebGPU Model)...</strong> {progress}%
    </div>
  );
};

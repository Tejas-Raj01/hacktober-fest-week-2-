import React, { useState, useRef } from 'react';
import { analyzeImage } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface CameraCaptureProps {
  currentQuestTarget: string;
  onClaimPoints: (photoUrl: string) => void;
  questTitle?: string;
  questDescription?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  currentQuestTarget,
  onClaimPoints,
  questTitle,
  questDescription,
}) => {
  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Transition immediately to analyzing state & disable inputs
    setQuestState('analyzing');
    setErrorMessage(null);

    // Show image preview locally
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      // Execute object detection AI validation
      const isMatch = await analyzeImage(file, currentQuestTarget);

      if (isMatch) {
        setQuestState('success');
      } else {
        setQuestState('rejected');
        setErrorMessage(
          `That doesn't look like a ${currentQuestTarget}! Get closer, ensure good lighting, and try again.`
        );
      }
    } catch (err: any) {
      console.error('Vision analysis error:', err);
      setQuestState('rejected');
      setErrorMessage(
        `Failed to process photo: ${err?.message || 'Vision model error'}. Please try again.`
      );
    }
  };

  const handleRetake = () => {
    setQuestState('capturing');
    setPhotoPreview(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleSubmit = () => {
    // Strict Guard: Can only claim points if state is strictly success
    if (questState !== 'success' || !photoPreview) {
      return;
    }
    onClaimPoints(photoPreview);
  };

  return (
    <div className="quest-hero-card" style={{ padding: '20px', borderRadius: '12px' }}>
      {questTitle && <h2 className="quest-heading">{questTitle}</h2>}
      {questDescription && <p className="quest-instruction">{questDescription}</p>}

      <div className="target-badge" style={{ marginBottom: '16px' }}>
        🎯 Target: <strong>"{currentQuestTarget}"</strong> (Required Confidence: &gt; 50%)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {/* Photo Preview */}
        {photoPreview && (
          <div
            className="photo-preview-wrap"
            style={{
              border:
                questState === 'success'
                  ? '2px solid #a6e3a1'
                  : questState === 'rejected'
                  ? '2px solid #f38ba8'
                  : '2px solid #89b4fa',
              borderRadius: '10px',
              overflow: 'hidden',
              maxHeight: '320px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#11111b',
            }}
          >
            <img
              src={photoPreview}
              alt="Captured quest proof"
              style={{ width: '100%', height: 'auto', maxHeight: '320px', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Hidden Camera/File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          style={{ display: 'none' }}
          disabled={questState === 'analyzing'}
        />

        {/* 1. Capturing Flow */}
        {questState === 'capturing' && (
          <button
            type="button"
            className="mobile-btn"
            onClick={() => fileInputRef.current?.click()}
            style={{
              minHeight: '48px',
              backgroundColor: '#89b4fa',
              color: '#11111b',
              fontWeight: 'bold',
              fontSize: '1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📸 Capture Photo of "{currentQuestTarget}"
          </button>
        )}

        {/* 2. Analyzing Flow */}
        {questState === 'analyzing' && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#181825',
              border: '1px solid #89b4fa',
              borderRadius: '8px',
              color: '#89b4fa',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            🤖 Analyzing photo with DETR AI Model... Please wait.
          </div>
        )}

        {/* 3. Rejected Flow */}
        {questState === 'rejected' && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#2a1a24',
              border: '1px solid #f38ba8',
              borderRadius: '8px',
              color: '#f38ba8',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '8px' }}>
              ❌ Target Not Found
            </div>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.92rem', color: '#cdd6f4' }}>
              {errorMessage}
            </p>
            <button
              type="button"
              className="mobile-btn"
              onClick={handleRetake}
              style={{
                width: '100%',
                minHeight: '44px',
                backgroundColor: '#45475a',
                color: '#cdd6f4',
                fontWeight: 'bold',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🔄 Retake Photo
            </button>
          </div>
        )}

        {/* 4. Success Flow */}
        {questState === 'success' && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#1a2a20',
              border: '1px solid #a6e3a1',
              borderRadius: '8px',
              color: '#a6e3a1',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '4px' }}>
              ✅ Photo Verified!
            </div>
            <p style={{ margin: '0', fontSize: '0.9rem', color: '#cdd6f4' }}>
              Distinct "{currentQuestTarget}" detected with high AI confidence (&gt; 50%).
            </p>
          </div>
        )}

        {/* STRICT BUTTON GATING: Claim Points button MUST ONLY render when questState === 'success' */}
        {questState === 'success' && (
          <button
            type="button"
            className="mobile-btn"
            onClick={handleSubmit}
            style={{
              minHeight: '52px',
              backgroundColor: '#a6e3a1',
              color: '#11111b',
              fontWeight: 'bold',
              fontSize: '1.05rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ✨ Claim Points / Submit Quest (+10 Pts)
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;


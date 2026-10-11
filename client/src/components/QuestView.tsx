import React, { useState, useEffect, useRef } from 'react';
import VisionService, {
  TASK_TARGET_KEYWORDS,
  type VerificationResult,
} from '../services/vision';

/**
 * 1. Explicit States:
 * Strict State Machine for Quest Photo Verification
 */
export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface QuestTask {
  id: number;
  title: string;
  description: string;
  points?: number;
}

export interface QuestViewProps {
  task: QuestTask;
  targetKeyword?: string;
  onCompleteTask: (proofUrl: string) => void;
  disabled?: boolean;
}

export const QuestView: React.FC<QuestViewProps> = ({
  task,
  targetKeyword,
  onCompleteTask,
  disabled = false,
}) => {
  // 1. Explicit State Machine variable
  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [proof, setProof] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Derive target keyword from prop or standard dictionary
  const effectiveTarget = (
    targetKeyword ||
    TASK_TARGET_KEYWORDS[task.id] ||
    'leaf'
  ).toLowerCase().trim();

  // Reset state whenever the active task changes
  useEffect(() => {
    setQuestState('capturing');
    setProof(null);
    setVerificationResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [task.id]);

  /**
   * 3. The 'Analyzing' Flow:
   * When photo is chosen, immediately transition to 'analyzing', disable inputs,
   * run Transformers.js object detection, then transition to 'success' or 'rejected'.
   */
  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Immediately enter 'analyzing' state and lock inputs
    setQuestState('analyzing');
    setVerificationResult(null);
    setErrorMessage(null);

    // Read local image preview for immediate display
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProof(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      // Execute object detection pipeline with >= 0.50 confidence threshold
      const result = await VisionService.verifyTaskProof(task.id, file, 0.50);
      setVerificationResult(result);

      if (result.success) {
        // 5. The 'Success' Flow
        setQuestState('success');
      } else {
        // 4. The 'Rejected' Flow
        setQuestState('rejected');
        setErrorMessage(
          result.reason ||
            `That doesn't look like a ${effectiveTarget}! Get closer and try again.`
        );
      }
    } catch (err: any) {
      console.error('[QuestView] Vision analysis error:', err);
      // 4. Fallback to 'rejected' state on error
      setQuestState('rejected');
      setErrorMessage(
        `Analysis failed: ${err?.message || 'Could not process photo'}. Please try another photo.`
      );
    }
  };

  /**
   * 4. Retake Handler for 'rejected' flow or user reset
   */
  const handleRetake = () => {
    setQuestState('capturing');
    setProof(null);
    setVerificationResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  /**
   * 5. Submit Handler (strictly gated by state === 'success')
   */
  const handleSubmit = () => {
    // Strict Guard: Absolutely impossible to submit unless state is 'success'
    if (questState !== 'success' || !proof) {
      console.warn('[QuestView] Submission blocked: State is not "success"');
      return;
    }
    onCompleteTask(proof);
  };

  return (
    <div className="quest-hero-card">
      <div className="quest-tag">Active Quest</div>
      <h2 className="quest-heading">{task.title}</h2>
      <p className="quest-instruction">{task.description}</p>

      {/* Target Keyword Badge */}
      <div className="target-badge">
        🎯 Target Object: <strong>"{effectiveTarget}"</strong> (min confidence: 50%)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
        {/* Preview Container */}
        {proof && (
          <div
            className="photo-preview-wrap"
            style={{
              border:
                questState === 'success'
                  ? '2px solid var(--accent-green)'
                  : questState === 'rejected'
                  ? '2px solid var(--accent-red)'
                  : '2px solid var(--accent-blue)',
            }}
          >
            <img src={proof} alt="Quest preview" className="photo-preview-img" />
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelected}
          style={{ display: 'none' }}
          disabled={disabled || questState === 'analyzing'}
        />

        {/* STATE MACHINE RENDERINGS */}

        {/* STATE: 'capturing' */}
        {questState === 'capturing' && (
          <button
            type="button"
            className="photo-capture-box"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: 'transparent',
              border: '2px dashed var(--accent-blue)',
              color: 'var(--accent-blue)',
            }}
          >
            <span>📸 Take / Upload Photo of "{effectiveTarget}"</span>
          </button>
        )}

        {/* STATE: 'analyzing' */}
        {questState === 'analyzing' && (
          <div
            style={{
              background: 'var(--bg-mantle)',
              border: '1px solid var(--accent-blue)',
              padding: '16px',
              borderRadius: '10px',
              color: 'var(--accent-blue)',
              textAlign: 'center',
              fontWeight: 'bold',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '1.4rem' }}>🤖</div>
            <div>Analyzing photo with AI Object Detection...</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85, fontWeight: 'normal' }}>
              Scanning image for target: "{effectiveTarget}" (50% threshold)
            </div>
          </div>
        )}

        {/* STATE: 'rejected' */}
        {questState === 'rejected' && (
          <div className="verify-box verify-box-error">
            <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '6px' }}>
              ❌ That doesn't look like a {effectiveTarget}!
            </div>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
              {errorMessage || `Could not find a distinct ${effectiveTarget} with >= 50% confidence.`}
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '8px', color: 'var(--text-main)' }}>
              💡 <em>Tip: Get closer, ensure good natural lighting, and frame the item clearly.</em>
            </div>

            {/* Retake Photo Button */}
            <button
              type="button"
              onClick={handleRetake}
              className="mobile-btn"
              style={{
                marginTop: '12px',
                background: '#45475a',
                color: '#cdd6f4',
                fontSize: '1rem',
              }}
            >
              🔄 Retake Photo
            </button>
          </div>
        )}

        {/* STATE: 'success' */}
        {questState === 'success' && (
          <div className="verify-box verify-box-success">
            <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '6px' }}>
              ✅ Quest Proof Verified!
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              {verificationResult?.reason || `Successfully identified "${effectiveTarget}"!`}
            </div>
            {verificationResult?.confidence && (
              <div style={{ fontSize: '0.82rem', marginTop: '4px', opacity: 0.9 }}>
                AI Confidence: {Math.round(verificationResult.confidence * 100)}%
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={handleRetake}
                className="mobile-btn"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--accent-green)',
                  color: 'var(--accent-green)',
                  flex: 1,
                  fontSize: '0.9rem',
                }}
              >
                🔄 Retake
              </button>
            </div>
          </div>
        )}

        {/* 2. STRICT BUTTON GATING:
            The "Submit & Claim Points" button MUST NOT render if the state is anything other than 'success'.
            Notice: No disabled button, no hidden hack - it literally only mounts when questState === 'success'.
        */}
        {questState === 'success' && (
          <button
            type="button"
            onClick={handleSubmit}
            className="mobile-btn mobile-btn-green"
            style={{
              fontSize: '1.05rem',
              minHeight: '52px',
              marginTop: '4px',
            }}
          >
            ✨ Submit & Claim Points (+10 Points)
          </button>
        )}
      </div>
    </div>
  );
};

// Also export as CameraCapture for maximum naming compatibility
export const CameraCapture = QuestView;
export default QuestView;


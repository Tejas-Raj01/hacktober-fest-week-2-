import React, { useState, useEffect, useRef } from 'react';
import VisionService, {
  TASK_TARGET_KEYWORDS,
  type VerificationResult,
} from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';
export type CaptureMode = 'camera' | 'upload';

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
  // Strict State Machine variable
  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('camera');
  const [proof, setProof] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveTarget = (
    targetKeyword ||
    TASK_TARGET_KEYWORDS[task.id] ||
    'bench'
  ).toLowerCase().trim();

  // Stop camera tracks cleanly
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Start live webcam or mobile camera feed
  const startCameraStream = async (mode: 'environment' | 'user' = facingMode) => {
    stopCameraStream();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser. Please use file upload.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('[QuestView] Camera stream error:', err);
      setCameraError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access or switch to upload.'
          : 'Could not access device camera. Please switch to file upload.'
      );
      setIsCameraActive(false);
    }
  };

  // Switch between front and back camera
  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isCameraActive) {
      startCameraStream(nextMode);
    }
  };

  // Process photo blob through Vision AI
  const processPhotoBlob = async (blob: Blob) => {
    stopCameraStream();
    setQuestState('analyzing');
    setVerificationResult(null);
    setErrorMessage(null);

    // Create local object URL for preview
    const previewUrl = URL.createObjectURL(blob);
    setProof(previewUrl);

    try {
      const result = await VisionService.verifyTaskProof(task.id, blob, 0.50);
      setVerificationResult(result);

      if (result.success) {
        setQuestState('success');
      } else {
        setQuestState('rejected');
        setErrorMessage(
          result.reason ||
            `That doesn't look like a ${effectiveTarget}! Get closer and try again.`
        );
      }
    } catch (err: any) {
      console.error('[QuestView] Vision analysis error:', err);
      setQuestState('rejected');
      setErrorMessage(
        `Analysis failed: ${err?.message || 'Could not process photo'}. Please try another photo.`
      );
    }
  };

  // Capture snapshot from live video feed
  const captureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !isCameraActive) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front-facing selfie camera for natural mirror feel
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          processPhotoBlob(blob);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  // Handle file chosen via file picker
  const handlePhotoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processPhotoBlob(file);
  };

  // Reset state whenever active task changes
  useEffect(() => {
    setQuestState('capturing');
    setProof(null);
    setVerificationResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Automatically boot camera if on capturing state and camera mode
    if (captureMode === 'camera') {
      startCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [task.id]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  // Retake photo action
  const handleRetake = () => {
    setQuestState('capturing');
    setProof(null);
    setVerificationResult(null);
    setErrorMessage(null);
    if (captureMode === 'camera') {
      startCameraStream();
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Submit action (strictly gated by state === 'success')
  const handleSubmit = () => {
    if (questState !== 'success' || !proof) {
      return;
    }
    onCompleteTask(proof);
  };

  return (
    <div className="quest-hero-card">
      <div className="quest-header-badge">
        <span className="quest-tag">Active Quest</span>
        <span className="quest-points-tag">⭐ +10 Points</span>
      </div>

      <h2 className="quest-heading">{task.title}</h2>
      <p className="quest-instruction">{task.description}</p>

      {/* Target Keyword Badge */}
      <div className="target-badge">
        <span className="target-icon">🎯</span>
        <span>Target Object: <strong>"{effectiveTarget}"</strong> (Required AI Confidence &gt; 50%)</span>
      </div>

      <div className="quest-body-container">
        {/* ================= STATE: 'capturing' ================= */}
        {questState === 'capturing' && (
          <div className="capture-flow-wrap">
            {/* Mode Switcher Tabs */}
            <div className="capture-mode-tabs">
              <button
                type="button"
                className={`mode-tab-btn ${captureMode === 'camera' ? 'active' : ''}`}
                onClick={() => {
                  setCaptureMode('camera');
                  startCameraStream();
                }}
              >
                📷 Live Camera Viewfinder
              </button>
              <button
                type="button"
                className={`mode-tab-btn ${captureMode === 'upload' ? 'active' : ''}`}
                onClick={() => {
                  stopCameraStream();
                  setCaptureMode('upload');
                }}
              >
                📁 Upload / Gallery File
              </button>
            </div>

            {/* LIVE CAMERA MODE */}
            {captureMode === 'camera' && (
              <div className="viewfinder-container">
                {/* Live Video Element */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`viewfinder-video ${facingMode === 'user' ? 'mirror' : ''}`}
                  style={{ display: isCameraActive ? 'block' : 'none' }}
                />

                {/* Reticle / Framing Overlay */}
                {isCameraActive && (
                  <div className="viewfinder-overlay">
                    <div className="reticle-corner top-left" />
                    <div className="reticle-corner top-right" />
                    <div className="reticle-corner bottom-left" />
                    <div className="reticle-corner bottom-right" />
                    <div className="reticle-center-badge">
                      <span>🎯 Center "{effectiveTarget}" in frame</span>
                    </div>
                  </div>
                )}

                {/* Camera Inactive / Error Display */}
                {!isCameraActive && (
                  <div className="viewfinder-placeholder">
                    {cameraError ? (
                      <div className="camera-error-wrap">
                        <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>⚠️</div>
                        <p>{cameraError}</p>
                        <button
                          type="button"
                          className="mobile-btn mobile-btn-blue"
                          style={{ minHeight: '40px', marginTop: '8px' }}
                          onClick={() => startCameraStream()}
                        >
                          🔄 Retry Camera Permission
                        </button>
                        <button
                          type="button"
                          className="mobile-btn mobile-btn-subtle"
                          style={{ minHeight: '38px', marginTop: '6px' }}
                          onClick={() => setCaptureMode('upload')}
                        >
                          📁 Switch to File Upload Instead
                        </button>
                      </div>
                    ) : (
                      <div className="camera-start-wrap">
                        <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>📷</div>
                        <p>Live camera viewfinder is ready</p>
                        <button
                          type="button"
                          className="mobile-btn mobile-btn-blue"
                          onClick={() => startCameraStream()}
                          style={{ maxWidth: '240px' }}
                        >
                          Start Live Camera
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Camera Viewfinder Controls */}
                {isCameraActive && (
                  <div className="viewfinder-controls">
                    <button
                      type="button"
                      className="camera-ctrl-btn"
                      onClick={toggleCameraFacing}
                      title="Flip Camera"
                    >
                      🔄 Flip
                    </button>

                    <button
                      type="button"
                      className="shutter-btn"
                      onClick={captureSnapshot}
                      title="Capture Photo"
                    >
                      <div className="shutter-inner" />
                    </button>

                    <button
                      type="button"
                      className="camera-ctrl-btn"
                      onClick={() => setCaptureMode('upload')}
                      title="Switch to File Upload"
                    >
                      📁 Upload
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* UPLOAD / GALLERY MODE */}
            {captureMode === 'upload' && (
              <div className="upload-container">
                <button
                  type="button"
                  className="photo-capture-box"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  <div style={{ fontSize: '2.2rem', marginBottom: '8px' }}>📸</div>
                  <span style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>
                    Click to Choose or Snap Photo
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                    Capture "{effectiveTarget}" with your device camera or upload image file
                  </span>
                </button>
              </div>
            )}

            {/* Hidden Input for Upload Mode */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFileSelected}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* ================= STATE: 'analyzing' ================= */}
        {questState === 'analyzing' && (
          <div className="analyzing-card">
            {proof && (
              <div className="photo-preview-wrap analyzing-preview">
                <img src={proof} alt="Analyzing preview" className="photo-preview-img" />
                <div className="scanning-laser-line" />
              </div>
            )}
            <div className="analyzing-banner">
              <div className="analyzing-spinner" />
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-blue)' }}>
                🤖 Analyzing photo with DETR Vision AI...
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                Scanning objects for target: <strong>"{effectiveTarget}"</strong> (&gt; 50% confidence required)
              </div>
            </div>
          </div>
        )}

        {/* ================= STATE: 'rejected' ================= */}
        {questState === 'rejected' && (
          <div className="rejected-flow-wrap">
            {proof && (
              <div className="photo-preview-wrap error-preview">
                <img src={proof} alt="Rejected quest photo" className="photo-preview-img" />
              </div>
            )}

            <div className="verify-box verify-box-error">
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '6px' }}>
                ❌ That doesn't look like a {effectiveTarget}!
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.92rem', lineHeight: '1.45' }}>
                {errorMessage || `Could not detect a distinct ${effectiveTarget} with sufficient AI confidence.`}
              </p>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', opacity: 0.9 }}>
                💡 <em>Tip: Position camera closer, keep steady, and ensure bright outdoor lighting.</em>
              </div>

              <button
                type="button"
                onClick={handleRetake}
                className="mobile-btn"
                style={{
                  marginTop: '14px',
                  background: '#45475a',
                  color: '#cdd6f4',
                  fontSize: '1rem',
                }}
              >
                🔄 Retake Photo
              </button>
            </div>
          </div>
        )}

        {/* ================= STATE: 'success' ================= */}
        {questState === 'success' && (
          <div className="success-flow-wrap">
            {proof && (
              <div className="photo-preview-wrap success-preview">
                <img src={proof} alt="Verified quest photo" className="photo-preview-img" />
              </div>
            )}

            <div className="verify-box verify-box-success">
              <div style={{ fontWeight: 'bold', fontSize: '1.15rem', marginBottom: '6px' }}>
                🎉 Quest Proof Verified!
              </div>
              <p style={{ margin: '0 0 6px 0', fontSize: '0.94rem' }}>
                {verificationResult?.reason || `Distinct "${effectiveTarget}" successfully identified!`}
              </p>
              {verificationResult?.confidence && (
                <div style={{ fontSize: '0.84rem', opacity: 0.9 }}>
                  AI Confidence: <strong>{Math.round(verificationResult.confidence * 100)}%</strong>
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
                    fontSize: '0.92rem',
                    minHeight: '40px',
                  }}
                >
                  🔄 Retake
                </button>
              </div>
            </div>

            {/* STRICT BUTTON GATING: Rendered ONLY when state is 'success' */}
            <button
              type="button"
              onClick={handleSubmit}
              className="mobile-btn mobile-btn-green"
              style={{
                fontSize: '1.1rem',
                minHeight: '54px',
                marginTop: '10px',
              }}
            >
              ✨ Submit & Claim Points (+10 Points)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const CameraCapture = QuestView;
export default QuestView;

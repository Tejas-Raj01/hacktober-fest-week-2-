import React, { useState, useRef, useEffect } from 'react';
import { analyzeImage } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface CameraCaptureProps {
  currentQuestTarget?: string;
  onClaimPoints?: (photoUrl: string) => void;
  questTitle?: string;
  questDescription?: string;
  // Optional task interface compatibility
  task?: { id: number; title: string; description: string; points?: number };
  onCompleteTask?: (photoUrl: string) => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  currentQuestTarget,
  onClaimPoints,
  questTitle,
  questDescription,
  task,
  onCompleteTask,
}) => {
  const target = (currentQuestTarget || task?.title || 'BENCH').toLowerCase().trim();
  const displayTarget = target.toUpperCase();
  const title = questTitle || task?.title || 'ACTIVE QUEST';
  const description = questDescription || task?.description || 'Locate and capture the target item in your surroundings.';

  const handleClaim = onClaimPoints || onCompleteTask || (() => {});

  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks cleanly
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // 1. Live Camera Feed: Request rear camera using environment facingMode
  const startCameraStream = async () => {
    stopCameraStream();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera hardware access is not available on this device/browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Strictly rear camera for outdoor scanning
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
    } catch (err: any) {
      console.error('[CameraCapture] Camera access failed:', err);
      setCameraError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'CAMERA PERMISSION DENIED. PLEASE ALLOW CAMERA ACCESS IN YOUR BROWSER SETTINGS.'
          : 'COULD NOT INITIALIZE REAR CAMERA STREAM. PLEASE CHECK CAMERA PERMISSIONS.'
      );
    }
  };

  // Start live stream when component mounts or target changes
  useEffect(() => {
    setQuestState('capturing');
    setCapturedPhotoUrl(null);
    setErrorMessage(null);
    startCameraStream();

    return () => {
      stopCameraStream();
    };
  }, [target]);

  // 3. Canvas Capture: Draw current video frame to hidden canvas, convert to Blob, and analyze
  const handleSnapPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      return;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw pristine un-mirrored real video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Stop active camera hardware immediately
    stopCameraStream();

    // 4. State Machine Integration: Convert to Blob and analyze
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const photoUrl = URL.createObjectURL(blob);
        setCapturedPhotoUrl(photoUrl);

        // Instantly transition to analyzing state
        setQuestState('analyzing');
        setErrorMessage(null);

        try {
          // Pass image blob to Transformers.js exact match validation
          const isMatch = await analyzeImage(blob, target);

          if (isMatch) {
            setQuestState('success');
          } else {
            setQuestState('rejected');
            setErrorMessage(`THAT DOESN'T LOOK LIKE A ${displayTarget}! GET CLOSER AND TRY AGAIN.`);
          }
        } catch (err: any) {
          console.error('[CameraCapture] Vision model error:', err);
          setQuestState('rejected');
          setErrorMessage(`VISION MODEL ERROR: ${err?.message || 'ANALYSIS FAILED'}. TRY AGAIN.`);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRetake = () => {
    setQuestState('capturing');
    setCapturedPhotoUrl(null);
    setErrorMessage(null);
    startCameraStream();
  };

  const handleSubmit = () => {
    if (questState !== 'success' || !capturedPhotoUrl) {
      return;
    }
    handleClaim(capturedPhotoUrl);
  };

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto bg-slate-900 text-slate-100 min-h-full w-full">
      {/* 2. Hidden Canvas strictly for hardware snapshot conversion (NO FILE INPUTS) */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Quest Info Card */}
      <div className="border-4 border-black bg-slate-800 p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="bg-yellow-400 text-black px-3 py-1 font-black text-xs uppercase tracking-widest border-2 border-black">
            QUEST ACTIVE
          </span>
          <span className="bg-green-500 text-black px-3 py-1 font-black text-xs uppercase tracking-widest border-2 border-black">
            +10 PTS
          </span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-wider text-slate-100 mt-1">{title}</h2>
        <p className="text-slate-300 font-bold text-sm leading-snug">{description}</p>
      </div>

      {/* Target Keyword Banner */}
      <div className="bg-yellow-400 text-black border-4 border-black font-black uppercase p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-center tracking-wider text-base">
        🎯 TARGET: {displayTarget}
      </div>

      {/* 3. Aggressive State Feedback (The Camera UI Box) */}
      <div
        className={`relative w-full aspect-4/3 max-h-80 border-4 border-black overflow-hidden flex flex-col items-center justify-center transition-colors ${
          questState === 'analyzing'
            ? 'bg-slate-600 border-black'
            : questState === 'rejected'
            ? 'border-red-600 bg-red-100 text-red-900'
            : questState === 'success'
            ? 'border-green-600 bg-green-100 text-green-900'
            : 'bg-black border-black'
        }`}
      >
        {/* --- STATE: CAPTURING (LIVE REAR CAMERA FEED ONLY) --- */}
        {questState === 'capturing' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* In-viewfinder reticle framing box */}
            {!cameraError && (
              <div className="absolute inset-0 pointer-events-none border-4 border-yellow-400 m-4 flex items-center justify-center">
                <div className="bg-black/80 text-yellow-400 px-3 py-1 font-black text-xs uppercase tracking-widest border-2 border-yellow-400">
                  FRAME {displayTarget} IN CENTER
                </div>
              </div>
            )}

            {/* Camera Error / Permission Fallback */}
            {cameraError && (
              <div className="p-6 text-center flex flex-col items-center justify-center gap-2 bg-red-950 text-red-200 w-full h-full">
                <span className="text-4xl">⚠️</span>
                <span className="font-black text-xs uppercase tracking-wider leading-relaxed">
                  {cameraError}
                </span>
                <button
                  type="button"
                  onClick={startCameraStream}
                  className="mt-2 px-4 py-2 bg-yellow-400 text-black font-black uppercase text-xs border-2 border-black"
                >
                  RETRY CAMERA
                </button>
              </div>
            )}
          </>
        )}

        {/* --- STATE: ANALYZING --- */}
        {questState === 'analyzing' && (
          <div className="w-full h-full relative flex items-center justify-center bg-slate-600">
            {capturedPhotoUrl && (
              <img
                src={capturedPhotoUrl}
                alt="Captured frame"
                className="w-full h-full object-cover opacity-40"
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className="text-3xl font-black uppercase tracking-widest text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] animate-pulse">
                ANALYZING...
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-200 bg-black/80 px-2 py-1">
                RUNNING OBJECT DETECTION
              </span>
            </div>
          </div>
        )}

        {/* --- STATE: REJECTED --- */}
        {questState === 'rejected' && (
          <div className="p-6 text-center flex flex-col items-center justify-center gap-3 w-full h-full">
            <span className="text-5xl font-black">❌</span>
            <span className="text-2xl font-black uppercase tracking-wider text-red-900 leading-tight">
              TARGET REJECTED
            </span>
            <p className="font-black text-sm uppercase text-red-900 max-w-xs">{errorMessage}</p>
          </div>
        )}

        {/* --- STATE: SUCCESS --- */}
        {questState === 'success' && (
          <div className="p-6 text-center flex flex-col items-center justify-center gap-3 w-full h-full">
            <span className="text-5xl font-black">✅</span>
            <span className="text-2xl font-black uppercase tracking-wider text-green-900 leading-tight">
              TARGET VERIFIED!
            </span>
            <p className="font-black text-sm uppercase text-green-900">
              {displayTarget} DETECTED WITH &gt; 50% CONFIDENCE
            </p>
          </div>
        )}
      </div>

      {/* 2. "Fat Finger" Tactile Action Buttons */}
      <div className="flex flex-col gap-4">
        {/* Capturing Mode: Oversized Live Shutter Button */}
        {questState === 'capturing' && (
          <button
            type="button"
            onClick={handleSnapPhoto}
            disabled={Boolean(cameraError)}
            className="h-16 w-full bg-green-500 border-4 border-black font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📸 SNAP LIVE PHOTO
          </button>
        )}

        {/* Analyzing Mode: Locked Button */}
        {questState === 'analyzing' && (
          <button
            type="button"
            disabled
            className="h-16 w-full bg-slate-600 border-4 border-black font-black uppercase tracking-wider text-slate-300 shadow-[4px_4px_0px_rgba(0,0,0,1)] opacity-80 cursor-not-allowed flex items-center justify-center text-base"
          >
            ⏳ VERIFYING PROOF...
          </button>
        )}

        {/* Rejected Mode: Chunky Retake Button */}
        {questState === 'rejected' && (
          <button
            type="button"
            onClick={handleRetake}
            className="h-16 w-full bg-red-500 border-4 border-red-900 font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-lg cursor-pointer"
          >
            🔄 RETAKE PHOTO
          </button>
        )}

        {/* Success Mode: Strictly Gated Submit Button */}
        {questState === 'success' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              className="h-16 w-full bg-green-500 border-4 border-black font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-lg cursor-pointer"
            >
              ✨ SUBMIT & CLAIM POINTS (+10 PTS)
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="h-12 w-full bg-slate-700 border-4 border-black font-black uppercase tracking-wider text-slate-200 shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-xs cursor-pointer"
            >
              🔄 DISCARD & RETAKE
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;

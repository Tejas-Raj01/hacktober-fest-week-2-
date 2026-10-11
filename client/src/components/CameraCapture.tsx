import React, { useState, useRef, useEffect } from 'react';
import { analyzeImage } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface CameraCaptureProps {
  currentQuestTarget?: string;
  onClaimPoints?: (photoUrl: string) => void;
  questTitle?: string;
  questDescription?: string;
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
  // Normalize props for unified usage
  const target = (currentQuestTarget || task?.title || 'TREE').toUpperCase().trim();
  const title = questTitle || task?.title || 'ACTIVE QUEST';
  const description = questDescription || task?.description || 'Locate and capture the target item in your surroundings.';

  const handleClaim = onClaimPoints || onCompleteTask || (() => {});

  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    stopCamera();
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsCameraActive(true);
      }
    } catch (err) {
      console.warn('Camera access error, fallback to file input:', err);
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [target]);

  const processImageBlob = async (blob: Blob) => {
    stopCamera();
    setQuestState('analyzing');
    setErrorMessage(null);

    const previewUrl = URL.createObjectURL(blob);
    setPhotoPreview(previewUrl);

    try {
      const isMatch = await analyzeImage(blob, target.toLowerCase());

      if (isMatch) {
        setQuestState('success');
      } else {
        setQuestState('rejected');
        setErrorMessage(`THAT DOESN'T LOOK LIKE A ${target}! GET CLOSER AND TRY AGAIN.`);
      }
    } catch (err: any) {
      console.error('Vision analysis error:', err);
      setQuestState('rejected');
      setErrorMessage(`ANALYSIS FAILED: ${err?.message || 'MODEL ERROR'}. TRY AGAIN.`);
    }
  };

  const handleCaptureFromVideo = () => {
    const video = videoRef.current;
    if (!video || !isCameraActive) {
      fileInputRef.current?.click();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          processImageBlob(blob);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageBlob(file);
    }
  };

  const handleRetake = () => {
    setQuestState('capturing');
    setPhotoPreview(null);
    setErrorMessage(null);
    startCamera();
  };

  const handleSubmit = () => {
    if (questState !== 'success' || !photoPreview) {
      return;
    }
    handleClaim(photoPreview);
  };

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto bg-slate-900 text-slate-100 min-h-full w-full">
      {/* 1. Sunlight High-Contrast Quest Card Header */}
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
        🎯 TARGET: {target}
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
        {/* Hidden Fallback File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* --- STATE: CAPTURING --- */}
        {questState === 'capturing' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
            />
            {!isCameraActive && (
              <div className="p-6 text-center flex flex-col items-center gap-3">
                <span className="text-5xl">📸</span>
                <span className="font-black uppercase tracking-wider text-slate-200">
                  TAP BUTTON BELOW TO CAPTURE
                </span>
              </div>
            )}
            {isCameraActive && (
              <div className="absolute inset-0 pointer-events-none border-4 border-yellow-400 m-4 flex items-center justify-center">
                <div className="bg-black/80 text-yellow-400 px-3 py-1 font-black text-xs uppercase tracking-widest border-2 border-yellow-400">
                  CENTER {target} IN FRAME
                </div>
              </div>
            )}
          </>
        )}

        {/* --- STATE: ANALYZING --- */}
        {questState === 'analyzing' && (
          <div className="w-full h-full relative flex items-center justify-center bg-slate-600">
            {photoPreview && (
              <img src={photoPreview} alt="Captured preview" className="w-full h-full object-cover opacity-40" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className="text-3xl font-black uppercase tracking-widest text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] animate-pulse">
                ANALYZING...
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-200 bg-black/80 px-2 py-1">
                RUNNING VISION MODEL
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
              {target} SUCCESSFULLY DETECTED BY AI
            </p>
          </div>
        )}
      </div>

      {/* 2. "Fat Finger" Tactile Action Buttons */}
      <div className="flex flex-col gap-4">
        {/* Capturing Actions */}
        {questState === 'capturing' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCaptureFromVideo}
              className="h-16 w-full bg-green-500 border-4 border-black font-black uppercase tracking-wider text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-lg cursor-pointer"
            >
              📸 SNAP PHOTO NOW
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-14 w-full bg-slate-700 border-4 border-black font-black uppercase tracking-wider text-slate-100 shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-sm cursor-pointer"
            >
              📁 CHOOSE FROM GALLERY
            </button>
          </div>
        )}

        {/* Analyzing Lockout */}
        {questState === 'analyzing' && (
          <button
            type="button"
            disabled
            className="h-16 w-full bg-slate-600 border-4 border-black font-black uppercase tracking-wider text-slate-300 shadow-[4px_4px_0px_rgba(0,0,0,1)] opacity-80 cursor-not-allowed flex items-center justify-center text-base"
          >
            ⏳ VERIFYING PROOF...
          </button>
        )}

        {/* Rejected: Retake Button Styled with bg-red-500 border-red-900 */}
        {questState === 'rejected' && (
          <button
            type="button"
            onClick={handleRetake}
            className="h-16 w-full bg-red-500 border-4 border-red-900 font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center text-lg cursor-pointer"
          >
            🔄 RETAKE PHOTO
          </button>
        )}

        {/* Success: Strict Submit & Claim Points Button Gating */}
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

import React, { useState, useRef, useEffect } from 'react';
import { Settings, ArrowLeft, Play } from 'lucide-react';
import { analyzeImage } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface CameraCaptureProps {
  currentQuestTarget?: string;
  onClaimPoints?: (photoUrl: string) => void;
  questTitle?: string;
  questDescription?: string;
  task?: { id: number; title: string; description: string; points?: number };
  onCompleteTask?: (photoUrl: string) => void;
  onSettingsClick?: () => void;
  onBackClick?: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  currentQuestTarget,
  onClaimPoints,
  questTitle: _questTitle,
  questDescription: _questDescription,
  task,
  onCompleteTask,
  onSettingsClick,
  onBackClick,
}) => {
  const target = (currentQuestTarget || task?.title || 'bench').toLowerCase().trim();

  const handleClaim = onClaimPoints || onCompleteTask || (() => {});

  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCameraStream = async () => {
    stopCameraStream();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device access is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
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
      console.warn('[CameraCapture] Camera access failed, using viewfinder placeholder mode:', err);
      setCameraError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Camera permission denied'
          : 'Camera unavailable'
      );
    }
  };

  useEffect(() => {
    startCameraStream();
    return () => {
      stopCameraStream();
    };
  }, [target]);

  const snapFrameToBlob = async (): Promise<{ blob: Blob; dataUrl: string } | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!canvas) return null;

    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              resolve(null);
            }
          },
          'image/jpeg',
          0.9
        );
      });
    }

    // Fallback if camera stream is placeholder / mock
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, 0, 640, 640);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve({ blob, dataUrl });
        else resolve(null);
      }, 'image/jpeg');
    });
  };

  const handleAction = async () => {
    if (questState === 'success') {
      if (capturedPhotoUrl) {
        handleClaim(capturedPhotoUrl);
      }
      return;
    }

    if (questState === 'rejected') {
      setCapturedPhotoUrl(null);
      setErrorMessage(null);
      setQuestState('capturing');
      startCameraStream();
      return;
    }

    if (questState === 'capturing') {
      try {
        const snap = await snapFrameToBlob();
        if (!snap) return;

        setCapturedPhotoUrl(snap.dataUrl);
        setQuestState('analyzing');
        setErrorMessage(null);

        const isValid = await analyzeImage(snap.blob, target, 0.50);

        if (isValid) {
          setQuestState('success');
        } else {
          setQuestState('rejected');
          setErrorMessage(`No ${target} detected!`);
        }
      } catch (err: any) {
        console.error('[CameraCapture] Analysis failed:', err);
        setQuestState('rejected');
        setErrorMessage('Detection failed');
      }
    }
  };

  const handleRetake = () => {
    setCapturedPhotoUrl(null);
    setErrorMessage(null);
    setQuestState('capturing');
    startCameraStream();
  };

  const getStatusContent = () => {
    switch (questState) {
      case 'analyzing':
        return {
          title: 'ANALYZING...',
          subline: `Scanning for ${target}...`,
        };
      case 'rejected':
        return {
          title: 'NOT DETECTED!',
          subline: errorMessage || `No ${target} found. Try again!`,
        };
      case 'capturing':
        return {
          title: 'QUEST ACTIVE',
          subline: `Find and frame a ${target}`,
        };
      case 'success':
      default:
        return {
          title: 'QUEST COMPLETE!',
          subline: `${target} detected!`,
        };
    }
  };

  const status = getStatusContent();

  const getActionLabel = () => {
    switch (questState) {
      case 'analyzing':
        return 'Analyzing...';
      case 'success':
        return 'Claim Points';
      case 'rejected':
        return 'Retake';
      case 'capturing':
      default:
        return 'Scan';
    }
  };

  return (
    <div className="bg-[#65A369] font-sans font-bold min-h-screen text-black flex flex-col justify-between">
      {/* Hidden canvas for snapshot rasterization */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Mobile constraint container */}
      <div className="max-w-md mx-auto flex flex-col gap-4 p-4 h-screen w-full select-none justify-between">
        {/* 2. Top Header Bar */}
        <div className="flex justify-between items-start w-full">
          {/* Left - Settings Button */}
          <button
            type="button"
            onClick={onSettingsClick}
            className="border-4 border-black bg-gray-200 rounded-md shadow-[4px_4px_0px_rgba(0,0,0,1)] p-2 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="w-6 h-6 text-black stroke-[2.5]" />
          </button>

          {/* Right - Points Badge */}
          <div className="border-4 border-black bg-green-300 font-black rounded-full px-4 py-2 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-center text-sm uppercase leading-tight">
            +10 Points
          </div>
        </div>

        {/* 3. The Camera Viewfinder Container */}
        <div className="border-4 border-black bg-gray-600 rounded-xl shadow-[6px_6px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col w-full">
          {/* Header */}
          <div className="bg-gray-700 text-white font-bold text-center py-2 border-b-4 border-black uppercase tracking-wider text-sm sm:text-base">
            Camera Scan
          </div>

          {/* Camera Feed Area */}
          <div className="relative aspect-square w-full bg-gray-800 overflow-hidden flex items-center justify-center">
            {/* Live Camera Feed / Snapshot */}
            {capturedPhotoUrl ? (
              <img
                src={capturedPhotoUrl}
                alt="Captured scan preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}

            {/* Viewfinder Placeholder when camera feed is inactive */}
            {cameraError && !capturedPhotoUrl && (
              <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-gray-300 p-4 text-center">
                <span className="text-3xl mb-1">📷</span>
                <span className="text-xs uppercase font-black tracking-wider text-gray-400">
                  Camera Feed Active
                </span>
                <span className="text-[10px] text-gray-500 mt-1">
                  ({cameraError})
                </span>
              </div>
            )}

            {/* Overlays: White Corner Brackets */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-white pointer-events-none" />
            <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-white pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-white pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-white pointer-events-none" />

            {/* Overlays: Yellow bounding box overlay with small yellow label tab */}
            <div className="absolute inset-10 sm:inset-12 border-2 border-yellow-400 pointer-events-none flex flex-col justify-start">
              <div className="absolute -top-3.5 left-2 bg-yellow-400 text-black text-xs font-black px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_rgba(0,0,0,1)] uppercase tracking-wider">
                {`${target} [85%]`}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Status Message Box */}
        <div className="border-4 border-black bg-[#C6D8B0] rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)] p-4 text-center w-full">
          <div className="text-xl sm:text-2xl font-black text-black uppercase tracking-wider">
            {status.title}
          </div>
          <div className="text-sm font-bold text-gray-800 uppercase mt-0.5">
            {status.subline}
          </div>
        </div>

        {/* 5. Bottom Navigation/Controls */}
        <div className="flex items-center gap-4 mt-auto w-full">
          {/* Left arrow button */}
          <button
            type="button"
            onClick={onBackClick || handleRetake}
            className="border-4 border-black bg-gray-700 text-white rounded-lg p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3]" />
          </button>

          {/* Central action/play button */}
          <button
            type="button"
            onClick={handleAction}
            disabled={questState === 'analyzing'}
            className="flex-1 flex items-center justify-center gap-2 border-4 border-black bg-gray-700 text-white rounded-lg p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all font-black text-lg uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Action"
          >
            <Play className="w-6 h-6 fill-white stroke-[2]" />
            <span>{getActionLabel()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraCapture;

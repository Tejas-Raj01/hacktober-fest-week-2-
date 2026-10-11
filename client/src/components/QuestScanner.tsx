import React, { useState, useRef, useEffect } from 'react';
import { Settings, ArrowLeft, ArrowRight, SwitchCamera } from 'lucide-react';
import { validateQuestPhoto, type BoundingBox } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface QuestScannerProps {
  targetKeyword?: string;
  points?: number;
  onSuccess?: (photoUrl: string) => void;
  onBack?: () => void;
  onNext?: () => void;
  onSettings?: () => void;
  onClaim?: (photoUrl: string) => void;
}

interface BoxCoords {
  left: number;
  top: number;
  width: number;
  height: number;
}

function calculateBoxPercentages(
  box: BoundingBox | undefined,
  frameWidth: number,
  frameHeight: number
): BoxCoords {
  if (!box || frameWidth <= 0 || frameHeight <= 0) {
    return { left: 15, top: 15, width: 70, height: 70 };
  }

  const xmin = Math.max(0, Math.min(box.xmin, frameWidth));
  const ymin = Math.max(0, Math.min(box.ymin, frameHeight));
  const xmax = Math.max(xmin, Math.min(box.xmax, frameWidth));
  const ymax = Math.max(ymin, Math.min(box.ymax, frameHeight));

  const left = Math.round((xmin / frameWidth) * 100);
  const top = Math.round((ymin / frameHeight) * 100);
  const width = Math.max(12, Math.round(((xmax - xmin) / frameWidth) * 100));
  const height = Math.max(12, Math.round(((ymax - ymin) / frameHeight) * 100));

  return { left, top, width, height };
}

export const QuestScanner: React.FC<QuestScannerProps> = ({
  targetKeyword = 'bench',
  points = 10,
  onSuccess,
  onBack,
  onNext,
  onSettings,
  onClaim,
}) => {
  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // AI Detection Result States
  const [detectedLabel, setDetectedLabel] = useState<string>('bench');
  const [detectedConfidence, setDetectedConfidence] = useState<number>(85);
  const [boxCoords, setBoxCoords] = useState<BoxCoords | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const startCameraStream = async (mode: 'environment' | 'user' = facingMode) => {
    stopCameraStream();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera hardware access is not supported by this browser.');
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
    } catch (err: any) {
      console.warn('[QuestScanner] Camera access error:', err);
      // Graceful fallback to default video device (e.g. laptop webcam without environment lens)
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        setCameraError(
          err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
            ? 'Camera permission denied. Please enable camera in browser settings.'
            : 'Unable to initialize device camera feed.'
        );
      }
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (questState === 'capturing') {
      startCameraStream(nextMode);
    }
  };

  useEffect(() => {
    setQuestState('capturing');
    setCapturedPhotoUrl(null);
    setBoxCoords(null);
    setErrorMessage(null);
    startCameraStream(facingMode);

    return () => {
      stopCameraStream();
    };
  }, [targetKeyword]);

  const handleScan = () => {
    if (questState === 'analyzing') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!canvas) return;

    const frameWidth = video && video.videoWidth > 0 ? video.videoWidth : 640;
    const frameHeight = video && video.videoHeight > 0 ? video.videoHeight : 480;

    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (video && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, frameWidth, frameHeight);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, frameWidth, frameHeight);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedPhotoUrl(dataUrl);

    // Freeze camera feed to prevent continuous drain
    stopCameraStream();

    // Transition immediately to analyzing state
    setQuestState('analyzing');
    setErrorMessage(null);
    setBoxCoords(null);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setQuestState('rejected');
          setErrorMessage('Failed to extract snapshot frame.');
          return;
        }

        try {
          // Strict edge AI object detection validation (Xenova/detr-resnet-50)
          const result = await validateQuestPhoto(blob, targetKeyword, 0.50);

          if (result.success) {
            const coords = calculateBoxPercentages(result.detectedBox, frameWidth, frameHeight);
            setBoxCoords(coords);
            setDetectedLabel(result.matchedConcept || targetKeyword);
            setDetectedConfidence(Math.round((result.confidence || 0.85) * 100));
            setQuestState('success');

            if (onSuccess) {
              onSuccess(dataUrl);
            }
          } else {
            setQuestState('rejected');
            setErrorMessage(result.reason || `No ${targetKeyword} detected.`);
          }
        } catch (error: any) {
          console.error('[QuestScanner] Object detection pipeline error:', error);
          setQuestState('rejected');
          setErrorMessage(error?.message || 'AI vision model inference failed.');
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRetake = () => {
    setCapturedPhotoUrl(null);
    setBoxCoords(null);
    setErrorMessage(null);
    setQuestState('capturing');
    startCameraStream(facingMode);
  };

  const handleClaimPoints = () => {
    if (questState === 'success' && capturedPhotoUrl) {
      if (onClaim) {
        onClaim(capturedPhotoUrl);
      } else if (onSuccess) {
        onSuccess(capturedPhotoUrl);
      }
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#65A369] text-black select-none">
      {/* Hidden canvas strictly for anti-cheat hardware snapshot capture (NO FILE INPUT) */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Main Responsive Mobile / Tablet Widescreen Centered Frame */}
      <div className="max-w-xl mx-auto min-h-screen flex flex-col gap-4 p-4 font-sans justify-between border-r-4 border-l-4 border-black bg-[#A3E681]/30 backdrop-blur-sm shadow-brutal">
        {/* 1. Top Header */}
        <div className="flex justify-between items-start w-full">
          {/* Left: Square settings button */}
          <button
            type="button"
            onClick={onSettings}
            className="bg-gray-300 border-4 border-black rounded-md shadow-brutal p-2 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="w-6 h-6 text-black stroke-[2.5]" />
          </button>

          {/* Right: +10 Points badge */}
          <div className="bg-[#A3E681] border-4 border-black font-black rounded-full px-4 py-2 shadow-brutal text-center text-sm uppercase leading-tight">
            +{points} Points
          </div>
        </div>

        {/* 2. The Viewfinder (Centerpiece) */}
        <div className="border-4 border-black bg-gray-700 rounded-xl shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden relative w-full flex-1 max-h-[65vh]">
          {/* Header Bar with Camera Scan Title and Flip Camera Button */}
          <div className="bg-gray-600 text-white font-bold py-2 px-3 border-b-4 border-black uppercase tracking-wider text-sm sm:text-base shrink-0 flex items-center justify-between">
            <span className="w-8" aria-hidden="true" />
            <span className="font-black tracking-wide">Camera Scan</span>
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="bg-yellow-400 text-black border-2 border-black rounded-md p-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer flex items-center justify-center hover:bg-yellow-300"
              title={`Flip camera (Current: ${facingMode === 'environment' ? 'Rear' : 'Front'})`}
              aria-label="Flip camera between front and rear"
            >
              <SwitchCamera className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Camera Feed Area */}
          <div className="relative w-full flex-1 bg-black overflow-hidden flex items-center justify-center min-h-0">
            {/* Captured preview or Live Video */}
            {questState !== 'capturing' && capturedPhotoUrl ? (
              <img
                src={capturedPhotoUrl}
                alt="Captured viewfinder scan"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
            )}

            {/* Camera error fallback notification */}
            {cameraError && questState === 'capturing' && (
              <div className="absolute inset-0 bg-gray-800 text-white flex flex-col items-center justify-center p-4 text-center z-10">
                <p className="text-xs font-bold uppercase text-red-300 mb-2">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => startCameraStream(facingMode)}
                  className="border-2 border-black bg-yellow-400 text-black px-3 py-1 font-black text-xs uppercase cursor-pointer"
                >
                  Retry Camera
                </button>
              </div>
            )}

            {/* Overlays: White corner brackets (Targeting Reticle) */}
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white pointer-events-none z-10" />

            {/* Overlays: Analyzing Overlay */}
            {questState === 'analyzing' && (
              <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center gap-3 p-4 text-center pointer-events-none">
                <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xl font-black text-white uppercase tracking-widest animate-pulse drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  ANALYZING...
                </span>
                <span className="text-xs font-bold text-yellow-300 uppercase tracking-wider bg-black/80 px-2 py-1 border border-yellow-400">
                  Detecting [{targetKeyword}] with DETR ResNet-50
                </span>
              </div>
            )}

            {/* Overlays: Dynamic Yellow bounding box overlay strictly rendered on success coordinates */}
            {questState === 'success' && boxCoords && (
              <div
                style={{
                  left: `${boxCoords.left}%`,
                  top: `${boxCoords.top}%`,
                  width: `${boxCoords.width}%`,
                  height: `${boxCoords.height}%`,
                }}
                className="absolute border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none z-20 flex flex-col justify-start transition-all duration-300"
              >
                <span className="absolute -top-3.5 left-2 bg-yellow-400 text-black text-xs font-black px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_rgba(0,0,0,1)] uppercase tracking-wider">
                  {detectedLabel} [{detectedConfidence}%]
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Status Box & Dynamic Action Area */}
        <div className="w-full flex flex-col gap-2">
          {questState === 'success' ? (
            /* Success State: Pale sage status box and claim button */
            <div className="flex flex-col gap-2 w-full">
              <div className="bg-[#C6D8B0] border-4 border-black rounded-xl p-4 text-center shadow-brutal w-full">
                <h2 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wider">
                  QUEST COMPLETE!
                </h2>
                <p className="text-sm font-bold text-gray-800 uppercase mt-0.5">
                  {detectedLabel || targetKeyword} detected!
                </p>
              </div>

              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={handleClaimPoints}
                  className="flex-1 border-4 border-black bg-green-400 text-black font-black uppercase text-base sm:text-lg rounded-xl p-3.5 text-center shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
                >
                  CLAIM POINTS (+{points} PTS)
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="border-4 border-black bg-gray-300 text-black font-black uppercase text-sm rounded-xl px-4 py-3.5 shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
                >
                  SCAN AGAIN
                </button>
              </div>
            </div>
          ) : questState === 'rejected' ? (
            /* Rejected State: Clear error message & Retake action button */
            <div className="flex flex-col gap-2 w-full">
              <div className="bg-red-200 border-4 border-red-800 rounded-xl p-3 text-center shadow-brutal w-full">
                <p className="text-xs sm:text-sm font-black text-red-900 uppercase">
                  {errorMessage || `THAT DOESN'T LOOK LIKE A ${targetKeyword.toUpperCase()}! GET CLOSER & RETRY.`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRetake}
                className="w-full border-4 border-black bg-red-400 text-black font-black uppercase text-lg rounded-xl p-4 text-center shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
              >
                TRY AGAIN ({targetKeyword.toUpperCase()} NOT FOUND)
              </button>
            </div>
          ) : questState === 'analyzing' ? (
            /* Analyzing State: Disabled loading button */
            <button
              type="button"
              disabled
              className="w-full border-4 border-black bg-yellow-400 text-black font-black uppercase text-xl rounded-xl p-4 text-center shadow-brutal opacity-75 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="w-5 h-5 border-4 border-black border-t-transparent rounded-full animate-spin inline-block" />
              ANALYZING...
            </button>
          ) : (
            /* Capturing State: Chunky SCAN OBJECT action button */
            <button
              type="button"
              onClick={handleScan}
              disabled={Boolean(cameraError)}
              className="w-full border-4 border-black bg-yellow-400 text-black font-black uppercase text-xl rounded-xl p-4 text-center shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SCAN OBJECT
            </button>
          )}
        </div>

        {/* 4. Bottom Nav: Chunky square navigation buttons */}
        <div className="flex justify-between items-center w-full mt-auto">
          <button
            type="button"
            onClick={onBack}
            className="bg-gray-700 text-white border-4 border-black rounded-lg p-3 shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Previous Quest"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3]" />
          </button>

          <span className="text-xs uppercase font-black bg-black text-yellow-400 px-3 py-1 border-2 border-black tracking-wider">
            Target: {targetKeyword}
          </span>

          <button
            type="button"
            onClick={onNext}
            className="bg-gray-700 text-white border-4 border-black rounded-lg p-3 shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Next Quest"
          >
            <ArrowRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestScanner;

import React, { useState, useRef, useEffect } from 'react';
import { Settings, ArrowLeft, ArrowRight } from 'lucide-react';
import { analyzeImage } from '../services/vision';

export type QuestState = 'capturing' | 'analyzing' | 'success' | 'rejected';

export interface QuestScannerProps {
  targetKeyword?: string;
  points?: number;
  onSuccess?: (photoUrl: string) => void;
  onBack?: () => void;
  onNext?: () => void;
  onSettings?: () => void;
}

export const QuestScanner: React.FC<QuestScannerProps> = ({
  targetKeyword = 'bench',
  points = 10,
  onSuccess,
  onBack,
  onNext,
  onSettings,
}) => {
  const [questState, setQuestState] = useState<QuestState>('capturing');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [confidence] = useState<number>(85);

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
        throw new Error('Camera access not supported by browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('[QuestScanner] Camera initialization error:', err);
      setCameraError(err?.message || 'Unable to access camera.');
    }
  };

  useEffect(() => {
    startCameraStream();
    return () => {
      stopCameraStream();
    };
  }, []);

  const handleScan = () => {
    if (questState === 'analyzing') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!canvas) return;

    // Use current video dimensions or fallback dimensions
    const width = video && video.videoWidth > 0 ? video.videoWidth : 640;
    const height = video && video.videoHeight > 0 ? video.videoHeight : 640;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (video && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#374151';
      ctx.fillRect(0, 0, width, height);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhotoUrl(dataUrl);
    setQuestState('analyzing');

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setQuestState('rejected');
          return;
        }

        try {
          const isMatch = await analyzeImage(blob, targetKeyword, 0.50);
          if (isMatch) {
            setQuestState('success');
            if (onSuccess) {
              onSuccess(dataUrl);
            }
          } else {
            setQuestState('rejected');
          }
        } catch (error) {
          console.error('[QuestScanner] Detection error:', error);
          setQuestState('rejected');
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const handleRetake = () => {
    setCapturedPhotoUrl(null);
    setQuestState('capturing');
    startCameraStream();
  };

  return (
    <div className="bg-[#65A369] min-h-screen text-black select-none">
      {/* Hidden canvas for hardware frame conversion */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Main Container */}
      <div className="max-w-md mx-auto h-screen flex flex-col gap-4 p-4 font-sans justify-between">
        {/* 3. Top Header */}
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

          {/* Right: Points badge */}
          <div className="bg-[#A3E681] border-4 border-black font-black rounded-full px-4 py-2 shadow-brutal text-center text-sm uppercase leading-tight">
            +{points} Points
          </div>
        </div>

        {/* 4. The Viewfinder (Centerpiece) */}
        <div className="border-4 border-black bg-gray-700 rounded-xl shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden relative w-full flex-1 max-h-[65vh]">
          {/* Header Bar */}
          <div className="bg-gray-600 text-white font-bold text-center py-2 border-b-4 border-black uppercase tracking-wider text-sm sm:text-base shrink-0">
            Camera Scan
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
                className="w-full h-full object-cover"
              />
            )}

            {/* Camera error fallback note */}
            {cameraError && questState === 'capturing' && (
              <div className="absolute inset-0 bg-gray-800 text-white flex flex-col items-center justify-center p-4 text-center z-10">
                <p className="text-xs font-bold uppercase text-red-300 mb-2">{cameraError}</p>
                <button
                  type="button"
                  onClick={startCameraStream}
                  className="border-2 border-black bg-yellow-400 text-black px-3 py-1 font-black text-xs uppercase"
                >
                  Retry Camera
                </button>
              </div>
            )}

            {/* Overlays: White corner brackets (targeting reticle) */}
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white pointer-events-none z-10" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white pointer-events-none z-10" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white pointer-events-none z-10" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white pointer-events-none z-10" />

            {/* Overlays: Yellow bounding box on success */}
            {questState === 'success' && (
              <div className="absolute inset-12 border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none z-20 flex flex-col justify-start">
                <span className="absolute -top-3.5 left-2 bg-yellow-400 text-black text-xs font-black px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_rgba(0,0,0,1)] uppercase tracking-wider">
                  {targetKeyword} [{confidence}%]
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5. Status Box & Controls */}
        <div className="w-full">
          {questState === 'success' ? (
            /* Success: Pale sage status box */
            <div className="bg-[#C6D8B0] border-4 border-black rounded-xl p-4 text-center shadow-brutal w-full">
              <h2 className="text-xl sm:text-2xl font-black text-black uppercase tracking-wider">
                QUEST COMPLETE!
              </h2>
              <p className="text-sm font-bold text-gray-800 uppercase mt-0.5">
                {targetKeyword} detected!
              </p>
            </div>
          ) : questState === 'rejected' ? (
            /* Rejected: Retake action button */
            <button
              type="button"
              onClick={handleRetake}
              className="w-full border-4 border-black bg-red-400 text-black font-black uppercase text-lg rounded-xl p-4 text-center shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            >
              TRY AGAIN ({targetKeyword.toUpperCase()} NOT FOUND)
            </button>
          ) : (
            /* Capturing or Analyzing: Chunky SCAN OBJECT action button */
            <button
              type="button"
              onClick={handleScan}
              disabled={questState === 'analyzing'}
              className="w-full border-4 border-black bg-yellow-400 text-black font-black uppercase text-xl rounded-xl p-4 text-center shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {questState === 'analyzing' ? 'ANALYZING...' : 'SCAN OBJECT'}
            </button>
          )}
        </div>

        {/* Bottom Nav: Two chunky square navigation buttons */}
        <div className="flex justify-between items-center w-full mt-auto">
          <button
            type="button"
            onClick={onBack}
            className="bg-gray-700 text-white border-4 border-black rounded-lg p-3 shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Previous"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3]" />
          </button>

          <button
            type="button"
            onClick={onNext}
            className="bg-gray-700 text-white border-4 border-black rounded-lg p-3 shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            aria-label="Next"
          >
            <ArrowRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestScanner;

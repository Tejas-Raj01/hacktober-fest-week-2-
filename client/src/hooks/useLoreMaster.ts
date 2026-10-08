import { useState, useCallback, useRef } from 'react';
import { GemmaService } from '../services/gemma';

import { ModelDownloader } from '../services/ModelDownloader';

type Status = 'idle' | 'checking-gpu' | 'downloading' | 'ready' | 'generating' | 'error' | 'unsupported';

export function useLoreMaster() {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestLore, setLatestLore] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadModel = useCallback(async (localFile?: File) => {
    // Abort any ongoing download
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setStatus('checking-gpu');
    setErrorMessage(null);
    setProgress(0);
    
    if (!GemmaService.checkWebGPUSupport()) {
      setStatus('unsupported');
      setErrorMessage("WebGPU is unavailable on this browser - running in standard mode");
      return;
    }

    setStatus('downloading');
    try {
      let modelSource: File | Blob | string | undefined = undefined;
      
      if (localFile) {
        modelSource = localFile; // Pass the File object directly
      } else {
        // Use our bulletproof resumable downloader
        modelSource = await ModelDownloader.downloadModelResumable(
          "https://huggingface.co/realbyte/gemma-3n-E2B-it-int4-mediapipe/resolve/main/gemma-3n-E2B-it-int4.task",
          (p) => setProgress(p),
          abortController.signal
        );
      }
      
      await GemmaService.initializeGemma((p) => {
        // Only update progress from GemmaService if we didn't just download it manually
        if (localFile) setProgress(p); 
      }, modelSource);
      
      setStatus('ready');
    } catch (e: any) {
      if (e.message === "AbortError") return;
      setStatus('error');
      
      let errMsg = e.message || "Failed to load Gemma weights.";
      if (errMsg.includes("Array buffer allocation failed")) {
        errMsg = "Out of Memory: Your browser does not have enough free RAM to load this 1.3GB AI model. Please close other tabs and try again, or use a 64-bit browser.";
      }
      setErrorMessage(errMsg);
    }
  }, []);

  const generateLore = useCallback(async (playerName: string, task: string) => {
    if (status !== 'ready') return "";
    
    setStatus('generating');
    try {
      const lore = await GemmaService.generateQuestLore(playerName, task);
      setLatestLore(lore);
      setStatus('ready'); 
      return lore;
    } catch (e: any) {
      setStatus('error');
      setErrorMessage(e.message || "Inference failed");
      return "";
    }
  }, [status]);

  return { status, progress, errorMessage, latestLore, loadModel, generateLore };
}

import { useState, useCallback } from 'react';
import { GemmaService } from '../services/gemma';

type Status = 'idle' | 'checking-gpu' | 'downloading' | 'ready' | 'generating' | 'error' | 'unsupported';

export function useLoreMaster() {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestLore, setLatestLore] = useState<string | null>(null);

  const loadModel = useCallback(async (localFile?: File) => {
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
      let customUrl = undefined;
      if (localFile) {
        customUrl = URL.createObjectURL(localFile);
      }
      await GemmaService.initializeGemma((p) => setProgress(p), customUrl);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setErrorMessage(e.message || "Failed to load Gemma weights.");
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

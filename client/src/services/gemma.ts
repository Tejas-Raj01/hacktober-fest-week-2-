import { LlmInference, FilesetResolver } from '@mediapipe/tasks-genai';

export class GemmaService {
  private static instance: LlmInference | null = null;
  private static isInitializing = false;
  private static isReady = false;

  static checkWebGPUSupport(): boolean {
    return 'gpu' in navigator;
  }

  static async initializeGemma(onProgress?: (progressPercent: number) => void): Promise<void> {
    if (this.isReady || this.instance) return;
    if (this.isInitializing) return;
    
    if (!this.checkWebGPUSupport()) {
      throw new Error("WebGPU is not supported in this browser.");
    }

    this.isInitializing = true;
    
    try {
      const genai = await FilesetResolver.forGenAiTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm"
      );
      
      if (onProgress) onProgress(10); 
      
      this.instance = await LlmInference.createFromOptions(genai, {
        baseOptions: {
          modelAssetPath: "https://huggingface.co/realbyte/gemma-3n-E2B-it-int4-mediapipe/resolve/main/gemma-3n-E2B-it-int4.task"
        },
        maxTokens: 120,
        temperature: 0.7,
        topK: 40
      });
      
      if (onProgress) onProgress(100);
      this.isReady = true;
    } catch (err) {
      console.error("Gemma Initialization Failed:", err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  static async generateQuestLore(playerName: string, taskDescription: string): Promise<string> {
    if (!this.instance || !this.isReady) {
      throw new Error("Gemma model is not initialized.");
    }

    const prompt = `You are a mythical wilderness Lore Master. The explorer ${playerName} has just accomplished the following feat: '${taskDescription}'. Write a 2-sentence celebratory, mythical piece of lore describing their discovery. Do not repeat instructions. Output only the lore.`;
    
    try {
      const response = await this.instance.generateResponse(prompt);
      return response.trim();
    } catch (e) {
      console.error("Gemma inference error", e);
      return "";
    }
  }
}

import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to run locally without hitting the Hub unnecessarily
env.allowLocalModels = true;
env.useBrowserCache = true;

class VisionService {
  private static instance: any = null;
  private static isInitializing = false;

  static async initialize() {
    if (this.instance || this.isInitializing) return;
    this.isInitializing = true;
    
    try {
      // Use a tiny, fast vision model suitable for mobile
      this.instance = await pipeline('image-classification', 'Xenova/mobilenet_v1_1.0_224');
    } catch (error) {
      console.error("Failed to initialize vision model:", error);
    } finally {
      this.isInitializing = false;
    }
  }

  static async analyzeImage(imageBlob: Blob): Promise<string> {
    if (!this.instance) {
      await this.initialize();
    }
    
    try {
      // Convert Blob to Image URL for the model
      const imageUrl = URL.createObjectURL(imageBlob);
      const results = await this.instance(imageUrl);
      URL.revokeObjectURL(imageUrl);
      
      // Return the highest confidence label
      if (results && results.length > 0) {
        return results[0].label.toLowerCase();
      }
    } catch (error) {
      console.error("Vision analysis failed:", error);
    }
    
    return "unknown";
  }
}

export default VisionService;

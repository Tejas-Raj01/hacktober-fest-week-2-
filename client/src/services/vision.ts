import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to fetch from Hub and cache locally
env.allowLocalModels = false;
env.useBrowserCache = true;

class VisionService {
  private static instance: any = null;
  private static isInitializing = false;

  static async initialize() {
    if (this.instance || this.isInitializing) return;
    this.isInitializing = true;
    
    try {
      // Use resnet-50 which is a verified, lightweight vision model available on Xenova's hub
      this.instance = await pipeline('image-classification', 'Xenova/resnet-50');
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

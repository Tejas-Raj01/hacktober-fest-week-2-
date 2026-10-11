import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to fetch from Hugging Face Hub and cache locally in browser
env.allowLocalModels = false;
env.useBrowserCache = true;

/**
 * Detected bounding box coordinates returned by object-detection pipeline
 */
export interface BoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/**
 * An individual detected object with score, label, and bounding box
 */
export interface DetectedObject {
  label: string;
  score: number;
  box?: BoundingBox;
}

/**
 * Detailed verification feedback for UI presentation
 */
export interface VerificationResult {
  success: boolean;
  matchedConcept?: string;
  confidence?: number;
  detectedBox?: BoundingBox;
  topLabels: DetectedObject[];
  reason: string;
}

/**
 * Target dictionary mapping common quest targets to acceptable object-detection classes / synonyms.
 * COCO model categories include items like 'potted plant', 'bird', 'bench', 'traffic light', 'stop sign', etc.
 */
export const TARGET_SYNONYMS: Record<string, string[]> = {
  tree: ['tree', 'potted plant', 'plant', 'branch', 'wood', 'forest'],
  leaf: ['leaf', 'potted plant', 'plant', 'flower', 'foliage', 'branch'],
  plant: ['potted plant', 'plant', 'tree', 'flower', 'leaf'],
  flower: ['flower', 'potted plant', 'plant', 'vase'],
  rock: ['rock', 'stone', 'boulder', 'mountain'],
  stone: ['stone', 'rock', 'boulder', 'mountain'],
  bird: ['bird', 'animal'],
  bench: ['bench', 'chair', 'park bench'],
  sign: ['traffic light', 'stop sign', 'parking meter', 'street sign', 'sign', 'billboard', 'fire hydrant'],
  cloud: ['cloud', 'sky'],
  dog: ['dog'],
  cat: ['cat'],
  car: ['car', 'truck', 'bus', 'vehicle'],
  person: ['person'],
  bicycle: ['bicycle', 'bike'],
  backpack: ['backpack', 'bag', 'handbag', 'suitcase'],
  bottle: ['bottle', 'cup', 'wine glass'],
};

// Alias for backwards-compatibility
export const VALID_LABELS = TARGET_SYNONYMS;

export const TASK_TARGET_KEYWORDS: Record<number, string> = {
  1: 'leaf',
  2: 'rock',
  3: 'cloud',
  4: 'tree',
  5: 'sign',
};

// Singleton pipeline instance and promise
let detectorPromise: Promise<any> | null = null;
let detectorInstance: any = null;

/**
 * 1. Pipeline Switch & 2. Model Selection:
 * Initializes the Transformers.js object-detection pipeline using Xenova/detr-resnet-50
 * with Xenova/yolos-tiny as a fallback if the heavier DETR model encounters memory/network limits.
 * Ensures env.allowLocalModels = false is enforced.
 */
export async function initializeVisionModel(): Promise<any> {
  if (detectorInstance) {
    return detectorInstance;
  }

  if (detectorPromise) {
    return detectorPromise;
  }

  detectorPromise = (async () => {
    try {
      console.log('[VisionService] Initializing object-detection pipeline with Xenova/detr-resnet-50...');
      detectorInstance = await pipeline('object-detection', 'Xenova/detr-resnet-50');
      console.log('[VisionService] DETR ResNet-50 object detector successfully initialized.');
      return detectorInstance;
    } catch (err) {
      console.warn('[VisionService] Xenova/detr-resnet-50 failed to load, trying lightweight Xenova/yolos-tiny:', err);
      try {
        detectorInstance = await pipeline('object-detection', 'Xenova/yolos-tiny');
        console.log('[VisionService] Fallback YOLOS-Tiny object detector successfully initialized.');
        return detectorInstance;
      } catch (fallbackErr) {
        detectorPromise = null;
        console.error('[VisionService] All object-detection models failed to initialize:', fallbackErr);
        throw fallbackErr;
      }
    }
  })();

  return detectorPromise;
}

/**
 * Checks whether a detected label matches the target keyword.
 * Uses exact match, synonym dictionary inclusion, or close substring matching.
 */
function isLabelMatch(detectedLabel: string, targetKeyword: string): boolean {
  const normLabel = detectedLabel.toLowerCase().trim();
  const normTarget = targetKeyword.toLowerCase().trim();

  if (!normLabel || !normTarget) return false;

  // Exact match
  if (normLabel === normTarget) return true;

  // Close substring match (e.g. "stop sign" contains "sign", "potted plant" contains "plant")
  if (normLabel.includes(normTarget) || normTarget.includes(normLabel)) return true;

  // Target synonyms / category mapping
  const synonyms = TARGET_SYNONYMS[normTarget];
  if (synonyms && Array.isArray(synonyms)) {
    return synonyms.some((syn) => {
      const normSyn = syn.toLowerCase().trim();
      return normLabel === normSyn || normLabel.includes(normSyn) || normSyn.includes(normLabel);
    });
  }

  return false;
}

/**
 * 3. Parse Bounding Boxes, 4. Validation Logic, 5. Confidence Threshold, 6. Graceful Error Handling:
 *
 * Analyzes an image using the object-detection pipeline and checks if any detected object matches
 * the target keyword with at least `minConfidence` (default: 0.50 / 50%).
 *
 * @param imageBlob - Image Blob or File to analyze
 * @param targetKeyword - Target keyword to search for (e.g. "bird", "tree", "leaf", "sign")
 * @param minConfidence - Minimum required confidence threshold (default: 0.50)
 * @returns Strict boolean: true if matching object detected with >= minConfidence, false otherwise
 */
export async function analyzeImage(
  imageBlob: Blob,
  targetKeyword: string,
  minConfidence: number = 0.50
): Promise<boolean> {
  let imageUrl = '';
  try {
    const detector = await initializeVisionModel();
    if (!detector) {
      console.warn('[VisionService] Detector could not be initialized.');
      return false;
    }

    imageUrl = URL.createObjectURL(imageBlob);

    // Run object detection pipeline with lower threshold so we can filter accurately in JS
    const detections: any = await detector(imageUrl, { threshold: 0.15 });

    // 6. Graceful Error Handling: empty array or invalid output (e.g. blank wall / no distinct objects)
    if (!Array.isArray(detections) || detections.length === 0) {
      console.log('[VisionService] No objects detected in photo (empty array). Photo rejected.');
      return false;
    }

    // 3. Parse Bounding Boxes & Detected Objects
    const parsedObjects: DetectedObject[] = detections.map((det: any) => ({
      label: String(det.label || '').toLowerCase().trim(),
      score: typeof det.score === 'number' ? det.score : 0,
      box: det.box ? {
        xmin: Math.round(det.box.xmin),
        ymin: Math.round(det.box.ymin),
        xmax: Math.round(det.box.xmax),
        ymax: Math.round(det.box.ymax),
      } : undefined,
    }));

    console.log(
      `[VisionService] Detected ${parsedObjects.length} object(s):`,
      parsedObjects.map((o) => `${o.label} (${(o.score * 100).toFixed(1)}%)`).join(', ')
    );

    // 4. Validation Logic & 5. Confidence Threshold (>= 0.50)
    // Find if ANY object matches targetKeyword with score >= minConfidence
    const matched = parsedObjects.find((obj) => {
      const meetsScore = obj.score >= minConfidence;
      const matchesTarget = isLabelMatch(obj.label, targetKeyword);
      return meetsScore && matchesTarget;
    });

    if (matched) {
      console.log(
        `[VisionService] Match accepted! Found "${matched.label}" with ${(matched.score * 100).toFixed(1)}% confidence >= ${(minConfidence * 100).toFixed(0)}%.`
      );
      return true;
    }

    console.log(
      `[VisionService] Match rejected: No detected object matched "${targetKeyword}" with confidence >= ${(minConfidence * 100).toFixed(0)}%.`
    );
    return false;
  } catch (error) {
    console.error('[VisionService] analyzeImage error:', error);
    return false;
  } finally {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
  }
}

/**
 * Validates quest photo and returns detailed result including bounding box, confidence, and message.
 *
 * @param imageBlob - Image Blob or File to validate
 * @param targetKeyword - Target keyword
 * @param minConfidence - Minimum confidence score (default: 0.50)
 */
export async function validateQuestPhoto(
  imageBlob: Blob,
  targetKeyword: string,
  minConfidence: number = 0.50
): Promise<VerificationResult> {
  let imageUrl = '';
  try {
    const detector = await initializeVisionModel();
    if (!detector) {
      return {
        success: false,
        topLabels: [],
        reason: 'Vision detector model failed to load. Please refresh and try again.'
      };
    }

    imageUrl = URL.createObjectURL(imageBlob);
    const detections: any = await detector(imageUrl, { threshold: 0.15 });

    // 6. Graceful Error Handling: safely handle empty array (blank wall, featureless texture)
    if (!Array.isArray(detections) || detections.length === 0) {
      return {
        success: false,
        topLabels: [],
        reason: 'No distinct objects detected in the photo. The camera may be pointing at a blank wall or empty background.'
      };
    }

    // 3. Parse Bounding Boxes & Detected Objects
    const parsedObjects: DetectedObject[] = detections.map((det: any) => ({
      label: String(det.label || '').toLowerCase().trim(),
      score: typeof det.score === 'number' ? det.score : 0,
      box: det.box ? {
        xmin: Math.round(det.box.xmin),
        ymin: Math.round(det.box.ymin),
        xmax: Math.round(det.box.xmax),
        ymax: Math.round(det.box.ymax),
      } : undefined,
    }));

    // Sort by confidence descending
    parsedObjects.sort((a, b) => b.score - a.score);

    // 4. Validation Logic & 5. Confidence Threshold (>= 0.50)
    const matched = parsedObjects.find((obj) => {
      return obj.score >= minConfidence && isLabelMatch(obj.label, targetKeyword);
    });

    if (matched) {
      return {
        success: true,
        matchedConcept: matched.label,
        confidence: matched.score,
        detectedBox: matched.box,
        topLabels: parsedObjects.slice(0, 5),
        reason: `Verified! Detected "${matched.label}" (${(matched.score * 100).toFixed(1)}% confidence) matching quest target "${targetKeyword}".`
      };
    }

    // Check if matching object was detected but below 50% confidence
    const lowConfidenceMatch = parsedObjects.find((obj) => isLabelMatch(obj.label, targetKeyword));
    if (lowConfidenceMatch) {
      return {
        success: false,
        matchedConcept: lowConfidenceMatch.label,
        confidence: lowConfidenceMatch.score,
        detectedBox: lowConfidenceMatch.box,
        topLabels: parsedObjects.slice(0, 5),
        reason: `Rejected: Detected "${lowConfidenceMatch.label}" with only ${(lowConfidenceMatch.score * 100).toFixed(1)}% confidence, which is below the required ${(minConfidence * 100).toFixed(0)}% threshold.`
      };
    }

    const detectedSummary = parsedObjects
      .slice(0, 3)
      .map((o) => `"${o.label}" (${(o.score * 100).toFixed(0)}%)`)
      .join(', ');

    return {
      success: false,
      topLabels: parsedObjects.slice(0, 5),
      reason: `Rejected: Detected ${detectedSummary}, but none match the required quest target "${targetKeyword}".`
    };
  } catch (err: any) {
    console.error('[VisionService] validateQuestPhoto error:', err);
    return {
      success: false,
      topLabels: [],
      reason: `Vision model error: ${err?.message || 'Failed to process image'}`
    };
  } finally {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
  }
}

/**
 * Backward-compatible VisionService class wrapper
 */
class VisionService {
  static async initialize() {
    return initializeVisionModel();
  }

  static async validateQuestPhoto(
    imageBlob: Blob,
    targetKeyword: string,
    minConfidence: number = 0.50
  ): Promise<boolean> {
    return analyzeImage(imageBlob, targetKeyword, minConfidence);
  }

  static async verifyTaskProof(
    taskId: number,
    imageBlob: Blob,
    minConfidence: number = 0.50
  ): Promise<VerificationResult> {
    const targetKeyword = TASK_TARGET_KEYWORDS[taskId] || 'leaf';
    return validateQuestPhoto(imageBlob, targetKeyword, minConfidence);
  }
}

export default VisionService;

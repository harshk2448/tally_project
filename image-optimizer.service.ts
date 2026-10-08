import sharp from "sharp";

export interface ServerOptimizationResult {
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
  wasOptimized: boolean;
}

const MAX_DIMENSION = 2048;
const MIN_SIZE_TO_OPTIMIZE = 400 * 1024; // 400 KB

export class ImageOptimizerService {
  /**
   * Optimizes image buffers prior to Gemini Vision or OCR processing.
   * If the buffer is a non-image (e.g. PDF) or already lightweight, returns as-is.
   */
  public async optimizeForOcr(
    buffer: Buffer,
    mimeType: string = "image/jpeg"
  ): Promise<ServerOptimizationResult> {
    const originalSize = buffer.length;

    // Skip non-images (e.g., PDF)
    const isImage =
      mimeType.startsWith("image/") ||
      mimeType === "application/octet-stream";

    if (!isImage || mimeType === "application/pdf") {
      return {
        buffer,
        mimeType,
        originalSize,
        optimizedSize: originalSize,
        wasOptimized: false,
      };
    }

    // Skip buffers that are already small
    if (originalSize <= MIN_SIZE_TO_OPTIMIZE) {
      return {
        buffer,
        mimeType,
        originalSize,
        optimizedSize: originalSize,
        wasOptimized: false,
      };
    }

    try {
      const metadata = await sharp(buffer).metadata();

      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;

      let pipeline = sharp(buffer);

      if (needsResize) {
        pipeline = pipeline.resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      // Convert to high-clarity JPEG for optimal OCR OCR model ingestion
      const optimizedBuffer = await pipeline
        .jpeg({
          quality: 88,
          chromaSubsampling: "4:4:4", // Preserves fine text edge sharpness
        })
        .toBuffer();

      if (optimizedBuffer.length < originalSize) {
        const savedPercent = Math.round((1 - optimizedBuffer.length / originalSize) * 100);
        console.log(
          `[Image Optimizer] Server optimized image buffer: ${originalSize} bytes -> ${optimizedBuffer.length} bytes (${savedPercent}% saved)`
        );
        return {
          buffer: optimizedBuffer,
          mimeType: "image/jpeg",
          originalSize,
          optimizedSize: optimizedBuffer.length,
          wasOptimized: true,
        };
      }

      return {
        buffer,
        mimeType,
        originalSize,
        optimizedSize: originalSize,
        wasOptimized: false,
      };
    } catch (err) {
      console.warn("[Image Optimizer] Server optimization error, using original buffer:", err);
      return {
        buffer,
        mimeType,
        originalSize,
        optimizedSize: originalSize,
        wasOptimized: false,
      };
    }
  }
}

export const imageOptimizerService = new ImageOptimizerService();

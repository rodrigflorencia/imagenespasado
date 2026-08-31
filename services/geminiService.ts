// proxy serverless en /api/generate el único q sabe la key
const PROXY_URL = "/api/generate";
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024; 

async function compressImageIfNeeded(imageDataUrl: string): Promise<string> {
  // Rough byte estimate of the base64 payload
  const approximateBytes = (imageDataUrl.length * 3) / 4;
  if (approximateBytes <= MAX_IMAGE_BYTES) {
    return imageDataUrl; // Already small enough
  }

  console.warn(
    `Image is ~${(approximateBytes / 1024 / 1024).toFixed(1)} MB — compressing before upload.`
  );

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");

      // Also scale down the canvas dimensions if the image is very large
      const MAX_DIMENSION = 1920;
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get canvas context"));
      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until we fit under the limit
      const qualities = [0.85, 0.75, 0.65, 0.5, 0.4];
      for (const quality of qualities) {
        const compressed = canvas.toDataURL("image/jpeg", quality);
        const compressedBytes = (compressed.length * 3) / 4;
        if (compressedBytes <= MAX_IMAGE_BYTES) {
          console.log(
            `Compressed to ~${(compressedBytes / 1024 / 1024).toFixed(1)} MB at quality ${quality}`
          );
          return resolve(compressed);
        }
      }

      // Last resort: lowest quality
      resolve(canvas.toDataURL("image/jpeg", 0.3));
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = imageDataUrl;
  });
}

async function safeParseResponse(res: Response): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    // Server returned a non-JSON response (e.g., Vercel's "Request Entity Too Large")
    body = { error: `Server returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
  return { ok: res.ok, status: res.status, body };
}

async function callProxy(imageDataUrl: string, prompt: string): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, prompt }),
  });

  const { ok, status, body } = await safeParseResponse(res);

  if (!ok) {
    if (body.error === "no_image") {
      // Special signal: Gemini returned text instead of an image
      throw new Error(
        `The AI model responded with text instead of an image: "${body.text}"`
      );
    }
    if (status === 413) {
      throw new Error(
        "The image is too large to send to the server (413 Payload Too Large). " +
          "Please use a smaller image."
      );
    }
    throw new Error((body.error as string) ?? `Server error ${status}`);
  }

  return `data:${body.mimeType};base64,${body.data}`;
}

// --- Helper Functions ---

/**
 * Creates a fallback prompt to use when the primary one is blocked.
 */
function getFallbackPrompt(decade: string): string {
  return `Create a photograph of the person in this image as if they were living in the ${decade}. The photograph should capture the distinct fashion, hairstyles, and overall atmosphere of that time period. Ensure the final image is a clear photograph that looks authentic to the era.`;
}

function extractDecade(prompt: string): string | null {
  const match = prompt.match(/(\d{4}s)/);
  return match ? match[1] : null;
}

/**
 * Generates a decade-styled image from a source image and a prompt.
 * Compresses the image if needed, and includes a fallback mechanism
 * for prompts that might be blocked in certain regions.
 */
export async function generateDecadeImage(
  imageDataUrl: string,
  prompt: string
): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    throw new Error(
      "Invalid image data URL format. Expected 'data:image/...;base64,...'"
    );
  }

  // Compress 
  const safeImageDataUrl = await compressImageIfNeeded(imageDataUrl);

  // --- First attempt with the original prompt ---
  try {
    console.log("Attempting generation with original prompt...");
    return await callProxy(safeImageDataUrl, prompt);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error);
    const isNoImageError = errorMessage.includes(
      "The AI model responded with text instead of an image"
    );

    if (isNoImageError) {
      console.warn("Original prompt was likely blocked. Trying a fallback prompt.");
      const decade = extractDecade(prompt);
      if (!decade) {
        console.error("Could not extract decade from prompt, cannot use fallback.");
        throw error;
      }

      // --- Second attempt with the fallback prompt ---
      try {
        const fallbackPrompt = getFallbackPrompt(decade);
        console.log(`Attempting generation with fallback prompt for ${decade}...`);
        return await callProxy(safeImageDataUrl, fallbackPrompt);
      } catch (fallbackError) {
        console.error("Fallback prompt also failed.", fallbackError);
        const finalErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `The AI model failed with both original and fallback prompts. Last error: ${finalErrorMessage}`
        );
      }
    } else {
      console.error("An unrecoverable error occurred during image generation.", error);
      throw new Error(
        `The AI model failed to generate an image. Details: ${errorMessage}`
      );
    }
  }
}


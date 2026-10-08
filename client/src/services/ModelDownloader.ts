export class ModelDownloader {
  static async downloadModelResumable(
    url: string,
    onProgress: (progress: number) => void
  ): Promise<Blob> {
    console.log("Starting resumable download...");
    
    // 1. Get total file size
    const headResponse = await fetch(url, { method: 'HEAD' });
    const contentLength = headResponse.headers.get('content-length');
    if (!contentLength) {
      throw new Error("Could not determine file size. Server must support Content-Length.");
    }
    const totalBytes = Number(contentLength);
    
    let downloadedBytes = 0;
    const chunks: Uint8Array[] = [];
    let retries = 10; // Allow up to 10 network drops

    while (downloadedBytes < totalBytes && retries > 0) {
      try {
        console.log(`Fetching from byte ${downloadedBytes}...`);
        const response = await fetch(url, {
          headers: downloadedBytes > 0 ? { 'Range': `bytes=${downloadedBytes}-` } : {}
        });

        if (!response.ok && response.status !== 206 && response.status !== 200) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Could not get response reader");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (value) {
            chunks.push(value);
            downloadedBytes += value.length;
            onProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        }
      } catch (e) {
        console.warn(`Network drop detected. Retries left: ${retries - 1}`, e);
        retries--;
        if (retries === 0) throw new Error("Download failed after maximum retries.");
        // Wait 2 seconds before attempting to resume
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (downloadedBytes < totalBytes) {
      throw new Error("Download incomplete.");
    }

    console.log("Download complete! Stitching chunks...");
    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    return blob;
  }
}

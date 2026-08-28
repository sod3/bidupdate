export type AssetProgress = (progress: number) => void;

function loadImage(source: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load ${source}`));
    image.decoding = "async";
    image.src = source;
  });
}

export const AssetLoader = {
  async images(sources: readonly string[], onProgress?: AssetProgress) {
    if (!sources.length) {
      onProgress?.(100);
      return;
    }
    let completed = 0;
    await Promise.all(sources.map(async (source) => {
      await loadImage(source);
      completed += 1;
      onProgress?.(Math.round(completed / sources.length * 100));
    }));
  },
};

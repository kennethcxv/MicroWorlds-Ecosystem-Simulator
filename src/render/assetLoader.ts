/** Loads and caches every image used by the renderer. */

export class AssetStore {
  private images = new Map<string, HTMLImageElement>();
  ready = false;

  get(url: string): HTMLImageElement | undefined {
    return this.images.get(url);
  }

  /** True once a given URL has loaded with non-zero dimensions. */
  has(url: string): boolean {
    const img = this.images.get(url);
    return !!img && img.complete && img.naturalWidth > 0;
  }

  async loadAll(
    urls: string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const unique = Array.from(new Set(urls));
    let loaded = 0;
    const total = unique.length;
    onProgress?.(0, total);

    await Promise.all(
      unique.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            const done = () => {
              loaded++;
              this.images.set(url, img);
              onProgress?.(loaded, total);
              resolve();
            };
            img.onload = done;
            img.onerror = () => {
              console.warn("[GLASSWATER] failed to load asset:", url);
              done(); // resolve anyway so one missing file can't hang the boot
            };
            img.src = url;
          }),
      ),
    );
    this.ready = true;
  }
}

export const assets = new AssetStore();

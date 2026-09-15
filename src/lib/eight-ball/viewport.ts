// All canvas geometry is in CSS pixels. DPR affects only the backing store.
export function poolViewport(width: number, height: number, pixelRatio: number) {
  if (![width, height].every(Number.isFinite) || width < 1 || height < 1) return null;
  const dpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? Math.min(2, pixelRatio) : 1;
  const marginX = Math.min(width * .12, width < 700 ? 76 : 150);
  const marginY = Math.min(height * .12, 34);
  const scale = Math.min((width - marginX) / 5.32, (height - marginY) / 2.99);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return { width, height, dpr, scale, cx: width / 2, cy: height / 2 };
}

export function pointerToWorld(clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewport: NonNullable<ReturnType<typeof poolViewport>>) {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientY - rect.top) * viewport.height / rect.height - viewport.cy) / viewport.scale,
    z: ((clientX - rect.left) * viewport.width / rect.width - viewport.cx) / viewport.scale,
  };
}

export function canvasRadius(radius: number) {
  return Number.isFinite(radius) ? Math.max(0, radius) : 0;
}

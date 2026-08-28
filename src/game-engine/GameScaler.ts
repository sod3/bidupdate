export type ScaledGameViewport = { scale: number; width: number; height: number; offsetX: number; offsetY: number };

export function scaleGameViewport(width: number, height: number, logicalWidth = 1920, logicalHeight = 1080): ScaledGameViewport {
  const scale = Math.min(width / logicalWidth, height / logicalHeight);
  const scaledWidth = logicalWidth * scale;
  const scaledHeight = logicalHeight * scale;
  return { scale, width: scaledWidth, height: scaledHeight, offsetX: (width - scaledWidth) / 2, offsetY: (height - scaledHeight) / 2 };
}

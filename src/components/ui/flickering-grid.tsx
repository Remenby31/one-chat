import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FlickeringGridProps {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
  fadeInSpeed?: number;
  fadeOutSpeed?: number;
}

export function FlickeringGrid({
  squareSize = 4,
  gridGap = 6,
  flickerChance = 0.3,
  color = "rgb(0, 0, 0)",
  width,
  height,
  className,
  maxOpacity = 0.3,
  fadeInSpeed = 0.02,
  fadeOutSpeed = 0.95,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInView, setIsInView] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up intersection observer to pause when not visible
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(canvas);

    // Grid state that will be updated on resize
    let cols = 0;
    let rows = 0;
    let squareOpacities = new Float32Array(0);

    // Handle canvas sizing
    const updateSize = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = width || container.clientWidth;
      const displayHeight = height || container.clientHeight;

      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Reset transform and apply new scale
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Recalculate grid dimensions based on new size
      cols = Math.ceil(displayWidth / (squareSize + gridGap));
      rows = Math.ceil(displayHeight / (squareSize + gridGap));

      // Reinitialize opacities array with new dimensions
      squareOpacities = new Float32Array(cols * rows);
    };

    updateSize();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(updateSize);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Also listen to window resize events (for fullscreen changes)
    window.addEventListener('resize', updateSize);

    // Parse color to RGB components
    const colorMatch = color.match(/\d+/g);
    const [r, g, b] = colorMatch ? colorMatch.map(Number) : [0, 0, 0];

    let animationFrameId: number;

    const drawGrid = () => {
      if (!isInView) {
        animationFrameId = requestAnimationFrame(drawGrid);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const index = i * rows + j;

          // Progressive flicker logic
          if (Math.random() < flickerChance) {
            // Fade in progressively instead of instant appearance
            squareOpacities[index] = Math.min(
              squareOpacities[index] + fadeInSpeed,
              maxOpacity
            );
          } else {
            // Fade out gradually
            squareOpacities[index] *= fadeOutSpeed;
          }

          if (squareOpacities[index] > 0.01) {
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${squareOpacities[index]})`;
            ctx.fillRect(
              i * (squareSize + gridGap),
              j * (squareSize + gridGap),
              squareSize,
              squareSize
            );
          }
        }
      }

      animationFrameId = requestAnimationFrame(drawGrid);
    };

    drawGrid();

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [
    squareSize,
    gridGap,
    flickerChance,
    color,
    width,
    height,
    maxOpacity,
    fadeInSpeed,
    fadeOutSpeed,
    isInView,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "w-full h-full pointer-events-none",
        className
      )}
    />
  );
}

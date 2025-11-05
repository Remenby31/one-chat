import { FC } from "react";
import { cn } from "@/lib/utils";

interface LoadingIndicatorProps {
  className?: string;
}

export const LoadingIndicator: FC<LoadingIndicatorProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="size-6 animate-spin text-muted-foreground [animation-duration:2s]"
        style={{ animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1)" }}
      >
        <rect
          x="30"
          y="30"
          width="40"
          height="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="miter"
          transform="rotate(45 50 50)"
        />
        <rect
          x="42"
          y="42"
          width="16"
          height="16"
          fill="currentColor"
          transform="rotate(45 50 50)"
        />
      </svg>
    </div>
  );
};

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ButtonProps } from "@/components/ui/button"

export function SlimButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      className={cn("h-7", className)}
      {...props}
    />
  )
}

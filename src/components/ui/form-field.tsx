import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { InputHTMLAttributes } from "react"

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
}

export function FormField({ label, id, className, ...props }: FormFieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm font-medium block mb-3">
        {label}
      </Label>
      <Input
        id={id}
        className={cn("h-8", className)}
        {...props}
      />
    </div>
  )
}

import { Check, ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ModelConfig } from "@/types/model"
import type { ApiKey } from "@/types/apiKey"

interface ModelSelectorProps {
  models: ModelConfig[]
  currentModel: ModelConfig | null
  apiKeys: ApiKey[]
  onModelChange: (model: ModelConfig) => void
  onAddModel: () => void
  opacity?: number
}

export function ModelSelector({ models, currentModel, apiKeys, onModelChange, onAddModel, opacity = 1 }: ModelSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 font-semibold hover:bg-accent/50 px-2"
        >
          <span className="text-base">
            {currentModel ? currentModel.name : "Select a model"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[280px]"
        style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
      >
        {models.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No models configured
          </div>
        ) : (
          models.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => onModelChange(model)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.model}</span>
              </div>
              {currentModel?.id === model.id && (
                <Check className="h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAddModel} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          <span>Add new model</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { useChatRuntime } from "@assistant-ui/react-ai-sdk"
import type { ModelConfig } from "@/types/model"

export type { ModelConfig }

export function useCustomRuntime(modelConfig: ModelConfig | null) {
  // For now, use a simple runtime that can be configured later
  const runtime = useChatRuntime({
    api: "/api/chat",
  })

  return runtime
}
import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react"
import type { FC } from "react"
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
  Square,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MarkdownText } from "@/components/assistant-ui/markdown-text"
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button"

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="aui-root aui-thread-root">
      <ThreadPrimitive.Viewport className="aui-thread-viewport">
        <ThreadWelcome />

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.If empty={false}>
          <div className="aui-thread-viewport-spacer" />
        </ThreadPrimitive.If>

        <div className="aui-thread-viewport-footer">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom"
      >
        <ArrowDownIcon className="h-4 w-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  )
}

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="aui-thread-welcome-root">
        <div className="aui-thread-welcome-center">
          <p className="aui-thread-welcome-message">
            Comment puis-je vous aider aujourd'hui?
          </p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  )
}

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions">
      <ThreadPrimitive.Suggestion
        className="aui-thread-welcome-suggestion"
        prompt="Qu'est-ce que OneChat?"
        method="replace"
        autoSend
      >
        <span className="aui-thread-welcome-suggestion-text">
          Qu'est-ce que OneChat?
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="aui-thread-welcome-suggestion"
        prompt="Comment configurer un modèle?"
        method="replace"
        autoSend
      >
        <span className="aui-thread-welcome-suggestion-text">
          Comment configurer un modèle?
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  )
}

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Écrivez un message..."
        className="aui-composer-input"
      />
      <ComposerAction />
    </ComposerPrimitive.Root>
  )
}

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Envoyer"
            variant="default"
            className="aui-composer-send"
          >
            <SendHorizontalIcon className="h-4 w-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Arrêter"
            variant="default"
            className="aui-composer-cancel"
          >
            <Square className="h-4 w-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  )
}

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-user-message-root">
      <UserActionBar />
      <div className="aui-user-message-content">
        <MessagePrimitive.Parts />
      </div>
      <BranchPicker className="aui-user-branch-picker" />
    </MessagePrimitive.Root>
  )
}

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Modifier">
          <PencilIcon className="h-4 w-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  )
}

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-edit-composer-root">
      <ComposerPrimitive.Input className="aui-edit-composer-input" />
      <div className="aui-edit-composer-footer">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">Annuler</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>Envoyer</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  )
}

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-assistant-message-root">
      <div className="aui-assistant-message-content">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
      <AssistantActionBar />
      <BranchPicker className="aui-assistant-branch-picker" />
    </MessagePrimitive.Root>
  )
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="aui-assistant-action-bar-root"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copier">
          <MessagePrimitive.If copied>
            <CheckIcon className="h-4 w-4" />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon className="h-4 w-4" />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Régénérer">
          <RefreshCwIcon className="h-4 w-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  )
}

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("aui-branch-picker-root", className)}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Précédent">
          <ChevronLeftIcon className="h-4 w-4" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Suivant">
          <ChevronRightIcon className="h-4 w-4" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
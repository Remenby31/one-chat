import { Label } from "@/components/ui/label"
import { ShieldAlert } from "lucide-react"
import type { MCPServer } from "@/types/mcp"

interface MCPConfigEditorProps {
  server: MCPServer
  onUpdate?: (server: MCPServer) => void
}

export function MCPConfigEditor({ server }: MCPConfigEditorProps) {
  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Basic Information</h3>

        <div className="space-y-2">
          <Label>Name</Label>
          <div className="text-sm bg-accent p-2 rounded">
            {server.name}
          </div>
        </div>

        {server.description && (
          <div className="space-y-2">
            <Label>Description</Label>
            <div className="text-sm bg-accent p-2 rounded">
              {server.description}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Command</Label>
          <div className="text-sm font-mono bg-accent p-2 rounded">
            {server.command}
          </div>
        </div>
      </div>

      {/* Arguments */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Arguments</h3>

        <div className="space-y-2">
          {server.args.map((arg, index) => (
            <div key={index} className="text-sm font-mono bg-accent p-2 rounded">
              {index + 1}. {arg}
            </div>
          ))}

          {server.args.length === 0 && (
            <p className="text-sm text-muted-foreground">No arguments</p>
          )}
        </div>
      </div>

      {/* Environment Variables */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Environment Variables</h3>

        <div className="space-y-2">
          {server.env && Object.entries(server.env).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{key}</Label>
              <div className="text-sm font-mono bg-accent p-2 rounded">
                {value.startsWith('$') ? value : '***'}
              </div>
            </div>
          ))}

          {(!server.env || Object.keys(server.env).length === 0) && (
            <p className="text-sm text-muted-foreground">No environment variables</p>
          )}
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Authentication</h3>

        <div className="space-y-2">
          <Label>Requires Authentication</Label>
          <div className="text-sm bg-accent p-2 rounded">
            {server.requiresAuth ? (
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Yes - {server.authType === 'oauth' ? 'OAuth 2.1' : server.authType === 'token' ? 'Token' : 'None'}
              </span>
            ) : (
              'No'
            )}
          </div>
        </div>

        {server.requiresAuth && server.authType === 'token' && server.authToken && (
          <div className="space-y-2">
            <Label>Auth Token</Label>
            <div className="text-sm font-mono bg-accent p-2 rounded">
              {server.authToken.startsWith('$') ? server.authToken : '***'}
            </div>
          </div>
        )}

        {server.requiresAuth && server.authType === 'oauth' && server.oauthConfig && (
          <div className="space-y-2">
            <Label>OAuth Configuration</Label>
            <div className="space-y-1 text-sm">
              {server.oauthConfig.clientId && (
                <div className="bg-accent p-2 rounded">
                  <span className="text-muted-foreground">Client ID: </span>
                  {server.oauthConfig.clientId}
                </div>
              )}
              {server.oauthConfig.scopes && server.oauthConfig.scopes.length > 0 && (
                <div className="bg-accent p-2 rounded">
                  <span className="text-muted-foreground">Scopes: </span>
                  {server.oauthConfig.scopes.join(', ')}
                </div>
              )}
              <div className="bg-accent p-2 rounded">
                <span className="text-muted-foreground">Token Status: </span>
                {server.oauthConfig.accessToken ? '✓ Active' : '✗ Not authenticated'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <p className="text-sm text-blue-400">
          <strong>Note:</strong> Configuration is read-only. To modify server settings, delete and recreate the server.
        </p>
      </div>
    </div>
  )
}

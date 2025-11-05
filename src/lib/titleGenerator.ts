/**
 * Smart conversation title generator
 * Language-agnostic algorithm for extracting meaningful keywords and generating titles
 */

import type { ChatMessage } from "./chatStore"

// Type alias for compatibility
type ThreadMessage = ChatMessage

interface ExtractedEntities {
  properNouns: string[]
  technicalTerms: string[]
  acronyms: string[]
  keywords: string[]
}

/**
 * Extract text content from message
 */
function extractTextFromMessage(message: ThreadMessage): string {
  // ChatMessage.content is already a string
  return message.content.trim()
}

/**
 * Extract proper nouns (words starting with uppercase, not at sentence start)
 * Examples: React, Docker, TypeScript, Paris
 */
function extractProperNouns(text: string): string[] {
  const words = text.split(/\s+/)
  const properNouns: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, "") // Remove punctuation

    // Skip if empty or too short
    if (!word || word.length < 2) continue

    // Check if word starts with uppercase
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      // Skip if it's the first word (likely sentence start)
      // Unless it's clearly a proper noun (2+ uppercase letters or known pattern)
      const isLikelyProperNoun =
        i > 0 || // Not first word
        word.match(/^[A-Z][a-z]*[A-Z]/) || // Mixed case like TypeScript
        word.length >= 3 // Short words are less likely to be sentence starts

      if (isLikelyProperNoun) {
        properNouns.push(word)
      }
    }
  }

  return [...new Set(properNouns)] // Remove duplicates
}

/**
 * Extract technical terms (code patterns)
 * Examples: camelCase, snake_case, kebab-case, PascalCase, file.ts, http://example.com
 */
function extractTechnicalTerms(text: string): string[] {
  const technicalTerms: string[] = []

  // Pattern 1: camelCase or PascalCase
  const camelCasePattern = /\b[a-z]+[A-Z][a-zA-Z]*\b|\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g
  const camelCaseMatches = text.match(camelCasePattern)
  if (camelCaseMatches) {
    technicalTerms.push(...camelCaseMatches)
  }

  // Pattern 2: snake_case or kebab-case
  const snakeKebabPattern = /\b[a-z]+[_-][a-z]+[a-z_-]*\b/g
  const snakeKebabMatches = text.match(snakeKebabPattern)
  if (snakeKebabMatches) {
    technicalTerms.push(...snakeKebabMatches)
  }

  // Pattern 3: File extensions
  const filePattern = /\b\w+\.(js|ts|tsx|jsx|py|java|cpp|css|html|json|xml|yml|yaml|md|txt)\b/gi
  const fileMatches = text.match(filePattern)
  if (fileMatches) {
    technicalTerms.push(...fileMatches)
  }

  // Pattern 4: URLs or paths
  const urlPattern = /https?:\/\/[^\s]+|\/[a-z0-9_\-./]+/gi
  const urlMatches = text.match(urlPattern)
  if (urlMatches) {
    // Shorten URLs to domain or last path segment
    const shortened = urlMatches.map(url => {
      if (url.startsWith('http')) {
        try {
          const domain = new URL(url).hostname.replace('www.', '')
          return domain
        } catch {
          return url.substring(0, 20)
        }
      }
      // For paths, take last segment
      const segments = url.split('/').filter(Boolean)
      return segments[segments.length - 1] || url
    })
    technicalTerms.push(...shortened)
  }

  return [...new Set(technicalTerms)]
}

/**
 * Extract acronyms (2+ consecutive uppercase letters)
 * Examples: API, HTTP, CSS, REST, JSON
 */
function extractAcronyms(text: string): string[] {
  const acronymPattern = /\b[A-Z]{2,}\b/g
  const matches = text.match(acronymPattern)
  return matches ? [...new Set(matches)] : []
}

/**
 * Extract keywords by weighted frequency
 * Longer words and words appearing multiple times get higher scores
 */
function extractKeywordsByFrequency(messages: readonly ThreadMessage[]): string[] {
  const wordScores = new Map<string, number>()

  messages.forEach((message, messageIndex) => {
    const text = extractTextFromMessage(message)
    const words = text.split(/\s+/)

    words.forEach((rawWord, wordIndex) => {
      // Clean word
      const word = rawWord.toLowerCase().replace(/[^\w]/g, "")

      // Skip short words
      if (word.length < 4) return

      // Skip common numbers
      if (/^\d+$/.test(word)) return

      // Calculate score
      // - Longer words are more significant
      // - Words in later messages are slightly more important (conversation evolution)
      // - Words later in a message are slightly more important
      const lengthScore = word.length
      const positionScore = 1 + (wordIndex / words.length) * 0.2
      const messageScore = 1 + (messageIndex / messages.length) * 0.3
      const score = lengthScore * positionScore * messageScore

      // Accumulate score
      const currentScore = wordScores.get(word) || 0
      wordScores.set(word, currentScore + score)
    })
  })

  // Sort by score and return top words
  return Array.from(wordScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
}

/**
 * Extract all entities from text
 */
function extractEntities(text: string, allMessages: readonly ThreadMessage[]): ExtractedEntities {
  return {
    properNouns: extractProperNouns(text),
    technicalTerms: extractTechnicalTerms(text),
    acronyms: extractAcronyms(text),
    keywords: extractKeywordsByFrequency(allMessages.slice(0, 3)), // First 3 messages
  }
}

/**
 * Format title from selected keywords
 */
function formatTitle(keywords: string[], maxLength: number = 60): string {
  if (keywords.length === 0) return ""

  // Try to join with bullet separator
  const withBullets = keywords.slice(0, 3).join(" • ")
  if (withBullets.length <= maxLength) {
    return withBullets
  }

  // Try with just 2 keywords
  const twoKeywords = keywords.slice(0, 2).join(" • ")
  if (twoKeywords.length <= maxLength) {
    return twoKeywords
  }

  // Fall back to first keyword
  return keywords[0].substring(0, maxLength)
}

/**
 * Smart truncate: cut at word boundary, not in the middle
 */
function smartTruncate(text: string, maxLength: number = 60): string {
  if (text.length <= maxLength) return text

  // Find last space before maxLength
  const truncated = text.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(" ")

  if (lastSpace > maxLength * 0.6) {
    // Cut at last space if it's not too far back
    return truncated.substring(0, lastSpace) + "..."
  }

  // Otherwise just cut and add ellipsis
  return truncated.substring(0, maxLength - 3) + "..."
}

/**
 * Main function: Generate smart title from conversation
 *
 * Algorithm:
 * 1. If only 1 message: return first message (truncated if needed)
 * 2. Extract entities (proper nouns, technical terms, acronyms)
 * 3. If entities found: prioritize them
 * 4. Otherwise: use keyword frequency analysis
 * 5. Format and truncate intelligently
 */
export function generateConversationTitle(messages: readonly ThreadMessage[]): string {
  // Filter to user messages only
  const userMessages = messages.filter((msg) => msg.role === "user")

  if (userMessages.length === 0) {
    return "New conversation"
  }

  const firstMessage = extractTextFromMessage(userMessages[0])

  // If first message is short and clear, use it
  if (firstMessage.length <= 60 && firstMessage.length > 0) {
    return firstMessage
  }

  // Extract entities from first message
  const entities = extractEntities(firstMessage, userMessages)

  // Priority 1: Proper nouns + technical terms (most specific)
  const specificTerms = [
    ...entities.properNouns.slice(0, 2),
    ...entities.technicalTerms.slice(0, 1),
  ]

  if (specificTerms.length > 0) {
    const title = formatTitle(specificTerms)
    if (title) return title
  }

  // Priority 2: Acronyms + proper nouns
  const acronymsAndNouns = [
    ...entities.acronyms.slice(0, 1),
    ...entities.properNouns.slice(0, 2),
  ]

  if (acronymsAndNouns.length > 0) {
    const title = formatTitle(acronymsAndNouns)
    if (title) return title
  }

  // Priority 3: Keyword frequency analysis
  if (entities.keywords.length > 0) {
    const title = formatTitle(entities.keywords.slice(0, 3))
    if (title) return title
  }

  // Fallback: smart truncate first message
  if (firstMessage.length > 0) {
    return smartTruncate(firstMessage)
  }

  return "New conversation"
}

/**
 * Helper: Capitalize first letter of each word
 */
export function capitalizeTitle(title: string): string {
  return title
    .split(" ")
    .map((word) => {
      // Don't capitalize short words (articles, prepositions) unless first word
      const shortWords = ["a", "an", "the", "in", "on", "at", "to", "for", "of", "with"]
      if (shortWords.includes(word.toLowerCase())) {
        return word.toLowerCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

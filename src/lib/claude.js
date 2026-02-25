import Anthropic from '@anthropic-ai/sdk';

/**
 * Create a Claude API client from the environment API key.
 * Returns null if no key is configured.
 */
export function createClient(apiKey) {
  if (!apiKey || apiKey === 'your_api_key_here') return null;
  return new Anthropic({ apiKey });
}

/**
 * Call Claude and parse a JSON response.
 * Returns the parsed object or a fallback on failure.
 */
export async function callClaude({ apiKey, system, userPrompt, maxTokens = 2048, fallback = null }) {
  const client = createClient(apiKey);
  if (!client) {
    return fallback || { error: 'AI not configured. Set ANTHROPIC_API_KEY.' };
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].text.trim();
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) return JSON.parse(arrayMatch[0]);
      return fallback || { error: 'Failed to parse AI response', raw: text };
    }
  } catch (err) {
    console.error('Claude API error:', err.message);
    return fallback || { error: 'AI temporarily unavailable: ' + err.message };
  }
}

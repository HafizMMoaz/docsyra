/**
 * Action → prompt builder for Docsyra's AI integration.
 *
 * `buildPrompt` maps an `AIRunRequestBody` into a provider-agnostic
 * `AICompletionRequest`. Each action gets one stable system prompt (a good
 * caching prefix). Throws `AIError(…, 400)` when required fields are missing.
 */
import {
  AIError,
  type AICompletionRequest,
  type AIRunRequestBody,
} from "./types";

/**
 * Shared tail appended to every system prompt. The route streams the model's
 * output straight into the editor, so the response must be bare text.
 */
const OUTPUT_RULE =
  "Return ONLY the resulting text with no preamble, no explanation, no surrounding quotes, " +
  'no markdown code fences, and no leading phrases like "Here is" or "Sure". ' +
  "Your entire reply is inserted verbatim into a document editor.";

const SYSTEM_PROMPTS: Record<AIRunRequestBody["action"], string> = {
  improve:
    "You are an expert editor. Rewrite the user's text to be clearer, stronger, and more readable " +
    "while preserving its original meaning, language, and intent. " +
    OUTPUT_RULE,
  "fix-grammar":
    "You are a meticulous proofreader. Correct only grammar, spelling, and punctuation mistakes in the " +
    "user's text. Do not rephrase, restructure, or change the meaning, tone, or wording beyond what the " +
    "corrections require. " +
    OUTPUT_RULE,
  shorten:
    "You are an expert editor. Rewrite the user's text so it is noticeably shorter and more concise " +
    "while keeping its essential meaning, tone, and language. " +
    OUTPUT_RULE,
  lengthen:
    "You are an expert writer. Expand the user's text with relevant detail and elaboration so it is " +
    "noticeably longer, while keeping its meaning, tone, and language consistent. " +
    OUTPUT_RULE,
  "change-tone":
    "You are an expert editor. Rewrite the user's text in the requested tone while preserving its " +
    "meaning, key information, and language. " +
    OUTPUT_RULE,
  translate:
    "You are an expert translator. Translate the user's text into the requested target language, " +
    "preserving meaning, tone, and formatting as faithfully as possible. " +
    OUTPUT_RULE,
  generate:
    "You are an expert writer. Write the content the user asks for, clearly and well-structured. " +
    OUTPUT_RULE,
  continue:
    "You are an expert writer. Continue the user's document naturally from exactly where it ends, " +
    "matching its voice, tone, style, and language. Do not repeat the existing text — output only the " +
    "new continuation. " +
    OUTPUT_RULE,
  summarize:
    "You are an expert editor. Write a concise, accurate summary of the user's document that captures " +
    "its key points. " +
    OUTPUT_RULE,
  ask:
    "You are a helpful assistant. Answer the user's question using the provided document as context. " +
    "Be accurate and concise. If the document does not contain the answer, say so plainly. " +
    OUTPUT_RULE,
};

function requireField(value: string | undefined, message: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    throw new AIError(message, 400);
  }
  return trimmed;
}

/**
 * Builds a provider-agnostic completion request for the given editor action.
 * Throws `AIError(…, 400)` when a required field for the action is missing.
 */
export function buildPrompt(body: AIRunRequestBody): AICompletionRequest {
  const system = SYSTEM_PROMPTS[body.action];
  if (!system) {
    throw new AIError("Unknown AI action", 400);
  }

  let user: string;

  switch (body.action) {
    case "improve":
    case "fix-grammar":
    case "shorten":
    case "lengthen": {
      const input = requireField(body.input, "Selected text is required");
      user = input;
      break;
    }
    case "change-tone": {
      const input = requireField(body.input, "Selected text is required");
      const tone = requireField(body.instruction, "A target tone is required");
      user = `Target tone: ${tone}\n\nText:\n${input}`;
      break;
    }
    case "translate": {
      const input = requireField(body.input, "Selected text is required");
      const language = requireField(body.instruction, "A target language is required");
      user = `Target language: ${language}\n\nText:\n${input}`;
      break;
    }
    case "generate": {
      const instruction = requireField(body.instruction, "An instruction is required");
      user = instruction;
      break;
    }
    case "ask": {
      const question = requireField(body.instruction, "A question is required");
      const documentText = requireField(body.documentText, "Document text is required");
      user = `Document:\n${documentText}\n\nQuestion:\n${question}`;
      break;
    }
    case "continue": {
      const documentText = requireField(body.documentText, "Document text is required");
      user = documentText;
      break;
    }
    case "summarize": {
      const documentText = requireField(body.documentText, "Document text is required");
      user = documentText;
      break;
    }
    default: {
      // Exhaustiveness guard — every AIActionId is handled above.
      const _never: never = body.action;
      throw new AIError("Unknown AI action", 400);
    }
  }

  return {
    system,
    messages: [{ role: "user", content: user }],
  };
}

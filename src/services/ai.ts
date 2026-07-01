export interface AISettings {
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface AIScorecard {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/**
 * Service to connect with any OpenAI-compatible API endpoint
 * for summarization, card outlining, sparring, and scorecard evaluations.
 */
export class AIService {
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor(settings: AISettings) {
    this.apiKey = settings.apiKey;
    this.endpoint = settings.endpoint.replace(/\/$/, ""); // strip trailing slash
    this.model = settings.model;
  }

  /**
   * Helper to perform standard chat completion requests
   */
  private async chatCompletion(systemPrompt: string, userMessage: string, jsonMode = false): Promise<string> {
    if (!this.apiKey) {
      throw new Error("AI API Key not configured. Please add sk-... key in Settings.");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    };

    const body: Record<string, any> = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API request failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || "";
  }

  /**
   * Summarizes a debate case file into constructive flow outline notes.
   */
  async autoFillFlowTable(docContent: string): Promise<string> {
    const systemPrompt = `You are an expert NSDA debate flow summarizer. Outline the provided case document into concise, bulleted flow arguments suitable for note-taking in a flowing sheet. Focus on contentions, sub-points, and key card citations. Start your response with "**[AI DRAFT OUTLINE]**".`;
    return this.chatCompletion(systemPrompt, docContent);
  }

  /**
   * Generates the next AI response in a sparring session.
   */
  async sparringPartner(topic: string, side: "affirmative" | "negative", history: { role: string; text: string }[]): Promise<string> {
    const opponentSide = side === "affirmative" ? "negative" : "affirmative";
    const systemPrompt = `You are a world-class debate sparring partner. The topic is "${topic}". The user is debating on the ${side} side, and you are debating on the ${opponentSide} side. Analyze the user's latest speech and output your constructive or rebuttal counter-speech. Keep your speech concise, analytical, and structured, targeting their main points.`;

    const chatHistory = history.map(m => `${m.role === "user" ? "User (Debater)" : "AI (Sparring Partner)"}: ${m.text}`).join("\n\n");
    return this.chatCompletion(systemPrompt, `Debate History:\n${chatHistory}\n\nGenerate your response.`);
  }

  /**
   * Evaluates the practice transcripts and yields a structured rating scorecard.
   */
  async evaluateSpeech(topic: string, side: string, history: { role: string; text: string }[]): Promise<AIScorecard> {
    const systemPrompt = `You are a professional NSDA debate judge. Evaluate the user's performance in the sparring session. You MUST respond with a strict JSON object containing:
    {
      "score": number (1-100 rating),
      "strengths": string[] (list of 2-3 key strengths),
      "weaknesses": string[] (list of 2-3 key weaknesses),
      "suggestions": string[] (list of 2-3 concrete recommendations)
    }`;

    const chatHistory = history.map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n\n");
    const prompt = `Topic: ${topic}\nUser Side: ${side}\n\nSession Transcript:\n${chatHistory}`;

    const rawResponse = await this.chatCompletion(systemPrompt, prompt, true);
    
    try {
      return JSON.parse(rawResponse) as AIScorecard;
    } catch (e) {
      // Fallback parsing if JSON mode is not fully supported by endpoint
      console.warn("AI JSON parse failed, extracting via regex...", e);
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIScorecard;
      }
      throw new Error("Failed to parse evaluation response from AI model.");
    }
  }
}

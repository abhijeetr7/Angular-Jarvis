import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DialogTurn, Intent } from '../models/jarvis.interfaces';

@Injectable({ providedIn: 'root' })
export class DialogManagerService {
  private conversationHistory: DialogTurn[] = [];
  private readonly maxHistoryLength = 20;

  public history$ = new BehaviorSubject<DialogTurn[]>([]);
  public currentContext$ = new BehaviorSubject<any>({});

  private systemPrompt = `You are JARVIS, an advanced AI assistant inspired by Tony Stark's AI. You are helpful, intelligent, and slightly witty. 

Key capabilities:
- Answer questions and provide information
- Control smart home devices
- Open websites and applications
- Set reminders and timers
- Search the web
- Perform calculations

Always respond concisely but helpfully. If you need to perform an action, clearly indicate what you're doing.

Available actions: open_url, web_search, set_timer, smart_home_control, calculate, get_weather

Respond in JSON format when an action is needed:
{
  "response": "I'll open Google for you.",
  "action": "open_url",
  "parameters": {"url": "https://google.com"}
}

For general conversation, just respond normally.`;

  constructor() {
    this.addSystemMessage('JARVIS online. How may I assist you today?');
  }

  addMessage(
    type: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: any
  ): void {
    const message: DialogTurn = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      content,
      metadata,
    };

    this.conversationHistory.push(message);

    // Keep history manageable
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(
        -this.maxHistoryLength
      );
    }

    this.history$.next([...this.conversationHistory]);
  }

  addUserMessage(content: string): void {
    this.addMessage('user', content);
  }

  addAssistantMessage(content: string, metadata?: any): void {
    this.addMessage('assistant', content, metadata);
  }

  addSystemMessage(content: string): void {
    this.addMessage('system', content);
  }

  getRecentHistory(turns: number = 6): DialogTurn[] {
    return this.conversationHistory.slice(-turns);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.history$.next([]);
    this.addSystemMessage('Conversation history cleared.');
  }

  getContext(): any {
    return this.currentContext$.value;
  }

  updateContext(updates: any): void {
    const currentContext = this.currentContext$.value;
    const newContext = { ...currentContext, ...updates };
    this.currentContext$.next(newContext);
  }

  // Check if the last few messages suggest we should wake up
  shouldWakeUp(transcript: string): boolean {
    const wakeWords = ['hey jarvis', 'jarvis', 'hey j.a.r.v.i.s'];
    const lowerTranscript = transcript.toLowerCase();

    return wakeWords.some((word) => lowerTranscript.includes(word));
  }

  extractIntent(transcript: string): Intent | null {
    const lowerTranscript = transcript.toLowerCase();

    // Simple rule-based intent extraction
    const intentPatterns = [
      {
        pattern: /open (.*?)(?:\s|$)/,
        intent: 'open_url',
        extractor: (match: RegExpMatchArray) => ({ url: match[1] }),
      },
      {
        pattern: /search for (.*?)(?:\s|$)/,
        intent: 'web_search',
        extractor: (match: RegExpMatchArray) => ({ query: match[1] }),
      },
      {
        pattern:
          /set (?:a )?timer for (\d+) ?(minutes?|min|seconds?|sec|hours?|hr)/i,
        intent: 'set_timer',
        extractor: (match: RegExpMatchArray) => ({
          duration: match[1],
          unit: match[2],
        }),
      },
      {
        pattern: /what(?:'s| is) the weather/,
        intent: 'get_weather',
        extractor: () => ({}),
      },
      {
        pattern: /calculate (.*?)(?:\s|$)/,
        intent: 'calculate',
        extractor: (match: RegExpMatchArray) => ({ expression: match[1] }),
      },
      {
        pattern: /(turn on|turn off|dim|brighten) (?:the )?(.*?)(?:\s|$)/,
        intent: 'smart_home_control',
        extractor: (match: RegExpMatchArray) => ({
          action: match[1],
          device: match[2],
        }),
      },
    ];

    for (const { pattern, intent, extractor } of intentPatterns) {
      const match = lowerTranscript.match(pattern);
      if (match) {
        return {
          name: intent,
          confidence: 0.8,
          parameters: extractor(match),
        };
      }
    }

    return null;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

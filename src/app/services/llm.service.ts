import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LLMRequest, LLMResponse, Intent } from '../models/jarvis.interfaces';

@Injectable({providedIn: 'root'})
export class LlmService {
  private readonly localEndpoint = 'http://localhost:5000/api/llm';
  private readonly huggingFaceEndpoint = 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium';
  
  public isConnected$ = new BehaviorSubject<boolean>(false);
  public currentProvider$ = new BehaviorSubject<'local' | 'cloud' | 'fallback'>('fallback');

  constructor(private http: HttpClient) {
    this.checkConnections();
  }

  async query(request: LLMRequest): Promise<LLMResponse> {
    // Try local LLM first
    try {
      const response = await this.queryLocal(request).toPromise();
      if (response) {
        this.currentProvider$.next('local');
        return response;
      }
    } catch (error) {
      console.warn('Local LLM not available:', error);
    }

    // Fallback to rule-based responses
    return this.getFallbackResponse(request);
  }

  private queryLocal(request: LLMRequest): Observable<LLMResponse> {
    const payload = {
      prompt: this.buildPrompt(request),
      max_tokens: request.maxTokens || 150,
      temperature: request.temperature || 0.7,
      stop: ['\n\nUser:', '\n\nJARVIS:']
    };

    return this.http.post<any>(this.localEndpoint, payload).pipe(
      map(response => ({
        response: response.choices?.[0]?.text || response.response || 'I apologize, but I encountered an error processing your request.',
        metadata: { provider: 'local', model: response.model }
      })),
      catchError(error => {
        console.error('Local LLM error:', error);
        throw error;
      })
    );
  }

  private getFallbackResponse(request: LLMRequest): LLMResponse {
    const userMessage = request.prompt.toLowerCase();
    
    // Pattern matching for common queries
    const responses: Record<string, string> = {
      'hello': 'Hello! I\'m JARVIS, your AI assistant. How may I help you today?',
      'hi': 'Hello! How can I assist you?',
      'how are you': 'I\'m functioning optimally, thank you for asking. How may I assist you?',
      'what can you do': 'I can help you with web searches, opening websites, setting timers, controlling smart home devices, performing calculations, and answering questions. What would you like to do?',
      'thank you': 'You\'re welcome! Is there anything else I can help you with?',
      'goodbye': 'Goodbye! Feel free to call on me anytime you need assistance.',
      'what time is it': `The current time is ${new Date().toLocaleTimeString()}.`,
      'what date is it': `Today is ${new Date().toLocaleDateString()}.`
    };

    // Check for exact matches
    for (const [key, response] of Object.entries(responses)) {
      if (userMessage.includes(key)) {
        this.currentProvider$.next('fallback');
        return { response, metadata: { provider: 'fallback' } };
      }
    }

    // Default response
    this.currentProvider$.next('fallback');
    return {
      response: 'I understand you\'re asking about "' + request.prompt + '". While I don\'t have specific information about that right now, I\'m here to help with web searches, opening websites, timers, and basic assistance. What would you like me to do?',
      metadata: { provider: 'fallback' }
    };
  }

  private buildPrompt(request: LLMRequest): string {
    let prompt = request.systemPrompt || '';
    
    // Add conversation history
    if (request.history.length > 0) {
      prompt += '\n\nConversation history:\n';
      request.history.forEach(turn => {
        const speaker = turn.type === 'user' ? 'User' : 'JARVIS';
        prompt += `${speaker}: ${turn.content}\n`;
      });
    }
    
    prompt += `\nUser: ${request.prompt}\nJARVIS:`;
    
    return prompt;
  }

  private async checkConnections(): Promise<void> {
    try {
      // Check if local LLM is available
      await this.http.get(`${this.localEndpoint}/health`, { timeout: 5000 }).toPromise();
      this.isConnected$.next(true);
      this.currentProvider$.next('local');
    } catch (error) {
      this.isConnected$.next(false);
      this.currentProvider$.next('fallback');
    }
  }

  // Utility method to parse JSON responses that might contain actions
  parseActionResponse(response: string): { text: string; action?: string; parameters?: any } {
    try {
      const parsed = JSON.parse(response);
      return {
        text: parsed.response || response,
        action: parsed.action,
        parameters: parsed.parameters
      };
    } catch {
      return { text: response };
    }
  }
}
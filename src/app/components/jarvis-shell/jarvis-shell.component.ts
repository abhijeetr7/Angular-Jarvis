import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, combineLatest, debounceTime } from 'rxjs';

import { VoiceService } from '../../services/voice.service';
import { DialogManagerService } from '../../services/dialog-manager.service';
import { LlmService } from '../../services/llm.service';
import { ActionRouterService } from '../../services/action-router.service';
import { DialogTurn, VoiceState } from '../../models/jarvis.interfaces';

@Component({
  selector: 'app-jarvis-shell',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="jarvis-container">
      <!-- Header -->
      <div class="header">
        <div class="logo">
          <div class="arc-reactor" [class.active]="voiceState.isListening || voiceState.isSpeaking">
            <div class="core"></div>
            <div class="ring ring-1"></div>
            <div class="ring ring-2"></div>
            <div class="ring ring-3"></div>
          </div>
          <h1>J.A.R.V.I.S.</h1>
        </div>
        <div class="status">
          <span class="provider-badge" [class]="'provider-' + currentProvider">
            {{ currentProvider === 'local' ? 'Local' : currentProvider === 'cloud' ? 'Cloud' : 'Fallback' }}
          </span>
          <span class="connection-status" [class.connected]="isConnected">
            {{ isConnected ? 'Connected' : 'Offline' }}
          </span>
        </div>
      </div>

      <!-- Voice Visualization -->
      <div class="voice-visualizer" [class.active]="voiceState.isListening">
        <canvas #visualizerCanvas width="400" height="100"></canvas>
        <div class="voice-indicator">
          <div class="pulse" [class.active]="voiceState.isListening || voiceState.isSpeaking"></div>
        </div>
      </div>

      <!-- Current Transcript -->
      <div class="current-transcript" *ngIf="voiceState.currentTranscript">
        <div class="transcript-text">{{ voiceState.currentTranscript }}</div>
      </div>

      <!-- Conversation History -->
      <div class="conversation-container" #conversationContainer>
        <div class="conversation-history">
          <div 
            *ngFor="let turn of conversationHistory; trackBy: trackByTurnId" 
            class="message"
            [class]="'message-' + turn.type">
            <div class="message-avatar">
              <span *ngIf="turn.type === 'user'">👤</span>
              <span *ngIf="turn.type === 'assistant'">🤖</span>
              <span *ngIf="turn.type === 'system'">⚙️</span>
            </div>
            <div class="message-content">
              <div class="message-text" [class.typing]="turn.id === typingMessageId">{{ turn.content }}</div>
              <div class="message-time">{{ formatTime(turn.timestamp) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <button 
          class="voice-button"
          [class.listening]="voiceState.isListening"
          [class.processing]="voiceState.isProcessing"
          [class.speaking]="voiceState.isSpeaking"
          (mousedown)="startListening()"
          (mouseup)="stopListening()"
          (mouseleave)="stopListening()"
          [disabled]="voiceState.isProcessing || voiceState.isSpeaking">
          <span *ngIf="!voiceState.isListening && !voiceState.isProcessing && !voiceState.isSpeaking">🎤</span>
          <span *ngIf="voiceState.isListening">⏹️</span>
          <span *ngIf="voiceState.isProcessing">⏳</span>
          <span *ngIf="voiceState.isSpeaking">🔊</span>
        </button>

        <div class="text-input-container">
          <input 
            type="text" 
            class="text-input"
            [(ngModel)]="textInput"
            (keyup.enter)="processTextInput()"
            placeholder="Type your message or press and hold the mic button..."
            [disabled]="voiceState.isProcessing">
          <button 
            class="send-button"
            (click)="processTextInput()"
            [disabled]="!textInput.trim() || voiceState.isProcessing">
            Send
          </button>
        </div>

        <button 
          class="action-button"
          (click)="toggleSettings()"
          title="Settings">
          ⚙️
        </button>
      </div>

      <!-- Settings Panel -->
      <div class="settings-panel" *ngIf="showSettings">
        <div class="settings-content">
          <h3>Settings</h3>
          
          <div class="setting-group">
            <label>Voice Rate</label>
            <input type="range" min="0.5" max="2" step="0.1" 
                   [value]="voiceConfig.rate" 
                   (input)="updateVoiceConfig('rate', $event)">
            <span>{{ voiceConfig.rate }}</span>
          </div>

          <div class="setting-group">
            <label>Voice Pitch</label>
            <input type="range" min="0" max="2" step="0.1" 
                   [value]="voiceConfig.pitch" 
                   (input)="updateVoiceConfig('pitch', $event)">
            <span>{{ voiceConfig.pitch }}</span>
          </div>

          <div class="setting-group">
            <label>Volume</label>
            <input type="range" min="0" max="1" step="0.1" 
                   [value]="voiceConfig.volume" 
                   (input)="updateVoiceConfig('volume', $event)">
            <span>{{ voiceConfig.volume }}</span>
          </div>

          <div class="setting-actions">
            <button (click)="clearHistory()" class="danger-button">Clear History</button>
            <button (click)="testVoice()" class="test-button">Test Voice</button>
          </div>
        </div>
      </div>

      <!-- Help Text -->
      <div class="help-text">
        <p><strong>Controls:</strong> Press and hold 🎤 to talk, or use Ctrl+Space. Type messages in the text box.</p>
        <p><strong>Commands:</strong> "Open Google", "Search for cats", "Set timer for 5 minutes", "Calculate 2 + 2", "What time is it?"</p>
      </div>
    </div>
  `,
  styleUrl: './jarvis-shell.component.css'
})
export class JarvisShellComponent implements OnInit, OnDestroy {
  @ViewChild('conversationContainer', { static: true }) conversationContainer!: ElementRef;
  @ViewChild('visualizerCanvas', { static: true }) visualizerCanvas!: ElementRef<HTMLCanvasElement>;

  private destroy$ = new Subject<void>();
  
  voiceState: VoiceState = {
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    currentTranscript: '',
    confidence: 0
  };

  conversationHistory: DialogTurn[] = [];
  textInput = '';
  showSettings = false;
  voiceConfig: any = {};
  currentProvider = 'fallback';
  isConnected = false;
  typingMessageId: string | null = null;

  private canvasContext?: CanvasRenderingContext2D;
  private animationFrame?: number;

  constructor(
    private voiceService: VoiceService,
    private dialogManager: DialogManagerService,
    private llmService: LlmService,
    private actionRouter: ActionRouterService
  ) {}

  ngOnInit(): void {
    this.setupSubscriptions();
    this.initializeCanvas();
    this.voiceConfig = this.voiceService.getConfig();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private setupSubscriptions(): void {
    // Voice state updates
    this.voiceService.voiceState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.voiceState = state;
      });

    // Final transcript processing
    this.voiceService.finalTranscript$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(transcript => {
        if (transcript.trim()) {
          this.processVoiceInput(transcript);
        }
      });

    // Conversation history updates
    this.dialogManager.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(history => {
        this.conversationHistory = history;
        this.scrollToBottom();
      });

    // LLM service status
    combineLatest([
      this.llmService.isConnected$,
      this.llmService.currentProvider$
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([connected, provider]) => {
        this.isConnected = connected;
        this.currentProvider = provider;
      });

    // Audio level visualization
    this.voiceService.audioLevel$
      .pipe(takeUntil(this.destroy$))
      .subscribe(level => {
        this.updateVisualization(level);
      });

    // Voice errors
    this.voiceService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.dialogManager.addSystemMessage(`Voice error: ${error}`);
      });
  }

  private initializeCanvas(): void {
    const canvas = this.visualizerCanvas?.nativeElement;
    if (canvas) {
      this.canvasContext = canvas.getContext('2d') || undefined;
    }
  }

  startListening(): void {
    this.voiceService.startListening();
  }

  stopListening(): void {
    this.voiceService.stopListening();
  }

  processTextInput(): void {
    if (!this.textInput.trim()) return;
    
    const input = this.textInput;
    this.textInput = '';
    this.processUserInput(input);
  }

  private async processVoiceInput(transcript: string): Promise<void> {
    // Check for wake word
    if (!this.dialogManager.shouldWakeUp(transcript)) {
      return;
    }

    // Remove wake word from transcript
    const cleanTranscript = transcript.replace(/hey jarvis|jarvis|hey j\.a\.r\.v\.i\.s/gi, '').trim();
    if (!cleanTranscript) {
      await this.voiceService.speak('Yes? How may I assist you?');
      return;
    }

    this.processUserInput(cleanTranscript);
  }

  private async processUserInput(input: string): Promise<void> {
    this.voiceState.isProcessing = true;
    this.dialogManager.addUserMessage(input);

    try {
      // Check for direct intent first
      const intent = this.dialogManager.extractIntent(input);
      
      if (intent) {
        // Execute action directly
        this.actionRouter.executeIntent(intent)
          .pipe(takeUntil(this.destroy$))
          .subscribe(async result => {
            const response = result.success ? result.message : `I'm sorry, ${result.message}`;
            this.dialogManager.addAssistantMessage(response, { action: intent.name, result });
            await this.voiceService.speak(response);
            this.voiceState.isProcessing = false;
          });
      } else {
        // Send to LLM for general conversation
        const llmResponse = await this.llmService.query({
          prompt: input,
          history: this.dialogManager.getRecentHistory(),
          systemPrompt: this.dialogManager.getSystemPrompt()
        });

        // Check if LLM response contains an action
        const parsed = this.llmService.parseActionResponse(llmResponse.response);
        
        if (parsed.action) {
          // Execute the action suggested by LLM
          this.actionRouter.executeAction(parsed.action, parsed.parameters || {})
            .pipe(takeUntil(this.destroy$))
            .subscribe(async result => {
              const response = parsed.text + (result.success ? '' : ` However, ${result.message}`);
              this.dialogManager.addAssistantMessage(response, { 
                llmResponse, 
                action: parsed.action, 
                actionResult: result 
              });
              await this.voiceService.speak(response);
              this.voiceState.isProcessing = false;
            });
        } else {
          // Regular conversation response
          this.dialogManager.addAssistantMessage(parsed.text, { llmResponse });
          await this.voiceService.speak(parsed.text);
          this.voiceState.isProcessing = false;
        }
      }
    } catch (error) {
      const errorMessage = 'I apologize, but I encountered an error processing your request.';
      this.dialogManager.addAssistantMessage(errorMessage);
      await this.voiceService.speak(errorMessage);
      this.voiceState.isProcessing = false;
    }
  }

  private updateVisualization(level: number): void {
    if (!this.canvasContext) return;

    const canvas = this.visualizerCanvas.nativeElement;
    const ctx = this.canvasContext;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw waveform visualization
    const centerY = canvas.height / 2;
    const barWidth = 4;
    const barSpacing = 6;
    const numBars = Math.floor(canvas.width / (barWidth + barSpacing));
    
    ctx.fillStyle = '#00d4ff';
    
    for (let i = 0; i < numBars; i++) {
      const x = i * (barWidth + barSpacing);
      const barHeight = Math.max(2, level * canvas.height * 0.8 * (Math.random() * 0.5 + 0.5));
      const y = centerY - barHeight / 2;
      
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  updateVoiceConfig(property: string, event: any): void {
    const value = parseFloat(event.target.value);
    this.voiceConfig[property] = value;
    this.voiceService.updateConfig({ [property]: value });
  }

  clearHistory(): void {
    this.dialogManager.clearHistory();
    this.showSettings = false;
  }

  async testVoice(): Promise<void> {
    await this.voiceService.speak('Voice test. JARVIS systems operational.');
  }

  trackByTurnId(index: number, turn: DialogTurn): string {
    return turn.id;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.conversationContainer) {
        const element = this.conversationContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }
}
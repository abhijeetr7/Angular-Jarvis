import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject, fromEvent, merge } from 'rxjs';
import { VoiceState, VoiceConfig } from '../models/jarvis.interfaces';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private recognition: any;
  private synthesis = window.speechSynthesis;
  // Observables
  public voiceState$ = new BehaviorSubject<VoiceState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    currentTranscript: '',
    confidence: 0,
  });

  public transcript$ = new Subject<string>();
  public finalTranscript$ = new Subject<string>();
  public error$ = new Subject<string>();
  public audioLevel$ = new Subject<number>();

  // Audio context for visualization
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private microphone?: MediaStreamAudioSourceNode;
  private dataArray?: Uint8Array;

  private config: VoiceConfig = {
    sttProvider: 'web-speech',
    ttsProvider: 'web-speech',
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
    volume: 0.8,
  };

  constructor(private zone: NgZone) {
    this.initializeSpeechRecognition();
    this.setupHotkeys();
  }

  private initializeSpeechRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.error$.next('Speech recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.config.language;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.zone.run(() => {
        this.updateVoiceState({ isListening: true });
      });
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        this.updateVoiceState({ isListening: false });
      });
    };

    this.recognition.onerror = (event: any) => {
      this.zone.run(() => {
        this.error$.next(`Speech recognition error: ${event.error}`);
        this.updateVoiceState({ isListening: false });
      });
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence || 0.5;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      this.zone.run(() => {
        if (interimTranscript) {
          this.updateVoiceState({ currentTranscript: interimTranscript });
          this.transcript$.next(interimTranscript);
        }

        if (finalTranscript) {
          this.finalTranscript$.next(finalTranscript.trim());
          this.updateVoiceState({ currentTranscript: '' });
        }
      });
    };
  }

  private setupHotkeys() {
    fromEvent<KeyboardEvent>(document, 'keydown').subscribe((event) => {
      // Ctrl + Space for push-to-talk
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        this.startListening();
      }
    });

    fromEvent<KeyboardEvent>(document, 'keyup').subscribe((event) => {
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        this.stopListening();
      }
    });
  }

  async startListening(): Promise<void> {
    try {
      if (!this.recognition) {
        throw new Error('Speech recognition not initialized');
      }

      // Setup audio visualization
      await this.initializeAudioVisualization();

      this.recognition.start();
    } catch (error) {
      this.error$.next(`Failed to start listening: ${error}`);
    }
  }

  stopListening(): void {
    if (this.recognition && this.voiceState$.value.isListening) {
      this.recognition.stop();
    }
    this.cleanupAudioVisualization();
  }

  async speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.config.language;
      utterance.rate = this.config.rate;
      utterance.pitch = this.config.pitch;
      utterance.volume = this.config.volume;

      utterance.onstart = () => {
        this.updateVoiceState({ isSpeaking: true });
      };

      utterance.onend = () => {
        this.updateVoiceState({ isSpeaking: false });
        resolve();
      };

      utterance.onerror = (event) => {
        this.updateVoiceState({ isSpeaking: false });
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.synthesis.speak(utterance);
    });
  }

  cancelSpeech(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.updateVoiceState({ isSpeaking: false });
    }
  }

  private async initializeAudioVisualization(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.microphone = this.audioContext.createMediaStreamSource(stream);

      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.microphone.connect(this.analyser);

      this.visualizeAudio();
    } catch (error) {
      console.warn('Audio visualization not available:', error);
    }
  }

  private visualizeAudio(): void {
    if (!this.analyser || !this.dataArray) return;

    const analyze = () => {
      // this.analyser!.getByteFrequencyData(this.dataArray! as Uint8Array);
      this.dataArray = new Uint8Array(this.analyser!.frequencyBinCount);

      // Calculate average volume
      const average =
        this.dataArray!.reduce((a, b) => a + b) / this.dataArray!.length;
      const normalizedLevel = Math.min(average / 128.0, 1.0);

      this.audioLevel$.next(normalizedLevel);

      if (this.voiceState$.value.isListening) {
        requestAnimationFrame(analyze);
      }
    };

    analyze();
  }

  private cleanupAudioVisualization(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
  }

  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.recognition) {
      this.recognition.lang = this.config.language;
    }
  }

  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  private updateVoiceState(updates: Partial<VoiceState>): void {
    const currentState = this.voiceState$.value;
    this.voiceState$.next({ ...currentState, ...updates });
  }
}

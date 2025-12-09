import * as vscode from 'vscode';

export class VoiceService {
    private recognition: any;
    private isListening: boolean = false;
    private resolveCallback: ((text: string) => void) | null = null;
    private rejectCallback: ((error: string) => void) | null = null;

    constructor() {
        // Initialize speech recognition
        this.initSpeechRecognition();
    }

    private initSpeechRecognition() {
        // Check if browser supports speech recognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event: any) => {
                if (event.results && event.results.length > 0) {
                    const transcript = event.results[0][0].transcript;
                    if (this.resolveCallback) {
                        this.resolveCallback(transcript);
                        this.resolveCallback = null;
                        this.rejectCallback = null;
                    }
                }
                this.isListening = false;
            };

            this.recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                if (this.rejectCallback) {
                    this.rejectCallback(`Speech recognition error: ${event.error}`);
                    this.resolveCallback = null;
                    this.rejectCallback = null;
                }
                this.isListening = false;
            };

            this.recognition.onend = () => {
                this.isListening = false;
                // If we didn't get a result, reject the promise
                if (this.rejectCallback) {
                    this.rejectCallback('No speech detected');
                    this.resolveCallback = null;
                    this.rejectCallback = null;
                }
            };
        } else {
            console.warn('Speech recognition not supported in this browser');
        }
    }

    public async startListening(): Promise<string> {
        return new Promise((resolve, reject) => {
            // If already listening, reject
            if (this.isListening) {
                reject('Already listening');
                return;
            }

            // If speech recognition is not supported
            if (!this.recognition) {
                reject('Speech recognition not supported');
                return;
            }

            this.resolveCallback = resolve;
            this.rejectCallback = reject;
            this.isListening = true;

            try {
                this.recognition.start();
            } catch (error) {
                this.isListening = false;
                reject(`Failed to start speech recognition: ${error}`);
            }
        });
    }

    public stopListening(): void {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }

    public isSupported(): boolean {
        return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    }

    public isActive(): boolean {
        return this.isListening;
    }
}

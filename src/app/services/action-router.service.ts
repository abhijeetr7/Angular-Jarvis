import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { JarvisAction, ActionResult, Intent } from '../models/jarvis.interfaces';

@Injectable({providedIn: 'root'})
export class ActionRouterService {
  private actions = new Map<string, JarvisAction>();

  constructor() {
    this.registerDefaultActions();
  }

  private registerDefaultActions(): void {
    this.registerAction({
      name: 'open_url',
      description: 'Open a URL in a new browser tab',
      parameters: ['url'],
      handler: async (params) => {
        const url = params['url'] || params['site'] || params['website'];
        if (!url) {
          return { success: false, message: 'No URL provided' };
        }
        
        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          // Handle common sites
          const shortcuts: Record<string, string> = {
            'google': 'https://google.com',
            'youtube': 'https://youtube.com',
            'github': 'https://github.com',
            'stackoverflow': 'https://stackoverflow.com',
            'reddit': 'https://reddit.com',
            'twitter': 'https://twitter.com',
            'facebook': 'https://facebook.com',
            'linkedin': 'https://linkedin.com',
            'gmail': 'https://gmail.com'
          };
          
          fullUrl = shortcuts[url.toLowerCase()] || `https://${url}`;
        }
        
        window.open(fullUrl, '_blank');
        return { success: true, message: `Opening ${fullUrl}` };
      }
    });

    this.registerAction({
      name: 'web_search',
      description: 'Perform a web search',
      parameters: ['query'],
      handler: async (params) => {
        const query = params['query'];
        if (!query) {
          return { success: false, message: 'No search query provided' };
        }
        
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(searchUrl, '_blank');
        return { success: true, message: `Searching for "${query}"` };
      }
    });

    this.registerAction({
      name: 'set_timer',
      description: 'Set a timer for specified duration',
      parameters: ['duration', 'unit'],
      handler: async (params) => {
        const duration = parseInt(params['duration']);
        const unit = params['unit'] || 'minutes';
        
        if (!duration || duration <= 0) {
          return { success: false, message: 'Invalid timer duration' };
        }
        
        let milliseconds = duration * 60000; // Default to minutes
        if (unit.includes('sec')) milliseconds = duration * 1000;
        if (unit.includes('hour') || unit.includes('hr')) milliseconds = duration * 3600000;
        
        setTimeout(() => {
          this.showTimerNotification(duration, unit);
        }, milliseconds);
        
        return { 
          success: true, 
          message: `Timer set for ${duration} ${unit}`,
          data: { duration, unit, milliseconds }
        };
      }
    });

    this.registerAction({
      name: 'calculate',
      description: 'Perform mathematical calculations',
      parameters: ['expression'],
      handler: async (params) => {
        const expression = params['expression'];
        if (!expression) {
          return { success: false, message: 'No expression provided' };
        }
        
        try {
          // Basic safety check - only allow numbers, operators, and common functions
          if (!/^[\d\s+\-*/.()sqrt,pow]+$/i.test(expression.replace(/sin|cos|tan|log/gi, ''))) {
            return { success: false, message: 'Invalid expression' };
          }
          
          // Use Function constructor for safe evaluation
          const result = Function(`"use strict"; return (${expression})`)();
          return { 
            success: true, 
            message: `${expression} = ${result}`,
            data: { expression, result }
          };
        } catch (error) {
          return { success: false, message: 'Invalid mathematical expression' };
        }
      }
    });

    this.registerAction({
      name: 'get_weather',
      description: 'Get current weather information',
      parameters: ['location'],
      handler: async (params) => {
        const location = params['location'] || 'current location';
        // This is a mock implementation - in production you'd call a weather API
        return { 
          success: true, 
          message: `I'd need to connect to a weather service to get the current weather for ${location}. This feature will be available with API integration.` 
        };
      }
    });

    this.registerAction({
      name: 'smart_home_control',
      description: 'Control smart home devices',
      parameters: ['action', 'device'],
      handler: async (params) => {
        const action = params['action'];
        const device = params['device'];
        
        // Mock smart home control - in production this would integrate with Home Assistant or similar
        return { 
          success: true, 
          message: `I would ${action} the ${device} if connected to a smart home system. This requires Home Assistant or similar integration.`,
          data: { action, device }
        };
      }
    });
  }

  registerAction(action: JarvisAction): void {
    this.actions.set(action.name, action);
  }

  executeAction(actionName: string, parameters: Record<string, any>): Observable<ActionResult> {
    const action = this.actions.get(actionName);
    
    if (!action) {
      return from(Promise.resolve({
        success: false,
        message: `Unknown action: ${actionName}`
      }));
    }

    return from(action.handler(parameters));
  }

  executeIntent(intent: Intent): Observable<ActionResult> {
    return this.executeAction(intent.name, intent.parameters);
  }

  getAvailableActions(): JarvisAction[] {
    return Array.from(this.actions.values());
  }

  private showTimerNotification(duration: number, unit: string): void {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`Timer Complete`, {
          body: `Your ${duration} ${unit} timer has finished!`,
          icon: '/favicon.ico'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(`Timer Complete`, {
              body: `Your ${duration} ${unit} timer has finished!`,
              icon: '/favicon.ico'
            });
          }
        });
      }
    }
    
    // Also play an audio alert
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmAaAUWZ2u/AaRsAMH7H8+OZSA0PVqzj7a1aFgdAl9/ts2EcBjiS2u3IdCUGKHfH8N2QQAoUXrTp66hVFApGn+DyvmAaAUWZ2u/AaRsAMH7H8+OZSA0PVqzj7a1aFg==');
    audio.play().catch(() => {});
  }
}
import { Component } from '@angular/core';
import { JarvisShellComponent } from './components/jarvis-shell/jarvis-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [JarvisShellComponent],
  template: `
    <app-jarvis-shell></app-jarvis-shell>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class AppComponent {
  title = 'Angular Jarvis';
}
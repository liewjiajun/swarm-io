/**
 * TouchControls Class
 *
 * Provides virtual joystick controls for mobile devices.
 * Features:
 * - Left-side virtual joystick for movement
 * - Touch-to-activate (appears where you touch in joystick zone)
 * - Smooth analog input with dead zone
 * - Visual feedback with base and knob
 * - Auto-detects mobile devices
 */

export interface TouchInput {
  dx: number;
  dy: number;
  active: boolean;
}

export class TouchControls {
  private container: HTMLElement;
  private joystickBase: HTMLElement;
  private joystickKnob: HTMLElement;
  private joystickZone: HTMLElement;

  private active: boolean = false;
  private touchId: number | null = null;
  private baseX: number = 0;
  private baseY: number = 0;
  private knobX: number = 0;
  private knobY: number = 0;

  // Joystick configuration
  private readonly baseRadius: number = 60;
  private readonly knobRadius: number = 25;
  private readonly deadZone: number = 0.15;
  private readonly maxDistance: number = 50;

  // Current input state
  private currentInput: TouchInput = { dx: 0, dy: 0, active: false };

  // Mobile detection flag
  private isMobileDevice: boolean = false;

  constructor() {
    this.isMobileDevice = this.detectMobile();

    // Create container element
    this.container = document.createElement('div');
    this.container.className = 'touch-controls-container';

    // Create joystick zone (left half of screen)
    this.joystickZone = document.createElement('div');
    this.joystickZone.className = 'joystick-zone';

    // Create joystick base (semi-transparent circle)
    this.joystickBase = document.createElement('div');
    this.joystickBase.className = 'joystick-base';

    // Create joystick knob (movable part)
    this.joystickKnob = document.createElement('div');
    this.joystickKnob.className = 'joystick-knob';

    // Assemble DOM
    this.joystickBase.appendChild(this.joystickKnob);
    this.joystickZone.appendChild(this.joystickBase);
    this.container.appendChild(this.joystickZone);

    // Add styles
    this.addStyles();

    // Add to DOM
    document.body.appendChild(this.container);

    // Setup event listeners
    this.setupEventListeners();

    // Initially hide if not mobile
    if (!this.isMobileDevice) {
      this.hide();
    }

    console.log(`[TouchControls] Initialized. Mobile detected: ${this.isMobileDevice}`);
  }

  /**
   * Detects if the current device is mobile/touch-enabled
   */
  private detectMobile(): boolean {
    // Check for touch support
    const hasTouchScreen = 'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-ignore - for older browsers
      navigator.msMaxTouchPoints > 0;

    // Check user agent for mobile devices
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
    const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));

    // Check screen size (typical mobile threshold)
    const isSmallScreen = window.innerWidth <= 1024 && window.innerHeight <= 1366;

    // Consider it mobile if it has touch AND (mobile UA OR small screen)
    return hasTouchScreen && (isMobileUA || isSmallScreen);
  }

  /**
   * Injects CSS styles for touch controls
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.id = 'touch-controls-styles';
    style.textContent = `
      .touch-controls-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
        touch-action: none;
      }

      .touch-controls-container.hidden {
        display: none;
      }

      .joystick-zone {
        position: absolute;
        left: 0;
        top: 0;
        width: 50%;
        height: 100%;
        pointer-events: auto;
        touch-action: none;
      }

      .joystick-base {
        position: absolute;
        width: ${this.baseRadius * 2}px;
        height: ${this.baseRadius * 2}px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        border: 3px solid rgba(255, 255, 255, 0.3);
        opacity: 0;
        transition: opacity 0.15s ease;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .joystick-base.active {
        opacity: 1;
      }

      .joystick-knob {
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${this.knobRadius * 2}px;
        height: ${this.knobRadius * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, rgba(78, 205, 196, 0.9), rgba(26, 188, 156, 0.8));
        border: 2px solid rgba(255, 255, 255, 0.5);
        transform: translate(-50%, -50%);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        pointer-events: none;
      }

      /* Mobile-specific HUD adjustments */
      @media (max-width: 768px), (hover: none) and (pointer: coarse) {
        .hud-topleft {
          transform: scale(0.8);
          transform-origin: top left;
        }

        .hud-topright {
          transform: scale(0.75);
          transform-origin: top right;
        }

        .hud-bottomleft {
          left: auto !important;
          right: 20px;
          bottom: 100px !important;
          transform: scale(0.8);
          transform-origin: bottom right;
        }

        .hud-bottomright {
          transform: scale(0.8);
          transform-origin: bottom right;
          bottom: 170px !important;
        }

        .hud-minimap {
          transform: translateX(-50%) scale(0.7);
          transform-origin: bottom center;
        }

        .settings-btn {
          right: 170px !important;
          transform: scale(0.9);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Sets up touch event listeners
   */
  private setupEventListeners(): void {
    // Touch start - begin joystick interaction
    this.joystickZone.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });

    // Touch move - update joystick position
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });

    // Touch end - release joystick
    document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    document.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });

    // Handle window resize to re-detect mobile
    window.addEventListener('resize', () => {
      const wasMobile = this.isMobileDevice;
      this.isMobileDevice = this.detectMobile();
      if (this.isMobileDevice !== wasMobile) {
        if (this.isMobileDevice) {
          this.show();
        } else {
          this.hide();
        }
      }
    });
  }

  /**
   * Handles touch start event
   */
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();

    // Only track first touch in joystick zone
    if (this.touchId !== null) return;

    const touch = e.changedTouches[0];
    this.touchId = touch.identifier;

    // Position joystick base at touch point
    this.baseX = touch.clientX;
    this.baseY = touch.clientY;
    this.knobX = this.baseX;
    this.knobY = this.baseY;

    // Update visual position
    this.joystickBase.style.left = `${this.baseX}px`;
    this.joystickBase.style.top = `${this.baseY}px`;
    this.joystickBase.classList.add('active');

    this.active = true;
    this.currentInput.active = true;

    // Reset knob to center
    this.updateKnobPosition(0, 0);
  }

  /**
   * Handles touch move event
   */
  private handleTouchMove(e: TouchEvent): void {
    if (this.touchId === null) return;

    // Find our tracked touch
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        e.preventDefault();

        // Calculate offset from base
        const offsetX = touch.clientX - this.baseX;
        const offsetY = touch.clientY - this.baseY;

        // Calculate distance
        const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

        // Clamp to max distance
        let clampedX = offsetX;
        let clampedY = offsetY;
        if (distance > this.maxDistance) {
          const ratio = this.maxDistance / distance;
          clampedX = offsetX * ratio;
          clampedY = offsetY * ratio;
        }

        // Update knob visual
        this.updateKnobPosition(clampedX, clampedY);

        // Calculate normalized input (-1 to 1)
        const normalizedX = clampedX / this.maxDistance;
        const normalizedY = clampedY / this.maxDistance;

        // Apply dead zone
        const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
        if (magnitude < this.deadZone) {
          this.currentInput.dx = 0;
          this.currentInput.dy = 0;
        } else {
          // Rescale to remove dead zone
          const scale = (magnitude - this.deadZone) / (1 - this.deadZone);
          this.currentInput.dx = (normalizedX / magnitude) * scale;
          this.currentInput.dy = (normalizedY / magnitude) * scale;
        }

        break;
      }
    }
  }

  /**
   * Handles touch end event
   */
  private handleTouchEnd(e: TouchEvent): void {
    // Check if our tracked touch ended
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        this.touchId = null;
        this.active = false;
        this.currentInput = { dx: 0, dy: 0, active: false };

        // Hide joystick base
        this.joystickBase.classList.remove('active');

        // Reset knob position
        this.updateKnobPosition(0, 0);

        break;
      }
    }
  }

  /**
   * Updates the knob visual position
   */
  private updateKnobPosition(offsetX: number, offsetY: number): void {
    this.joystickKnob.style.left = `calc(50% + ${offsetX}px)`;
    this.joystickKnob.style.top = `calc(50% + ${offsetY}px)`;
  }

  /**
   * Gets the current touch input state
   */
  getInput(): TouchInput {
    return { ...this.currentInput };
  }

  /**
   * Returns whether touch controls are active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Returns whether the device is detected as mobile
   */
  isMobile(): boolean {
    return this.isMobileDevice;
  }

  /**
   * Shows the touch controls
   */
  show(): void {
    this.container.classList.remove('hidden');
  }

  /**
   * Hides the touch controls
   */
  hide(): void {
    this.container.classList.add('hidden');
  }

  /**
   * Force enable touch controls (for testing on desktop)
   */
  forceEnable(): void {
    this.isMobileDevice = true;
    this.show();
    console.log('[TouchControls] Force enabled');
  }

  /**
   * Destroys touch controls and cleans up
   */
  destroy(): void {
    this.container.remove();
    const style = document.getElementById('touch-controls-styles');
    if (style) {
      style.remove();
    }
  }
}

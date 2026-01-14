import type { WeaponType } from '@swarm-io/shared';

/**
 * AudioManager - Handles all game audio using Web Audio API
 *
 * Why Web Audio API:
 * - Better performance than HTML5 Audio for multiple simultaneous sounds
 * - Precise timing control for game events
 * - Built-in support for spatial audio (future enhancement)
 * - Fine-grained volume control per sound type
 *
 * Browser Autoplay Policy:
 * - Modern browsers require user interaction before playing audio
 * - We attempt to unlock audio context on first user click/keypress
 * - Sounds are queued until audio is unlocked
 */
export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;

  private isUnlocked: boolean = false;
  private pendingSounds: Array<() => void> = [];

  // Volume settings (0.0 to 1.0)
  private masterVolume: number = 0.7;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.5;

  // Sound generation parameters for each weapon
  private readonly weaponSoundParams: Record<WeaponType, SoundParams> = {
    knife: { frequency: 800, duration: 0.08, type: 'sawtooth', attack: 0.01, decay: 0.07 },
    wand: { frequency: 600, duration: 0.15, type: 'sine', attack: 0.02, decay: 0.13, frequencyEnd: 400 },
    bible: { frequency: 300, duration: 0.2, type: 'sine', attack: 0.05, decay: 0.15 },
    garlic: { frequency: 150, duration: 0.3, type: 'square', attack: 0.05, decay: 0.25 },
    lightning: { frequency: 1200, duration: 0.12, type: 'sawtooth', attack: 0.01, decay: 0.11, frequencyEnd: 200 },
    axe: { frequency: 250, duration: 0.2, type: 'triangle', attack: 0.02, decay: 0.18 },
    fireball: { frequency: 400, duration: 0.25, type: 'sawtooth', attack: 0.03, decay: 0.22, frequencyEnd: 100 },
    whip: { frequency: 900, duration: 0.1, type: 'sawtooth', attack: 0.01, decay: 0.09, frequencyEnd: 300 },
  };

  constructor() {
    this.setupAudioUnlock();
    console.log('[AudioManager] Initialized, waiting for user interaction to unlock audio');
  }

  /**
   * Sets up event listeners to unlock audio on user interaction
   * This is required by browser autoplay policies
   */
  private setupAudioUnlock(): void {
    const unlock = () => {
      if (this.isUnlocked) return;

      this.initAudioContext();

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('[AudioManager] Audio context resumed successfully');
          this.isUnlocked = true;
          this.processPendingSounds();
        }).catch(err => {
          console.warn('[AudioManager] Failed to resume audio context:', err);
        });
      } else if (this.audioContext) {
        this.isUnlocked = true;
        this.processPendingSounds();
      }
    };

    // Listen for user interaction events
    document.addEventListener('click', unlock, { once: false });
    document.addEventListener('keydown', unlock, { once: false });
    document.addEventListener('touchstart', unlock, { once: false });
  }

  /**
   * Initialize the Web Audio API context and gain nodes
   */
  private initAudioContext(): void {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create master gain node
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.masterVolume;
      this.masterGainNode.connect(this.audioContext.destination);

      // Create SFX gain node
      this.sfxGainNode = this.audioContext.createGain();
      this.sfxGainNode.gain.value = this.sfxVolume;
      this.sfxGainNode.connect(this.masterGainNode);

      // Create music gain node
      this.musicGainNode = this.audioContext.createGain();
      this.musicGainNode.gain.value = this.musicVolume;
      this.musicGainNode.connect(this.masterGainNode);

      console.log('[AudioManager] Audio context initialized');
    } catch (error) {
      console.error('[AudioManager] Failed to create audio context:', error);
    }
  }

  /**
   * Process any sounds that were queued before audio was unlocked
   */
  private processPendingSounds(): void {
    console.log(`[AudioManager] Processing ${this.pendingSounds.length} pending sounds`);
    const sounds = [...this.pendingSounds];
    this.pendingSounds = [];
    sounds.forEach(playFn => playFn());
  }

  // Pitch variation range (±8% by default) to prevent repetitive sounds
  private readonly pitchVariation: number = 0.08;

  /**
   * Apply random pitch variation to prevent sound repetition fatigue
   * @param baseFrequency - The base frequency to vary
   * @returns Frequency with random variation applied
   */
  private applyPitchVariation(baseFrequency: number): number {
    const variation = 1 + (Math.random() * 2 - 1) * this.pitchVariation;
    return baseFrequency * variation;
  }

  /**
   * Play a synthesized sound effect with automatic pitch variation
   */
  private playSound(params: SoundParams, volume: number = 1.0): void {
    const play = () => {
      if (!this.audioContext || !this.sfxGainNode) return;

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = params.type;

      // Apply pitch variation to prevent repetitive sounds
      const variedFrequency = this.applyPitchVariation(params.frequency);
      oscillator.frequency.setValueAtTime(variedFrequency, this.audioContext.currentTime);

      // Apply frequency sweep if specified (with proportional variation)
      if (params.frequencyEnd !== undefined) {
        const variedFrequencyEnd = this.applyPitchVariation(params.frequencyEnd);
        oscillator.frequency.exponentialRampToValueAtTime(
          variedFrequencyEnd,
          this.audioContext.currentTime + params.duration
        );
      }

      // Apply envelope
      const now = this.audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume * 0.3, now + params.attack);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + params.duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.sfxGainNode);

      oscillator.start(now);
      oscillator.stop(now + params.duration);
    };

    if (!this.isUnlocked) {
      // Queue sound if audio not yet unlocked (but limit queue size)
      if (this.pendingSounds.length < 10) {
        this.pendingSounds.push(play);
      }
    } else {
      play();
    }
  }

  /**
   * Play weapon attack sound
   */
  playWeaponSound(weaponType: WeaponType): void {
    const params = this.weaponSoundParams[weaponType];
    if (params) {
      this.playSound(params);
    }
  }

  /**
   * Play XP orb pickup sound
   * Higher pitch for larger orbs
   */
  playPickupSound(orbSize: 'small' | 'medium' | 'large'): void {
    const frequencies = { small: 800, medium: 1000, large: 1200 };
    this.playSound({
      frequency: frequencies[orbSize],
      duration: 0.1,
      type: 'sine',
      attack: 0.01,
      decay: 0.09,
      frequencyEnd: frequencies[orbSize] * 1.5,
    }, 0.6);
  }

  /**
   * Play level up jingle
   */
  playLevelUpSound(): void {
    if (!this.isUnlocked) return;

    // Play ascending notes
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playSound({
          frequency: freq,
          duration: 0.2,
          type: 'sine',
          attack: 0.02,
          decay: 0.18,
        }, 0.5);
      }, i * 100);
    });
  }

  /**
   * Play death sound
   */
  playDeathSound(): void {
    // Descending ominous sound
    this.playSound({
      frequency: 400,
      duration: 0.5,
      type: 'sawtooth',
      attack: 0.02,
      decay: 0.48,
      frequencyEnd: 80,
    }, 0.7);

    // Add a low rumble
    setTimeout(() => {
      this.playSound({
        frequency: 60,
        duration: 0.4,
        type: 'sine',
        attack: 0.1,
        decay: 0.3,
      }, 0.5);
    }, 100);
  }

  /**
   * Play enemy hit sound
   */
  playEnemyHitSound(): void {
    this.playSound({
      frequency: 200,
      duration: 0.08,
      type: 'square',
      attack: 0.01,
      decay: 0.07,
    }, 0.3);
  }

  /**
   * Play enemy death sound
   */
  playEnemyDeathSound(): void {
    this.playSound({
      frequency: 300,
      duration: 0.15,
      type: 'sawtooth',
      attack: 0.01,
      decay: 0.14,
      frequencyEnd: 50,
    }, 0.4);
  }

  /**
   * Play player damage sound
   */
  playPlayerDamageSound(): void {
    this.playSound({
      frequency: 150,
      duration: 0.15,
      type: 'square',
      attack: 0.01,
      decay: 0.14,
    }, 0.5);
  }

  // Volume control methods
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGainNode) {
      this.sfxGainNode.gain.value = this.sfxVolume;
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGainNode) {
      this.musicGainNode.gain.value = this.musicVolume;
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  /**
   * Mute/unmute all audio
   */
  setMuted(muted: boolean): void {
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = muted ? 0 : this.masterVolume;
    }
  }

  /**
   * Clean up audio resources
   */
  destroy(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.masterGainNode = null;
    this.sfxGainNode = null;
    this.musicGainNode = null;
    this.pendingSounds = [];
    console.log('[AudioManager] Destroyed');
  }
}

/**
 * Sound parameters for synthesized audio
 */
interface SoundParams {
  frequency: number;           // Starting frequency in Hz
  duration: number;            // Total duration in seconds
  type: OscillatorType;        // Waveform type
  attack: number;              // Attack time in seconds
  decay: number;               // Decay time in seconds
  frequencyEnd?: number;       // Optional ending frequency for sweeps
}

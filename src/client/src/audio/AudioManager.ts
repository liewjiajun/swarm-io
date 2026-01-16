import type { WeaponType } from '@swarm-io/shared';
import { audioLogger } from '../utils/logger';

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
 *
 * Music System:
 * - Procedural chiptune generation using Web Audio API oscillators
 * - Multiple music tracks for different game states (menu, gameplay, boss)
 * - Seamless looping with automatic tempo and key management
 */

/** Music track type for different game states */
export type MusicTrack = 'menu' | 'gameplay' | 'boss' | 'none';

/** Note frequency lookup table (A4 = 440Hz standard) */
const NOTE_FREQUENCIES: Record<string, number> = {
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61,
  'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23,
  'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46,
  'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
  'C6': 1046.50,
};

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;

  private isUnlocked: boolean = false;
  private pendingSounds: Array<() => void> = [];

  // Music state
  private currentTrack: MusicTrack = 'none';
  private musicSchedulerId: number | null = null;
  private musicStartTime: number = 0;
  private activeOscillators: OscillatorNode[] = [];
  private activeGainNodes: GainNode[] = [];

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
    audioLogger.info('Initialized, waiting for user interaction to unlock audio');
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
          audioLogger.info('Audio context resumed successfully');
          this.isUnlocked = true;
          this.processPendingSounds();
        }).catch(err => {
          audioLogger.warn({ error: String(err) }, 'Failed to resume audio context');
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

      audioLogger.info('Audio context initialized');
    } catch (error) {
      audioLogger.error({ error: String(error) }, 'Failed to create audio context');
    }
  }

  /**
   * Process any sounds that were queued before audio was unlocked
   */
  private processPendingSounds(): void {
    audioLogger.debug({ count: this.pendingSounds.length }, 'Processing pending sounds');
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

  // ============================================
  // MUSIC SYSTEM
  // ============================================

  /**
   * Play background music for a specific game state
   * Uses procedural chiptune generation for authentic 8-bit sound
   */
  playMusic(track: MusicTrack): void {
    if (track === this.currentTrack) return;

    this.stopMusic();

    if (track === 'none') {
      this.currentTrack = 'none';
      return;
    }

    const startPlayback = () => {
      if (!this.audioContext || !this.musicGainNode) return;

      this.currentTrack = track;
      this.musicStartTime = this.audioContext.currentTime;

      audioLogger.info({ track }, 'Starting music');
      this.scheduleMusicLoop();
    };

    if (!this.isUnlocked) {
      this.pendingSounds.push(startPlayback);
    } else {
      startPlayback();
    }
  }

  /**
   * Stop all background music
   */
  stopMusic(): void {
    if (this.musicSchedulerId !== null) {
      clearTimeout(this.musicSchedulerId);
      this.musicSchedulerId = null;
    }

    // Stop all active oscillators
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Oscillator may have already stopped
      }
    });
    this.activeOscillators = [];

    // Disconnect all gain nodes
    this.activeGainNodes.forEach(gain => {
      try {
        gain.disconnect();
      } catch {
        // Gain node may have already disconnected
      }
    });
    this.activeGainNodes = [];

    this.currentTrack = 'none';
    audioLogger.debug('Music stopped');
  }

  /**
   * Get the currently playing music track
   */
  getCurrentTrack(): MusicTrack {
    return this.currentTrack;
  }

  /**
   * Schedule the next loop of music
   */
  private scheduleMusicLoop(): void {
    if (!this.audioContext || !this.musicGainNode || this.currentTrack === 'none') return;

    const trackConfig = this.getMusicTrackConfig(this.currentTrack);
    const now = this.audioContext.currentTime;

    // Schedule all notes in the current pattern
    this.schedulePattern(trackConfig.melody, now, trackConfig.tempo, 'square', 0.15);
    this.schedulePattern(trackConfig.bass, now, trackConfig.tempo, 'triangle', 0.2);
    this.scheduleArpeggio(trackConfig.arpeggio, now, trackConfig.tempo, 0.08);

    // Calculate pattern duration and schedule next loop
    const patternDuration = (trackConfig.melody.length * 60) / trackConfig.tempo;

    this.musicSchedulerId = window.setTimeout(() => {
      // Clean up old oscillators before scheduling new loop
      this.cleanupOldOscillators();
      this.scheduleMusicLoop();
    }, patternDuration * 1000 - 100); // Schedule slightly early to prevent gaps
  }

  /**
   * Clean up oscillators that have finished playing
   */
  private cleanupOldOscillators(): void {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    this.activeOscillators = this.activeOscillators.filter(osc => {
      try {
        // Check if oscillator is still running (has context property)
        return osc.context && now < (osc as any)._endTime;
      } catch {
        return false;
      }
    });
    this.activeGainNodes = this.activeGainNodes.slice(-50); // Keep only recent gain nodes
  }

  /**
   * Schedule a pattern of notes to play
   */
  private schedulePattern(
    notes: (string | null)[],
    startTime: number,
    tempo: number,
    waveType: OscillatorType,
    volume: number
  ): void {
    if (!this.audioContext || !this.musicGainNode) return;

    const beatDuration = 60 / tempo; // Duration of one beat in seconds

    notes.forEach((note, index) => {
      if (!note || !this.audioContext || !this.musicGainNode) return;

      const frequency = NOTE_FREQUENCIES[note];
      if (!frequency) return;

      const noteTime = startTime + index * beatDuration;
      const noteDuration = beatDuration * 0.8; // 80% gate time for staccato feel

      this.scheduleNote(frequency, noteTime, noteDuration, waveType, volume);
    });
  }

  /**
   * Schedule an arpeggio pattern (rapid note sequences)
   */
  private scheduleArpeggio(
    chords: (string[] | null)[],
    startTime: number,
    tempo: number,
    volume: number
  ): void {
    if (!this.audioContext || !this.musicGainNode) return;

    const beatDuration = 60 / tempo;
    const arpSpeed = beatDuration / 4; // 4 arp notes per beat

    chords.forEach((chord, index) => {
      if (!chord || !this.audioContext || !this.musicGainNode) return;

      const chordTime = startTime + index * beatDuration;

      chord.forEach((note, arpIndex) => {
        const frequency = NOTE_FREQUENCIES[note];
        if (!frequency) return;

        const noteTime = chordTime + arpIndex * arpSpeed;
        this.scheduleNote(frequency, noteTime, arpSpeed * 0.7, 'square', volume);
      });
    });
  }

  /**
   * Schedule a single note to play at a specific time
   */
  private scheduleNote(
    frequency: number,
    startTime: number,
    duration: number,
    waveType: OscillatorType,
    volume: number
  ): void {
    if (!this.audioContext || !this.musicGainNode) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // ADSR envelope for chiptune sound
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01); // Fast attack
    gainNode.gain.setValueAtTime(volume * 0.7, startTime + 0.02); // Sustain at 70%
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.musicGainNode);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    // Track end time for cleanup
    (oscillator as any)._endTime = startTime + duration;

    this.activeOscillators.push(oscillator);
    this.activeGainNodes.push(gainNode);
  }

  /**
   * Get music configuration for a specific track
   * Each track has melody, bass, and arpeggio patterns
   */
  private getMusicTrackConfig(track: MusicTrack): MusicTrackConfig {
    switch (track) {
      case 'gameplay':
        return this.getGameplayMusic();
      case 'boss':
        return this.getBossMusic();
      case 'menu':
      default:
        return this.getMenuMusic();
    }
  }

  /**
   * Menu music - Calm, inviting 8-bit melody
   * Key: C Major, Tempo: 100 BPM
   */
  private getMenuMusic(): MusicTrackConfig {
    return {
      tempo: 100,
      melody: [
        'E4', null, 'G4', null, 'C5', null, 'B4', null,
        'A4', null, 'G4', null, 'E4', null, 'D4', null,
        'C4', null, 'E4', null, 'G4', null, 'A4', null,
        'G4', null, 'E4', null, 'D4', null, null, null,
      ],
      bass: [
        'C3', null, null, null, 'G3', null, null, null,
        'A3', null, null, null, 'E3', null, null, null,
        'F3', null, null, null, 'C3', null, null, null,
        'G3', null, null, null, 'G3', null, null, null,
      ],
      arpeggio: [
        ['C4', 'E4', 'G4', 'E4'], null, null, null,
        ['G3', 'B3', 'D4', 'B3'], null, null, null,
        ['A3', 'C4', 'E4', 'C4'], null, null, null,
        ['E3', 'G3', 'B3', 'G3'], null, null, null,
        ['F3', 'A3', 'C4', 'A3'], null, null, null,
        ['C3', 'E3', 'G3', 'E3'], null, null, null,
        ['G3', 'B3', 'D4', 'B3'], null, null, null,
        ['G3', 'B3', 'D4', 'B3'], null, null, null,
      ],
    };
  }

  /**
   * Gameplay music - Energetic, driving chiptune
   * Key: A Minor, Tempo: 140 BPM
   */
  private getGameplayMusic(): MusicTrackConfig {
    return {
      tempo: 140,
      melody: [
        'A4', 'A4', 'C5', null, 'D5', 'D5', 'E5', null,
        'E5', null, 'D5', null, 'C5', null, 'A4', null,
        'G4', 'G4', 'A4', null, 'C5', null, 'D5', null,
        'E5', null, 'D5', null, 'C5', 'A4', 'G4', null,
      ],
      bass: [
        'A2', null, 'A2', null, 'A2', null, 'A2', null,
        'F2', null, 'F2', null, 'G2', null, 'G2', null,
        'E2', null, 'E2', null, 'G2', null, 'G2', null,
        'A2', null, 'E2', null, 'A2', null, 'A2', null,
      ],
      arpeggio: [
        ['A3', 'C4', 'E4', 'C4'], null, ['A3', 'C4', 'E4', 'C4'], null,
        ['A3', 'C4', 'E4', 'C4'], null, ['A3', 'C4', 'E4', 'C4'], null,
        ['F3', 'A3', 'C4', 'A3'], null, ['G3', 'B3', 'D4', 'B3'], null,
        ['G3', 'B3', 'D4', 'B3'], null, ['G3', 'B3', 'D4', 'B3'], null,
        ['E3', 'G3', 'B3', 'G3'], null, ['E3', 'G3', 'B3', 'G3'], null,
        ['G3', 'B3', 'D4', 'B3'], null, ['G3', 'B3', 'D4', 'B3'], null,
        ['A3', 'C4', 'E4', 'C4'], null, ['E3', 'G3', 'B3', 'G3'], null,
        ['A3', 'C4', 'E4', 'C4'], null, ['A3', 'C4', 'E4', 'C4'], null,
      ],
    };
  }

  /**
   * Boss music - Intense, menacing chiptune
   * Key: D Minor, Tempo: 160 BPM
   */
  private getBossMusic(): MusicTrackConfig {
    return {
      tempo: 160,
      melody: [
        'D5', 'D5', 'D5', null, 'F5', null, 'E5', 'D5',
        'C5', 'C5', 'D5', null, 'A4', null, null, null,
        'D5', 'D5', 'D5', null, 'F5', null, 'G5', 'F5',
        'E5', null, 'D5', null, 'A4', null, 'D5', null,
      ],
      bass: [
        'D2', null, 'D2', 'D2', 'D2', null, 'D2', null,
        'A2', null, 'A2', 'A2', 'A2', null, 'A2', null,
        'F2', null, 'F2', 'F2', 'G2', null, 'G2', null,
        'A2', null, 'A2', 'A2', 'D2', null, 'D2', null,
      ],
      arpeggio: [
        ['D3', 'F3', 'A3', 'F3'], ['D3', 'F3', 'A3', 'F3'], null, null,
        ['D3', 'F3', 'A3', 'F3'], null, ['D3', 'F3', 'A3', 'F3'], null,
        ['A2', 'C3', 'E3', 'C3'], ['A2', 'C3', 'E3', 'C3'], null, null,
        ['A2', 'C3', 'E3', 'C3'], null, ['A2', 'C3', 'E3', 'C3'], null,
        ['F2', 'A2', 'C3', 'A2'], null, ['F2', 'A2', 'C3', 'A2'], null,
        ['G2', 'B2', 'D3', 'B2'], null, ['G2', 'B2', 'D3', 'B2'], null,
        ['A2', 'C3', 'E3', 'C3'], null, ['A2', 'C3', 'E3', 'C3'], null,
        ['D3', 'F3', 'A3', 'F3'], null, ['D3', 'F3', 'A3', 'F3'], null,
      ],
    };
  }

  // ============================================
  // UI SOUND EFFECTS
  // ============================================

  /**
   * Play UI button click sound
   */
  playUIClick(): void {
    this.playSound({
      frequency: 600,
      duration: 0.06,
      type: 'square',
      attack: 0.005,
      decay: 0.055,
    }, 0.2);
  }

  /**
   * Play UI button hover sound
   */
  playUIHover(): void {
    this.playSound({
      frequency: 400,
      duration: 0.04,
      type: 'sine',
      attack: 0.005,
      decay: 0.035,
    }, 0.1);
  }

  /**
   * Play modal open sound
   */
  playModalOpen(): void {
    this.playSound({
      frequency: 300,
      duration: 0.15,
      type: 'sine',
      attack: 0.02,
      decay: 0.13,
      frequencyEnd: 600,
    }, 0.25);
  }

  /**
   * Play modal close sound
   */
  playModalClose(): void {
    this.playSound({
      frequency: 500,
      duration: 0.12,
      type: 'sine',
      attack: 0.02,
      decay: 0.10,
      frequencyEnd: 250,
    }, 0.2);
  }

  /**
   * Play upgrade selection sound (positive confirmation)
   */
  playUpgradeSelect(): void {
    // Two-tone positive sound
    this.playSound({
      frequency: 500,
      duration: 0.1,
      type: 'square',
      attack: 0.01,
      decay: 0.09,
    }, 0.3);
    setTimeout(() => {
      this.playSound({
        frequency: 750,
        duration: 0.15,
        type: 'square',
        attack: 0.01,
        decay: 0.14,
      }, 0.3);
    }, 80);
  }

  /**
   * Play boss spawn warning sound
   */
  playBossWarning(): void {
    // Ominous descending horn sound
    const playHorn = (delay: number) => {
      setTimeout(() => {
        this.playSound({
          frequency: 200,
          duration: 0.4,
          type: 'sawtooth',
          attack: 0.05,
          decay: 0.35,
          frequencyEnd: 80,
        }, 0.6);
      }, delay);
    };

    playHorn(0);
    playHorn(500);
    playHorn(1000);
  }

  /**
   * Clean up audio resources
   */
  destroy(): void {
    this.stopMusic();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.masterGainNode = null;
    this.sfxGainNode = null;
    this.musicGainNode = null;
    this.pendingSounds = [];
    audioLogger.info('Destroyed');
  }
}

/**
 * Music track configuration for procedural generation
 */
interface MusicTrackConfig {
  tempo: number;                    // BPM
  melody: (string | null)[];        // Lead melody notes (null = rest)
  bass: (string | null)[];          // Bass line notes
  arpeggio: (string[] | null)[];    // Arpeggio chord patterns
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

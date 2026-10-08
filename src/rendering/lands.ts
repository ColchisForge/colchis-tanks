import type { Land } from '../world/Level';

export type GroundStyle = 'grass' | 'sand' | 'moss' | 'snow' | 'paving';
export type WallStyle = 'brick' | 'stone' | 'logs' | 'rock' | 'gilded';
export type WaterStyle = 'pond' | 'surf' | 'ice' | 'moat';
export type BushStyle = 'shrub' | 'palm' | 'fern' | 'pine' | 'hedge';
export type Ambient = 'none' | 'spray' | 'fireflies' | 'snowfall' | 'motes';

export interface LandStyle {
  readonly ground: { style: GroundStyle; base: string; alt: string; light: string; dark: string; detail: string; detail2: string };
  readonly wall: { style: WallStyle; top: string; light: string; dark: string; mortar: string; face: string; faceDark: string; accent: string };
  readonly steel: { base: string; light: string; dark: string; darker: string };
  readonly water: { style: WaterStyle; base: string; light: string; deep: string; edge: string; foam: string };
  readonly bush: { style: BushStyle; base: string; light: string; dark: string; darkest: string; accent: string };
  /** Dirt roads: churned mud with ruts, edged with whatever the ground is (slush on snow). */
  readonly road: { base: string; light: string; dark: string; rut: string; edge: string };
  readonly shadow: { color: string; alpha: number };
  /** Drift applied to smoke, dust and snow, in px/s. */
  readonly wind: { x: number; y: number };
  /** How strongly tank tracks mark the ground; snow keeps them. */
  readonly trackAlpha: number;
  /** Seconds for tracks to fade away; 0 keeps them for the whole battle. */
  readonly trackLife: number;
  readonly ambient: Ambient;
  readonly dust: string;
  readonly debris: readonly string[];
}

const STEEL = { base: '#a4acb6', light: '#dfe5ea', dark: '#6c7480', darker: '#454c56' };

/** Each land restyles the same tile types; the rules of the battlefield never change. */
export const LANDS: Readonly<Record<Land, LandStyle>> = {
  grassland: {
    ground: { style: 'grass', base: '#7b7d48', alt: '#76783f', light: '#8a8c55', dark: '#67693a', detail: '#5b7331', detail2: '#a29e76' },
    wall: { style: 'brick', top: '#c0603a', light: '#e08a5a', dark: '#8e3f22', mortar: '#5e2c18', face: '#8a3a20', faceDark: '#55200f', accent: '#c0603a' },
    steel: STEEL,
    water: { style: 'pond', base: '#4a8ad6', light: '#7ab6f2', deep: '#3a70bc', edge: '#1f3f6e', foam: '#cfeaff' },
    bush: { style: 'shrub', base: '#3f8a35', light: '#68b84a', dark: '#2a6a2a', darkest: '#173f1c', accent: '#a6e070' },
    road: { base: '#8a7048', light: '#a08660', dark: '#6e5838', rut: '#56442c', edge: '#6f6a3e' },
    shadow: { color: '#14160a', alpha: 0.42 },
    wind: { x: 5, y: -3 },
    trackAlpha: 0.3,
    trackLife: 30,
    ambient: 'none',
    dust: '#a89a6a',
    debris: ['#e08a5a', '#c0603a', '#8e3f22'],
  },
  coast: {
    ground: { style: 'sand', base: '#d6be86', alt: '#d0b77d', light: '#e4d09c', dark: '#bca36c', detail: '#9da45c', detail2: '#f4eacb' },
    wall: { style: 'stone', top: '#e0d9c8', light: '#f6f2e8', dark: '#b2a994', mortar: '#968b76', face: '#b6ac97', faceDark: '#857b68', accent: '#4f86b8' },
    steel: STEEL,
    water: { style: 'surf', base: '#2f94c8', light: '#5cc0ea', deep: '#1f74a8', edge: '#165a86', foam: '#ffffff' },
    bush: { style: 'palm', base: '#4f9a3a', light: '#7cc456', dark: '#2e6a26', darkest: '#1a4418', accent: '#8a6a3a' },
    road: { base: '#a8875a', light: '#c0a070', dark: '#8a6c46', rut: '#6e5436', edge: '#c8ae78' },
    shadow: { color: '#3a2a10', alpha: 0.36 },
    wind: { x: 10, y: -1 },
    trackAlpha: 0.34,
    trackLife: 14,
    ambient: 'spray',
    dust: '#e6d0a0',
    debris: ['#f6f2e8', '#e0d9c8', '#b2a994'],
  },
  forest: {
    ground: { style: 'moss', base: '#4c5c2e', alt: '#48572b', light: '#5a6c36', dark: '#394822', detail: '#7a5a32', detail2: '#7a8c4a' },
    wall: { style: 'logs', top: '#7a5230', light: '#a4733f', dark: '#4e321c', mortar: '#2e1c0e', face: '#5a3a20', faceDark: '#3a2414', accent: '#6a9a38' },
    steel: STEEL,
    water: { style: 'pond', base: '#2f6a8a', light: '#4f8eaa', deep: '#245670', edge: '#132f3e', foam: '#9ec8c8' },
    bush: { style: 'fern', base: '#2f6e2a', light: '#4f9a3a', dark: '#1f4e1e', darkest: '#112a11', accent: '#7ab84a' },
    road: { base: '#5e4a30', light: '#74603e', dark: '#4a3a24', rut: '#382c1a', edge: '#4a5428' },
    shadow: { color: '#0c1206', alpha: 0.46 },
    wind: { x: 2, y: -2 },
    trackAlpha: 0.32,
    trackLife: 40,
    ambient: 'fireflies',
    dust: '#6e6a44',
    debris: ['#a4733f', '#7a5230', '#6a9a38'],
  },
  snow: {
    ground: { style: 'snow', base: '#e6edf4', alt: '#e0e8f0', light: '#f8fbff', dark: '#c6d2de', detail: '#b0c0d0', detail2: '#8e9aa6' },
    wall: { style: 'rock', top: '#7c8590', light: '#a2aab4', dark: '#545c66', mortar: '#3c434c', face: '#5a616a', faceDark: '#3c434c', accent: '#ffffff' },
    steel: STEEL,
    water: { style: 'ice', base: '#8cc6e8', light: '#c4e6f8', deep: '#6aa8d0', edge: '#4a7898', foam: '#ffffff' },
    bush: { style: 'pine', base: '#2e5a3a', light: '#46785a', dark: '#1e3e28', darkest: '#112418', accent: '#ffffff' },
    road: { base: '#76644e', light: '#8e7c64', dark: '#5c4c3a', rut: '#45382a', edge: '#b4bac4' },
    shadow: { color: '#2a3c66', alpha: 0.3 },
    wind: { x: 14, y: 3 },
    trackAlpha: 0.5,
    trackLife: 0,
    ambient: 'snowfall',
    dust: '#ffffff',
    debris: ['#a2aab4', '#7c8590', '#ffffff'],
  },
  fortress: {
    ground: { style: 'paving', base: '#8c8472', alt: '#867e6c', light: '#9c947f', dark: '#6e6656', detail: '#5e5848', detail2: '#b0a68c' },
    wall: { style: 'gilded', top: '#c8b48a', light: '#e8d8b0', dark: '#9a8662', mortar: '#6e5e44', face: '#a08a60', faceDark: '#6a5a40', accent: '#f0b432' },
    steel: STEEL,
    water: { style: 'moat', base: '#3a6a8a', light: '#5a8aa8', deep: '#2a5270', edge: '#4e483c', foam: '#a8c8d8' },
    bush: { style: 'hedge', base: '#3a7a30', light: '#5aa040', dark: '#265a22', darkest: '#163a16', accent: '#e8d070' },
    road: { base: '#80705a', light: '#988a72', dark: '#665846', rut: '#4e4436', edge: '#6e6656' },
    shadow: { color: '#1e1a12', alpha: 0.42 },
    wind: { x: 4, y: -3 },
    trackAlpha: 0.2,
    trackLife: 10,
    ambient: 'motes',
    dust: '#c8b48a',
    debris: ['#e8d8b0', '#c8b48a', '#f0b432'],
  },
};

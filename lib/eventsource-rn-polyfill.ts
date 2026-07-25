/**
 * Minimal Event / MessageEvent / EventTarget polyfills for React Native Hermes.
 * The WhatWG `eventsource` package extends EventTarget and constructs Event /
 * MessageEvent at module init — Hermes does not provide these globals.
 *
 * Import this as the FIRST side-effect in any module that loads `eventsource`,
 * and also from the app entry (`index.js`) so it is installed before bundles.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : typeof window !== 'undefined'
        ? window
        : {};

type Listener = ((event: unknown) => void) | { handleEvent: (event: unknown) => void } | null;

function invoke(listener: Listener, event: unknown): void {
  if (!listener) return;
  if (typeof listener === 'function') {
    listener(event);
    return;
  }
  if (typeof listener === 'object' && typeof listener.handleEvent === 'function') {
    listener.handleEvent(event);
  }
}

function installEvent(): void {
  if (typeof g.Event === 'function') return;
  function RNEvent(this: { type: string }, type: string) {
    this.type = type;
    this.bubbles = false;
    this.cancelable = false;
    this.defaultPrevented = false;
    this.eventPhase = 0;
    this.timeStamp = Date.now();
    this.target = null;
    this.currentTarget = null;
  }
  RNEvent.prototype.preventDefault = function preventDefault() {};
  RNEvent.prototype.stopPropagation = function stopPropagation() {};
  RNEvent.prototype.stopImmediatePropagation = function stopImmediatePropagation() {};
  g.Event = RNEvent;
}

function installMessageEvent(): void {
  if (typeof g.MessageEvent === 'function') return;
  const Base = g.Event;
  function RNMessageEvent(
    this: { type: string; data: unknown; lastEventId: string; origin: string },
    type: string,
    init?: { data?: unknown; lastEventId?: string; origin?: string }
  ) {
    Base.call(this, type);
    this.data = init?.data ?? null;
    this.lastEventId = init?.lastEventId ?? '';
    this.origin = init?.origin ?? '';
  }
  RNMessageEvent.prototype = Object.create(Base.prototype);
  RNMessageEvent.prototype.constructor = RNMessageEvent;
  g.MessageEvent = RNMessageEvent;
}

function installEventTarget(): void {
  if (typeof g.EventTarget === 'function') return;
  function RNEventTarget(this: {
    _listeners: Map<string, Set<Listener>>;
    addEventListener: (type: string, cb: Listener) => void;
    removeEventListener: (type: string, cb: Listener) => void;
    dispatchEvent: (event: { type: string }) => boolean;
  }) {
    this._listeners = new Map();
  }
  RNEventTarget.prototype.addEventListener = function addEventListener(
    type: string,
    callback: Listener
  ) {
    if (!callback) return;
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(callback);
  };
  RNEventTarget.prototype.removeEventListener = function removeEventListener(
    type: string,
    callback: Listener
  ) {
    if (!callback) return;
    this._listeners.get(type)?.delete(callback);
  };
  RNEventTarget.prototype.dispatchEvent = function dispatchEvent(event: { type: string }) {
    const set = this._listeners.get(event.type);
    if (!set) return true;
    for (const listener of [...set]) {
      invoke(listener, event);
    }
    return true;
  };
  g.EventTarget = RNEventTarget;
}

installEvent();
installMessageEvent();
installEventTarget();

export {};

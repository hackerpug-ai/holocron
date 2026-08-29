/**
 * Hermes-safe Event / MessageEvent / EventTarget polyfills for WhatWG eventsource.
 * Plain JS so Metro evaluates this BEFORE any ESM class that extends Event.
 * Install on both globalThis and global (Hermes uses both).
 */
/* eslint-disable no-undef */
(function installEventSourceDomGlobals() {
  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : typeof window !== 'undefined'
          ? window
          : null;
  if (!root) return;

  function define(name, value) {
    try {
      Object.defineProperty(root, name, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch (_e) {
      root[name] = value;
    }
    try {
      if (typeof global !== 'undefined' && global !== root) {
        Object.defineProperty(global, name, {
          value: value,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    } catch (_e2) {
      /* ignore */
    }
    try {
      if (typeof globalThis !== 'undefined' && globalThis !== root) {
        Object.defineProperty(globalThis, name, {
          value: value,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    } catch (_e3) {
      /* ignore */
    }
  }

  if (typeof root.Event !== 'function') {
    function RNEvent(type) {
      this.type = type == null ? '' : String(type);
      this.bubbles = false;
      this.cancelable = false;
      this.defaultPrevented = false;
      this.eventPhase = 0;
      this.timeStamp = Date.now();
      this.target = null;
      this.currentTarget = null;
    }
    RNEvent.prototype.preventDefault = function preventDefault() {
      this.defaultPrevented = true;
    };
    RNEvent.prototype.stopPropagation = function stopPropagation() {};
    RNEvent.prototype.stopImmediatePropagation = function stopImmediatePropagation() {};
    define('Event', RNEvent);
  }

  if (typeof root.MessageEvent !== 'function') {
    function RNMessageEvent(type, init) {
      var BaseEvent = root.Event;
      BaseEvent.call(this, type);
      init = init || {};
      this.data = Object.hasOwn(init, 'data') ? init.data : null;
      this.lastEventId = init.lastEventId != null ? String(init.lastEventId) : '';
      this.origin = init.origin != null ? String(init.origin) : '';
    }
    RNMessageEvent.prototype = Object.create(root.Event.prototype);
    RNMessageEvent.prototype.constructor = RNMessageEvent;
    define('MessageEvent', RNMessageEvent);
  }

  if (typeof root.EventTarget !== 'function') {
    function RNEventTarget() {
      this._listeners = Object.create(null);
    }
    RNEventTarget.prototype.addEventListener = function addEventListener(type, callback) {
      var key;
      if (!callback) return;
      key = String(type);
      if (!this._listeners[key]) this._listeners[key] = [];
      this._listeners[key].push(callback);
    };
    RNEventTarget.prototype.removeEventListener = function removeEventListener(type, callback) {
      var key;
      var list;
      if (!callback) return;
      key = String(type);
      list = this._listeners[key];
      if (!list) return;
      this._listeners[key] = list.filter(function filterCb(cb) {
        return cb !== callback;
      });
    };
    RNEventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
      var list;
      var i;
      var listener;
      if (!event || event.type == null) return true;
      list = this._listeners[String(event.type)] || [];
      for (i = 0; i < list.length; i++) {
        listener = list[i];
        if (typeof listener === 'function') listener.call(this, event);
        else if (listener && typeof listener.handleEvent === 'function')
          listener.handleEvent(event);
      }
      return true;
    };
    define('EventTarget', RNEventTarget);
  }
})();

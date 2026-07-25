// Install Event/MessageEvent/EventTarget for WhatWG eventsource on Hermes
// BEFORE any module graph that imports `eventsource` is evaluated.
require('./lib/eventsource-rn-polyfill.js');
require('@ohah/react-native-mcp-server/runtime');
require('expo-router/entry');

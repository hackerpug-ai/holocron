// Install Hermes-safe DOM globals before Expo Router loads the screen graph.
// `eventsource` extends Event during module evaluation, while Hermes does not
// provide that browser global by default.
require('./lib/eventsource-rn-polyfill.js');
require('expo-router/entry');

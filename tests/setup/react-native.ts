import { vi } from 'vitest';

// Mock React Native Animated to prevent infinite animation loops in skeleton tests
vi.mock('react-native', async () => {
  const ReactNative = await vi.importActual<typeof import('react-native')>('react-native');
  return {
    ...ReactNative,
    Animated: {
      ...(ReactNative.Animated as Record<string, unknown>),
      Value: class MockValue {
        constructor(value: number) {
          this.value = value;
        }
        value: number;
        interpolate(config: any) {
          return this;
        }
      },
      timing: (value: any, config: any) => ({
        start: (callback?: () => void) => {
          if (callback) callback();
        },
        stop: vi.fn(),
        reset: vi.fn(),
      }),
      loop: (animation: any) => ({
        start: vi.fn(),
        stop: vi.fn(),
      }),
      sequence: (animations: any) => ({
        start: vi.fn(),
        stop: vi.fn(),
      }),
      View: ReactNative.View,
    },
  };
});

// Mock react-native-svg — the native codegen doesn't work in Vitest
vi.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  function makeSvg(name: string) {
    return function SvgStub(props: any) {
      return React.createElement(View, { ...props, testID: `svg-${name}` });
    };
  }
  return {
    default: { Svg: makeSvg('Svg') },
    Svg: makeSvg('Svg'),
    Circle: makeSvg('Circle'),
    Rect: makeSvg('Rect'),
    Path: makeSvg('Path'),
    G: makeSvg('G'),
    Text: makeSvg('Text'),
    TSpan: makeSvg('TSpan'),
    Line: makeSvg('Line'),
    Polygon: makeSvg('Polygon'),
    Polyline: makeSvg('Polyline'),
    Ellipse: makeSvg('Ellipse'),
    ClipPath: makeSvg('ClipPath'),
    Defs: makeSvg('Defs'),
    Use: makeSvg('Use'),
    Image: makeSvg('Image'),
    LinearGradient: makeSvg('LinearGradient'),
    RadialGradient: makeSvg('RadialGradient'),
    Stop: makeSvg('Stop'),
  };
});

// Mock expo-router — native navigation doesn't work in Vitest
vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    navigate: vi.fn(),
    replace: vi.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/',
  useFocusEffect: () => {},
  Link: function Link(props: any) {
    return props.children;
  },
  Redirect: function Redirect() {
    return null;
  },
  Stack: {
    Screen: function Screen() {
      return null;
    },
  },
  router: { push: vi.fn(), back: vi.fn(), navigate: vi.fn(), replace: vi.fn() },
}));

// Mock nativewind cssInterop — no-op in tests
vi.mock('nativewind', () => ({
  cssInterop: function cssInterop(component: any) {
    return component;
  },
  styled: function styled(component: any) {
    return component;
  },
}));

// Mock @rn-primitives/slot — dist contains JSX that oxc can't parse in .mjs files
vi.mock('@rn-primitives/slot', () => {
  const React = require('react');
  return {
    Slot: React.forwardRef(function Slot(props: any, ref: any) {
      return React.cloneElement(props.children, { ...props, ref });
    }),
    Root: function Root(props: any) {
      return props.children;
    },
  };
});

// Mock @/components/ui/icons — lucide icons use react-native-svg via cssInterop
function makeIcon(name: string) {
  return function IconStub(props: any) {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { ...props, testID: `icon-${name}` });
  };
}

vi.mock('@/components/ui/icons', () => ({
  get MessageSquare() {
    return makeIcon('MessageSquare');
  },
  get Package() {
    return makeIcon('Package');
  },
  get Sparkles() {
    return makeIcon('Sparkles');
  },
  get TrendingUp() {
    return makeIcon('TrendingUp');
  },
  get Zap() {
    return makeIcon('Zap');
  },
  get Calendar() {
    return makeIcon('Calendar');
  },
  get Clock() {
    return makeIcon('Clock');
  },
  get Globe() {
    return makeIcon('Globe');
  },
  get EllipsisVertical() {
    return makeIcon('EllipsisVertical');
  },
  get Play() {
    return makeIcon('Play');
  },
  get Pause() {
    return makeIcon('Pause');
  },
  get SkipBack() {
    return makeIcon('SkipBack');
  },
  get SkipForward() {
    return makeIcon('SkipForward');
  },
  get RefreshCw() {
    return makeIcon('RefreshCw');
  },
  get X() {
    return makeIcon('X');
  },
  get Mic() {
    return makeIcon('Mic');
  },
  get MicOff() {
    return makeIcon('MicOff');
  },
  get ChevronRight() {
    return makeIcon('ChevronRight');
  },
  get ChevronDown() {
    return makeIcon('ChevronDown');
  },
  get ChevronLeft() {
    return makeIcon('ChevronLeft');
  },
  get Search() {
    return makeIcon('Search');
  },
  get Share() {
    return makeIcon('Share');
  },
  get ExternalLink() {
    return makeIcon('ExternalLink');
  },
  get Star() {
    return makeIcon('Star');
  },
  get Bookmark() {
    return makeIcon('Bookmark');
  },
  get Heart() {
    return makeIcon('Heart');
  },
  get Bell() {
    return makeIcon('Bell');
  },
  get Settings() {
    return makeIcon('Settings');
  },
  get Home() {
    return makeIcon('Home');
  },
  get ArrowLeft() {
    return makeIcon('ArrowLeft');
  },
  get Check() {
    return makeIcon('Check');
  },
  get Copy() {
    return makeIcon('Copy');
  },
  get Plus() {
    return makeIcon('Plus');
  },
  get Minus() {
    return makeIcon('Minus');
  },
  get Filter() {
    return makeIcon('Filter');
  },
  get MoreHorizontal() {
    return makeIcon('MoreHorizontal');
  },
}));

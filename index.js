//
// Mobile Viewport Control v0.3.1
//
// Copyright (c) 2016 Shaun Williams
// ISC License
//
// GitHub: https://github.com/stripe/mobile-viewport-control
//

//---------------------------------------------------------------------------
// JS Module Boilerplate
//---------------------------------------------------------------------------

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('mobile-viewport-control', [], factory);
  }
  else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  }
  else {
    root.mobileViewportControl = factory();
  }
}(this, function() {

//---------------------------------------------------------------------------
// Getting/Setting Scroll position
//---------------------------------------------------------------------------

function getScroll() {
  return {
    top: window.pageYOffset || document.documentElement.scrollTop,
    left: window.pageXOffset || document.documentElement.scrollLeft
  };
}

function setScroll(scroll) {
  if (window.scrollTo) {
    window.scrollTo(scroll.left, scroll.top);
  } else {
    document.documentElement.scrollTop = scroll.top;
    document.documentElement.scrollLeft = scroll.left;
    document.body.scrollTop = scroll.top;
    document.body.scrollLeft = scroll.left;
  }
}

//---------------------------------------------------------------------------
// Getting Initial Viewport from <meta name='viewport'> tags
// but we also include implicit defaults.
//---------------------------------------------------------------------------

function getInitialViewport(withDefaults) {
  var viewport = {};

  if (withDefaults) {
    // These seem to be the defaults
    viewport = {
      'user-scalable': 'yes',
      'minimum-scale': '0',
      'maximum-scale': '10'
    };
  }

  var tags = document.querySelectorAll('meta[name=viewport]');
  var i,j,tag,content,keyvals,keyval;
  for (i=0; i<tags.length; i++) {
    tag = tags[i];
    content = tag.getAttribute('content');
    if (tag.id !== hookID && content) {
      keyvals = content.split(',');
      for (j=0; j<keyvals.length; j++) {
        keyval = keyvals[j].split('=');
        if (keyval.length === 2) {
          viewport[keyval[0].trim()] = keyval[1].trim();
        }
      }
    }
  }
  return viewport;
}

function getPrettyInitialViewport() {
  var initial = getInitialViewport();
  var keyvals = [];
  for (var prop in initial) {
    if (initial.hasOwnProperty(prop)) {
      keyvals.push({key:prop, val:initial[prop]});
    }
  }
  return (
    keyvals.sort(function(a,b) {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    }).map(function(kv) {
      return kv.key + '=' + kv.val;
    }).join(',\n')
  );
}

//---------------------------------------------------------------------------
// Calculating current viewport scale
// simplified from: http://menacingcloud.com/?c=viewportScale
//---------------------------------------------------------------------------

function getOrientation() {
  var degrees = window.orientation;
  var w = document.documentElement.clientWidth;
  var h = document.documentElement.clientHeight;
  if(degrees === undefined) {
    return (w > h) ? 'landscape' : 'portrait';
  }
  return (degrees % 180 === 0) ? 'portrait' : 'landscape';
}

function getOrientedScreenWidth() {
  var orientation = getOrientation();
  var sw = screen.width;
  var sh = screen.height;
  return (orientation === 'portrait') ? Math.min(sw,sh) : Math.max(sw,sh);
}

function getScale() {
  var visualViewportWidth = window.innerWidth;
  var screenWidth = getOrientedScreenWidth();
  return screenWidth / visualViewportWidth;
}


//---------------------------------------------------------------------------
// Get mobile OS
// from: http://stackoverflow.com/a/21742107
//---------------------------------------------------------------------------

function getMobileOS() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (userAgent.match(/iPad/i) ||
      userAgent.match(/iPhone/i) ||
      userAgent.match(/iPod/i)) {
    return 'iOS';
  }
  else if (userAgent.match(/Android/i)) {
    return 'Android';
  }
}

function isFirefox() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return userAgent.match(/Firefox/i) ? true : false;
}

//---------------------------------------------------------------------------
// State and Constants
//---------------------------------------------------------------------------

// A unique ID of the meta-viewport tag we must create
// to hook into and control the viewport.
var hookID = '__mobileViewportControl_hook__';

// A unique ID of the CSS style tag we must create to
// add rules for hiding the body.
var styleID = '__mobileViewPortControl_style__';

// An empirical guess for the maximum time that we have to
// wait before we are confident a viewport change has registered.
var refreshDelay = 200;

// Original viewport state before freezing.
var originalScale;
var originalScroll;

// Classes we use to make our css selector specific enough
// to hopefully override all other selectors.
// (mvc__ = mobileViewportControl prefix for uniqueness)
var hiddenClasses = [
  'mvc__a',
  'mvc__lot',
  'mvc__of',
  'mvc__classes',
  'mvc__to',
  'mvc__increase',
  'mvc__the',
  'mvc__odds',
  'mvc__of',
  'mvc__winning',
  'mvc__specificity'
];

//---------------------------------------------------------------------------
// Isolating an Element
//---------------------------------------------------------------------------

function isolatedStyle(elementID) {
  var classes = hiddenClasses.join('.');
  return [
    // We effectively clear the <html> and <body> background
    // and sizing attributes.
    'html.' + classes + ',',
    'html.' + classes + ' > body {',
    '  background: #fff;',
    '  width: auto;',
    '  min-width: inherit;',
    '  max-width: inherit;',
    '  height: auto;',
    '  min-height: inherit;',
    '  max-height: inherit;',
    '  margin: 0;',
    '  padding: 0;',
    '  border: 0;',
    '}',
    // hide everything in the body...
    'html.' + classes + ' > body > * {',
    '  display: none !important;',
    '}',
    // ...except the given element ID
    'html.' + classes + ' > body > #' + elementID + ' {',
    '  display: block !important;',
    '}'
  ].join('\n');
}

function isolate(elementID) {
  // add classes to body tag to isolate all other elements
  var classes = hiddenClasses.join(' ');
  var html = document.documentElement;
  html.className += ' ' + classes;

  // add isolating style rules
  var style = document.createElement('style');
  style.id = styleID;
  style.type = 'text/css';
  style.appendChild(document.createTextNode(isolatedStyle(elementID)));
  document.head.appendChild(style);
}

function undoIsolate() {
  // remove isolating classes from body tag
  var classes = hiddenClasses.join(' ');
  var html = document.documentElement;
  html.className = html.className.replace(classes, '');

  // remove isolating style rules
  var style = document.getElementById(styleID);
  document.head.removeChild(style);
}

//---------------------------------------------------------------------------
// Freezing
//---------------------------------------------------------------------------

// Freeze the viewport to a given scale.
function freeze(scale) {
  // optional arguments
  var isolateID, onDone;

  // get optional arguments using their type
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof args[0] === 'string') {
    isolateID = args[0];
    args.splice(0, 1);
  }
  if (typeof args[0] === 'function') {
    onDone = args[0];
  }

  // save original viewport state
  originalScroll = getScroll();
  originalScale = getScale();

  // isolate element if needed
  if (isolateID) {
    isolate(isolateID);
    setScroll({x:0,y:0});
  }

  // validate scale
  // (we cannot freeze scale at 1.0 on Android)
  if (scale === 1) {
    scale = 1.002;
  }

  // add our new meta viewport tag
  var hook = document.getElementById(hookID);
  if (!hook) {
    hook = document.createElement('meta');
    hook.id = hookID;
    hook.name = 'viewport';
    document.head.appendChild(hook);
  }

  // When freezing the viewport, we still enable
  // user-scalability and allow a tight zooming
  // margin.  Without this, UIWebView would simply
  // ignore attempts to set the scale.  But with this
  // solution, the next time the user pinch-zooms
  // in this state, the viewport will auto-snap
  // to our scale.

  var includeWidth = (getMobileOS() === 'Android' && isFirefox());
  hook.setAttribute('content', [
    'user-scalable=yes',
    'initial-scale='+scale,
    'minimum-scale='+scale,
    'maximum-scale='+(scale+0.004),
    (includeWidth ? 'width=device-width' : null)
  ].filter(Boolean).join(','));

  if (onDone) {
    setTimeout(onDone, refreshDelay);
  }
}

//---------------------------------------------------------------------------
// Thawing
//---------------------------------------------------------------------------

function thawWebkit(hook, initial, onDone) {
  // Restore the user's manual zoom.
  hook.setAttribute('content', [
    'initial-scale='+originalScale,
    'minimum-scale='+originalScale,
    'maximum-scale='+originalScale
  ].join(','));

  // Restore the page's zoom bounds.
  hook.setAttribute('content', [
    'user-scalable='+initial['user-scalable'],
    'minimum-scale='+initial['minimum-scale'],
    'maximum-scale='+initial['maximum-scale'],
    (initial.width ? 'width='+initial.width : null)
  ].filter(Boolean).join(','));

  // Remove our meta viewport hook.
  document.head.removeChild(hook);

  setScroll(originalScroll);

  setTimeout(function() {
    if (onDone)
      onDone();
  }, refreshDelay);
}

function thawGecko(hook, initial, onDone) {
  // Restore the user's manual zoom.
  hook.setAttribute('content', [
    'initial-scale='+originalScale,
    'minimum-scale='+originalScale,
    'maximum-scale='+originalScale
  ].join(','));

  // Updating the scroll here is too early,
  // but it's used to force a refresh of the viewport
  // with our current desired scale.
  setScroll(originalScroll);

  setTimeout(function(){
    // Restore the page's zoom bounds.
    hook.setAttribute('content', [
      'user-scalable='+initial['user-scalable'],
      'minimum-scale='+initial['minimum-scale'],
      'maximum-scale='+initial['maximum-scale'],
      (initial.width ? 'width='+initial.width : null)
    ].filter(Boolean).join(','));

    // Restore the scroll again now that the scale is correct.
    setScroll(originalScroll);

    // Remove our meta viewport hook.
    document.head.removeChild(hook);

    if (onDone)
      onDone();
  }, refreshDelay);
}

function thawBlink(hook, initial, onDone) {
  hook.setAttribute('content', [
    'user-scalable='+initial['user-scalable'],
    // WebView does not support this:
    //'initial-scale='+originalScale
    'initial-scale='+initial['initial-scale'],
    'minimum-scale='+initial['minimum-scale'],
    'maximum-scale='+initial['maximum-scale'],
    (initial.width ? 'width='+initial.width : null)
  ].filter(Boolean).join(','));

  setScroll(originalScroll);

  setTimeout(function(){
    document.head.removeChild(hook);
    if (onDone)
      onDone();
  }, refreshDelay);
}

// Thaw the viewport, restoring the scale and scroll to what it
// was before freezing.
function thaw(onDone) {
  // restore body visibility
  var style = document.getElementById(styleID);
  if (style) {
    undoIsolate();
  }

  // exit if there is nothing to thaw
  var hook = document.getElementById(hookID);
  if (!hook) {
    return;
  }

  var initial = getInitialViewport(true);

  // thaw function defaults to webkit
  var thawFunc = thawWebkit;
  var os = getMobileOS();
  if (os === 'Android')  { thawFunc = isFirefox() ? thawGecko : thawBlink; }
  else if (os === 'iOS') { thawFunc = thawWebkit; }

  // call appropriate thaw function
  thawFunc(hook, initial, onDone);
}

//---------------------------------------------------------------------------
// Public API
//---------------------------------------------------------------------------

return {
  getInitialViewport: getInitialViewport,
  getPrettyInitialViewport: getPrettyInitialViewport,
  getScale: getScale,
  isolate: isolate,
  undoIsolate: undoIsolate,

  // stable
  version: '0.3.1',
  freeze: freeze,
  thaw: thaw
};

})); // end module scope

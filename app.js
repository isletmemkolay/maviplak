'use strict';

// playlist.js'den gelen veriler
// const playlist, DEFAULT_ID

const TONEARM_REST = -18;
const TONEARM_PLAY = 25;
const ARM_DURATION = 1.2;

const $ = (sel) => document.querySelector(sel);

const app = $('#app');
const vinyl = $('#vinyl');
const tonearm = $('#tonearm-pivot');
const cover = $('#cover');
const songTitle = $('#song-title');
const artistName = $('#artist-name');

// ── Knob Elements ────────────────────────────────────────────
const knob = $('#volumeKnob');
const knobStatus = $('#knob-status');

// ── Knob Constants ──────────────────────────────────────────
const KNOB_MIN_ANGLE = -135;
const KNOB_MAX_ANGLE = 135;
const KNOB_ANGLE_RANGE = KNOB_MAX_ANGLE - KNOB_MIN_ANGLE;
const KNOB_OFF_THRESHOLD = -130;

// ── State ───────────────────────────────────────────────────
let currentId = DEFAULT_ID;
let currentVideoId = null;
let isArmOnRecord = false;
let isAudioPlaying = false;
let isAnimating = false;
let armTween = null;
let ytPlayer = null;
let ytReady = false;
let ytScriptLoaded = false;
let pendingVideoId = null;
let userInteracted = false;
let firstPlay = true;
let isFileProtocol = window.location.protocol === 'file:';

// ── Knob State ──────────────────────────────────────────────
let isDragging = false;
let knobStartAngle = 0;
let knobCurrentAngle = KNOB_MIN_ANGLE;
let knobPercentage = 0;

// ── Audio Context (Web Audio API fallback) ─────────────────
let audioCtx = null;
let gainNode = null;
let oscillator = null;
let isUsingFallbackAudio = false;

function initFallbackAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(audioCtx.destination);
  } catch (e) {
    console.warn('Web Audio API not available');
  }
}

function playFallbackTone() {
  if (!audioCtx) initFallbackAudio();
  if (!audioCtx) return;

  if (oscillator) {
    oscillator.stop();
    oscillator = null;
  }

  oscillator = audioCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  oscillator.connect(gainNode);
  oscillator.start();
  gainNode.gain.value = knobPercentage / 100;
}

function stopFallbackTone() {
  if (oscillator) {
    oscillator.stop();
    oscillator = null;
  }
  if (gainNode) {
    gainNode.gain.value = 0;
  }
}

// ── Helpers ─────────────────────────────────────────────────
function parseYoutubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|img\.youtube\.com\/vi\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function coverFromYoutube(id) {
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

function resolveTrackId() {
  const hash = location.hash.replace(/^#\/?/, '').trim();
  if (hash && playlist[hash]) return hash;

  const params = new URLSearchParams(location.search);
  const queryId = params.get('id') || params.get('track');
  if (queryId && playlist[queryId]) return queryId;

  return DEFAULT_ID;
}

function showError(msg) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 5000);
}

// ── UI Updates ──────────────────────────────────────────────
function setArmOnRecordUI(onRecord) {
  isArmOnRecord = onRecord;
  tonearm.setAttribute('aria-pressed', String(onRecord));
  tonearm.setAttribute('aria-label', onRecord ? 'İğneyi kaldır' : 'Plak iğnesine dokun');
  tonearm.classList.toggle('is-on-record', onRecord);
  vinyl.classList.toggle('spinning', onRecord);

  if (!onRecord) {
    knob.classList.add('disabled');
    if (isAudioPlaying) {
      stopAudioPlayback();
      setAudioPlayingUI(false);
    }
  } else {
    knob.classList.remove('disabled');
  }
}

function setAudioPlayingUI(playing) {
  isAudioPlaying = playing;
  if (playing) {
    knob.classList.add('on');
    knobStatus.textContent = 'ON';
    knobStatus.classList.add('on');
  } else {
    knob.classList.remove('on');
    knobStatus.textContent = 'OFF';
    knobStatus.classList.remove('on');
  }
}

// ── Animation ───────────────────────────────────────────────
function animateTonearm(toDeg, onComplete) {
  if (armTween) armTween.kill();
  isAnimating = true;

  armTween = gsap.to(tonearm, {
    rotation: toDeg,
    duration: ARM_DURATION,
    ease: 'power2.inOut',
    force3D: true,
    onComplete: () => {
      isAnimating = false;
      if (onComplete) onComplete();
    },
  });
}

// ── YouTube Audio ───────────────────────────────────────────
function pauseYoutube() {
  if (ytReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    ytPlayer.pauseVideo();
  }
}

function muteYoutube() {
  if (ytReady && ytPlayer && typeof ytPlayer.mute === 'function') {
    ytPlayer.mute();
  }
}

function unMuteYoutube() {
  if (ytReady && ytPlayer && typeof ytPlayer.unMute === 'function') {
    ytPlayer.unMute();
  }
}

function setVolumeYoutube(vol) {
  if (ytReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
    ytPlayer.setVolume(vol);
  }
}

function startAudioPlayback() {
  // file:// protokolünde YouTube çalışmaz, fallback kullan
  if (isFileProtocol) {
    isUsingFallbackAudio = true;
    playFallbackTone();
    return true;
  }

  if (!ytReady || !ytPlayer || !currentVideoId) return false;

  try {
    if (firstPlay) {
      muteYoutube();
      ytPlayer.playVideo();
      setTimeout(() => {
        if (isAudioPlaying) {
          unMuteYoutube();
          setVolumeYoutube(knobPercentage);
        }
      }, 300);
      firstPlay = false;
    } else {
      ytPlayer.playVideo();
      setVolumeYoutube(knobPercentage);
    }
    return true;
  } catch (e) {
    console.warn('Audio playback failed:', e);
    return false;
  }
}

function stopAudioPlayback() {
  if (isUsingFallbackAudio) {
    stopFallbackTone();
    isUsingFallbackAudio = false;
    return;
  }
  pauseYoutube();
}

function cueYoutube(videoId) {
  if (ytReady && ytPlayer && typeof ytPlayer.cueVideoById === 'function') {
    ytPlayer.cueVideoById(videoId);
  }
}

function initYouTube() {
  if (ytScriptLoaded) return;

  if (isFileProtocol) {
    showError('Lütfen bir HTTP sunucusu kullanın: python -m http.server');
    return;
  }

  ytScriptLoaded = true;

  window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-player', {
      height: '0',
      width: '0',
      videoId: currentVideoId || undefined,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  };

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  document.head.appendChild(tag);
}

function onPlayerReady() {
  ytReady = true;

  if (pendingVideoId) {
    ytPlayer.cueVideoById(pendingVideoId);
    pendingVideoId = null;
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    setAudioPlayingUI(true);
  }

  if (event.data === YT.PlayerState.PAUSED) {
    setAudioPlayingUI(false);
  }

  if (event.data === YT.PlayerState.ENDED) {
    setAudioPlayingUI(false);
  }
}

// ── Track Loading ───────────────────────────────────────────
function loadTrack(id) {
  const track = playlist[id];
  if (!track) return;

  if (id !== currentId) {
    if (isAudioPlaying) {
      stopAudioPlayback();
      setAudioPlayingUI(false);
    }
    if (isArmOnRecord) {
      stopArm(false);
    }
    firstPlay = true;
    resetKnob();
  }

  const videoId = parseYoutubeId(track.youtube);
  currentId = id;
  currentVideoId = videoId;

  if (videoId) {
    cover.src = coverFromYoutube(videoId);
    cover.alt = `${track.song} — ${track.artist}`;
  }

  songTitle.textContent = track.song;
  artistName.textContent = track.artist;
  app.style.background = track.bg;
  document.title = `${track.song} — ${track.artist}`;

  if (ytReady && ytPlayer && videoId) {
    ytPlayer.cueVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

// ── Arm Operations ──────────────────────────────────────────
function moveArmToRecord() {
  if (isArmOnRecord || isAnimating) return;

  if (!ytScriptLoaded && !isFileProtocol) {
    initYouTube();
  }
  userInteracted = true;
  initFallbackAudio();

  animateTonearm(TONEARM_PLAY, () => {
    setArmOnRecordUI(true);
  });
}

function liftArmFromRecord() {
  if (!isArmOnRecord || isAnimating) return;

  if (isAudioPlaying) {
    stopAudioPlayback();
    setAudioPlayingUI(false);
  }

  animateTonearm(TONEARM_REST, () => {
    setArmOnRecordUI(false);
  });
}

function stopArm(instant = false) {
  if (armTween) armTween.kill();

  if (isAudioPlaying) {
    stopAudioPlayback();
    setAudioPlayingUI(false);
  }

  setArmOnRecordUI(false);

  if (instant) {
    gsap.set(tonearm, { rotation: TONEARM_REST });
    isAnimating = false;
    return;
  }

  animateTonearm(TONEARM_REST);
}

function toggleArmGesture(event) {
  event.preventDefault();
  if (isAnimating) return;

  if (isArmOnRecord) {
    liftArmFromRecord();
  } else {
    moveArmToRecord();
  }
}

// ── Knob Logic ──────────────────────────────────────────────
function getKnobAngle(clientX, clientY) {
  const rect = knob.getBoundingClientRect();
  const knobX = rect.left + rect.width / 2;
  const knobY = rect.top + rect.height / 2;

  const deltaX = clientX - knobX;
  const deltaY = clientY - knobY;

  let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  angle = angle + 90;
  if (angle < -180) angle += 360;
  if (angle > 180) angle -= 360;

  return angle;
}

function updateKnob(angle) {
  if (angle < KNOB_MIN_ANGLE) angle = KNOB_MIN_ANGLE;
  if (angle > KNOB_MAX_ANGLE) angle = KNOB_MAX_ANGLE;

  knobCurrentAngle = angle;
  knob.style.transform = `rotate(${knobCurrentAngle}deg)`;

  knobPercentage = Math.round(((knobCurrentAngle - KNOB_MIN_ANGLE) / KNOB_ANGLE_RANGE) * 100);

  const isOn = knobPercentage > 0;

  if (isOn) {
    knobStatus.textContent = knobPercentage + '%';
    knob.classList.add('on');
    knobStatus.classList.add('on');
  } else {
    knobStatus.textContent = 'OFF';
    knob.classList.remove('on');
    knobStatus.classList.remove('on');
  }

  // Ses seviyesini güncelle
  if (isAudioPlaying) {
    if (isUsingFallbackAudio && gainNode) {
      gainNode.gain.value = knobPercentage / 100;
    } else if (ytReady) {
      setVolumeYoutube(knobPercentage);
    }
  }

  // Ses açma/kapatma
  if (isOn && !isAudioPlaying && isArmOnRecord) {
    userInteracted = true;
    if (!ytScriptLoaded && !isFileProtocol) {
      initYouTube();
    }
    initFallbackAudio();

    if (ytReady && currentVideoId) {
      const success = startAudioPlayback();
      if (success) setAudioPlayingUI(true);
    } else if (isFileProtocol) {
      // Fallback ses
      startAudioPlayback();
      setAudioPlayingUI(true);
    }
  } else if (!isOn && isAudioPlaying) {
    stopAudioPlayback();
    setAudioPlayingUI(false);
  }
}

function resetKnob() {
  knobCurrentAngle = KNOB_MIN_ANGLE;
  knobPercentage = 0;
  knob.style.transform = `rotate(${KNOB_MIN_ANGLE}deg)`;
  knob.classList.remove('on');
  knobStatus.textContent = 'OFF';
  knobStatus.classList.remove('on');
}

// Knob Event Handlers
function onKnobStart(e) {
  if (!isArmOnRecord) {
    gsap.to(knob, {
      rotation: '+=5',
      duration: 0.05,
      yoyo: true,
      repeat: 3,
      ease: 'power2.inOut'
    });
    return;
  }

  isDragging = true;
  const pageX = e.pageX || (e.touches && e.touches[0].pageX);
  const pageY = e.pageY || (e.touches && e.touches[0].pageY);

  if (!pageX || !pageY) return;

  const clickAngle = getKnobAngle(pageX, pageY);
  knobStartAngle = clickAngle - knobCurrentAngle;

  e.preventDefault();
}

function onKnobMove(e) {
  if (!isDragging) return;

  const pageX = e.pageX || (e.touches && e.touches[0].pageX);
  const pageY = e.pageY || (e.touches && e.touches[0].pageY);

  if (!pageX || !pageY) return;

  const clickAngle = getKnobAngle(pageX, pageY);
  let targetAngle = clickAngle - knobStartAngle;

  if (targetAngle < -180) targetAngle += 360;
  if (targetAngle > 180) targetAngle -= 360;

  updateKnob(targetAngle);
}

function onKnobEnd() {
  isDragging = false;
}

// ── Event Listeners ───────────────────────────────────────
['pointerdown', 'touchstart', 'click'].forEach((type) => {
  tonearm.addEventListener(type, toggleArmGesture, { passive: false });
});

knob.addEventListener('mousedown', onKnobStart);
document.addEventListener('mousemove', onKnobMove);
document.addEventListener('mouseup', onKnobEnd);

knob.addEventListener('touchstart', onKnobStart, { passive: false });
document.addEventListener('touchmove', onKnobMove, { passive: false });
document.addEventListener('touchend', onKnobEnd);

window.addEventListener('hashchange', () => {
  const id = resolveTrackId();
  if (id !== currentId) loadTrack(id);
});

// ── Init ──────────────────────────────────────────────────
function init() {
  gsap.set(tonearm, { rotation: TONEARM_REST, transformOrigin: '50% 8%' });

  knob.style.transform = `rotate(${KNOB_MIN_ANGLE}deg)`;
  knob.classList.add('disabled');

  const id = resolveTrackId();
  currentId = id;
  loadTrack(id);

  if (!location.hash) {
    history.replaceState(null, '', `#${id}`);
  }

  if ($('#turntable')) {
    gsap.fromTo('#turntable', { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out' });
  }

  if ($('#track-info')) {
    gsap.fromTo('#track-info', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', delay: 0.15 });
  }

  // file:// protokolü uyarısı
  if (isFileProtocol) {
    console.warn('⚠️ file:// protokolü tespit edildi. YouTube sesi çalışmayabilir.');
    console.warn('💡 Lütfen bir yerel sunucu kullanın:');
    console.warn('   python -m http.server 8000');
    console.warn('   veya');
    console.warn('   npx serve .');
  }
}

init();
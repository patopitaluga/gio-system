<script setup>
import { onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  disabled: Boolean,
  isRecording: Boolean,
});

const emit = defineEmits(['start-recording', 'stop-recording']);

const TARGET_SAMPLE_RATE = 24000;
const MIN_CAPTURE_MS = 100;
const PCM_BYTES_PER_SAMPLE = 2;

let spacebarHeld = false;
let pointerHeld = false;
let capturedPcmBytes = 0;

const resampleToPcm16 = (float32Samples, sourceSampleRate) => {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    const pcm16 = new Int16Array(float32Samples.length);
    for (let i = 0; i < float32Samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, float32Samples[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm16;
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(float32Samples.length / ratio));
  const pcm16 = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = Math.min(float32Samples.length - 1, Math.floor(i * ratio));
    const sample = Math.max(-1, Math.min(1, float32Samples[sourceIndex]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm16;
};

let audioContext = null;
let processor = null;
let source = null;
let stream = null;

const stopCapture = () => {
  if (processor) {
    processor.onaudioprocess = null;
    processor.disconnect();
    processor = null;
  }

  if (source) {
    source.disconnect();
    source = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
};

const getCapturedAudioMs = () => (
  capturedPcmBytes / (TARGET_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE) * 1000
);

const hasEnoughAudio = () => getCapturedAudioMs() >= MIN_CAPTURE_MS;

const startCapture = async (onChunk) => {
  stopCapture();
  capturedPcmBytes = 0;

  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm16 = resampleToPcm16(input, audioContext.sampleRate);
    capturedPcmBytes += pcm16.byteLength;
    onChunk(pcm16.buffer);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
};

const isTypingTarget = (target) => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
};

const onPointerDown = (event) => {
  if (props.disabled || pointerHeld || props.isRecording) return;

  pointerHeld = true;
  event.currentTarget.setPointerCapture(event.pointerId);
  emit('start-recording');
};

const onPointerUp = (event) => {
  if (!pointerHeld) return;

  pointerHeld = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  emit('stop-recording');
};

const onPointerCancel = (event) => {
  if (!pointerHeld) return;

  pointerHeld = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  emit('stop-recording');
};

const onKeyDown = (event) => {
  if (event.code !== 'Space' || event.repeat || props.disabled || isTypingTarget(event.target) || spacebarHeld || props.isRecording) return;

  event.preventDefault();
  spacebarHeld = true;
  emit('start-recording');
};

const onKeyUp = (event) => {
  if (event.code !== 'Space' || !spacebarHeld) return;

  spacebarHeld = false;
  event.preventDefault();
  emit('stop-recording');
};

const onWindowBlur = () => {
  if (!spacebarHeld) return;

  spacebarHeld = false;
  emit('stop-recording');
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
});

watch(() => props.isRecording, (recording) => {
  if (!recording) pointerHeld = false;
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onWindowBlur);
  stopCapture();
});

defineExpose({ startCapture, stopCapture, hasEnoughAudio, getCapturedAudioMs });
</script>

<template>
  <div class="micContainer">
    <button
      type="button"
      class="micButton"
      :class="{ isRecording: isRecording, isDisabled: disabled && !isRecording }"
      :disabled="disabled && !isRecording"
      @pointerdown.prevent="onPointerDown"
      @pointerup.prevent="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <svg width="36" height="36" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M13.9997 18.0833C16.578 18.0833 18.6663 15.9949 18.6663 13.4166V6.99992C18.6663 4.42159 16.578 2.33325 13.9997 2.33325C11.4213 2.33325 9.33301 4.42159 9.33301 6.99992V13.4166C9.33301 15.9949 11.4213 18.0833 13.9997 18.0833Z"
          stroke-width="1.41231"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M5.0752 11.2585V13.2419C5.0752 18.1652 9.07686 22.1669 14.0002 22.1669C18.9235 22.1669 22.9252 18.1652 22.9252 13.2419V11.2585"
          stroke-width="1.41231"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M12.3784 7.50188C13.4284 7.11688 14.5718 7.11688 15.6218 7.50188"
          stroke-width="1.41231"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M13.0669 9.97504C13.6852 9.81171 14.3269 9.81171 14.9452 9.97504"
          stroke-width="1.41231"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M14 22.1667V25.6667"
          stroke-width="1.41231"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>

<style>
.micContainer {
  align-items: center;
  border-top: 1px solid #d4d4d8;
  box-sizing: border-box;
  display: flex;
  flex: 0 0 72px;
  justify-content: center;
  width: 100%;
}

.micButton {
  align-items: center;
  background-color: transparent;
  border: 0;
  border-radius: 50%;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  height: 56px;
  justify-content: center;
  padding: 0;
  width: 56px;
}

.micButton.isDisabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.micButton.isRecording {
  background-color: #999;
}

.micButton svg {
  display: block;
}

.micButton svg path {
  stroke: #1a3c34;
}

.micButton.isRecording svg path {
  stroke: #fff;
}
</style>

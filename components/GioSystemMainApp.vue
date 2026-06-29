<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Camera from './Camera.vue';
import History from './History.vue';
import InputBar from './InputBar.vue';
import Mic from './Mic.vue';

const isRecording = ref(false);
const isLoading = ref(false);
const isPreparingImage = ref(false);
const history = ref([]);
const errorMessage = ref('');
const csrfToken = ref('');
const selectedImage = ref(null);
const selectedImagePreview = ref('');
const question = ref('');
const liveTranscript = ref('');
const liveResponse = ref('');
const speechPreviewEnabled = ref(true);
const isCameraOpen = ref(false);
const cameraRef = ref(null);
const micRef = ref(null);
const voiceTurnState = ref('idle');

let querySocket = null;
let speechPreview = null;
let pendingVoiceTurn = null;
let completionChime = null;
let voiceStopRequested = false;
let cancelResetTimer = null;

const clearCancelResetTimer = () => {
  if (!cancelResetTimer) return;
  clearTimeout(cancelResetTimer);
  cancelResetTimer = null;
};

const resetVoiceTurn = () => {
  clearCancelResetTimer();
  voiceTurnState.value = 'idle';
  voiceStopRequested = false;
  pendingVoiceTurn = null;
};

const releaseVoiceCapture = () => {
  stopSpeechPreview();
  micRef.value?.stopCapture();
  isRecording.value = false;
  isLoading.value = false;
};

const scheduleCancelReset = () => {
  clearCancelResetTimer();
  cancelResetTimer = setTimeout(() => {
    if (voiceTurnState.value === 'idle') return;
    releaseVoiceCapture();
    resetVoiceTurn();
  }, 3000);
};

const cancelVoiceTurn = () => {
  voiceTurnState.value = 'cancelling';
  if (querySocket?.readyState === WebSocket.OPEN) {
    querySocket.send(JSON.stringify({ type: 'turn.cancel' }));
  }
  scheduleCancelReset();
};

const playCompletionChime = () => {
  try {
    if (!completionChime) {
      completionChime = new Audio('/bell-chime.mp3');
    }

    completionChime.currentTime = 0;
    void completionChime.play();
  } catch (error) {
    console.warn('Could not play completion chime', error);
  }
};

const stopSpeechPreview = () => {
  if (speechPreview) {
    speechPreview.stop();
    speechPreview = null;
  }
};

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

const ensureQuerySocket = () => {
  if (querySocket && (querySocket.readyState === WebSocket.OPEN || querySocket.readyState === WebSocket.CONNECTING)) {
    return querySocket;
  }

  querySocket = new WebSocket(getWebSocketUrl());

  querySocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'turn.started') {
      if (voiceTurnState.value !== 'starting' || !isRecording.value) {
        querySocket?.send(JSON.stringify({ type: 'turn.cancel' }));
        releaseVoiceCapture();
        resetVoiceTurn();
        return;
      }

      voiceTurnState.value = 'recording';
      liveTranscript.value = '';
      liveResponse.value = '';
      pendingVoiceTurn?.onStarted?.();
      return;
    }

    if (data.type === 'turn.cancelled') {
      releaseVoiceCapture();
      resetVoiceTurn();
      return;
    }

    if (data.type === 'turn.transcript.delta') {
      if (!isRecording.value) liveTranscript.value = data.transcript ?? '';
      return;
    }

    if (data.type === 'turn.transcript.completed') {
      if (!isRecording.value) liveTranscript.value = data.transcript ?? liveTranscript.value;
      return;
    }

    if (data.type === 'turn.response.delta') {
      liveResponse.value = data.response ?? '';
      return;
    }

    if (data.type === 'turn.complete') {
      liveTranscript.value = '';
      liveResponse.value = '';
      isLoading.value = false;
      resetVoiceTurn();

      const hasUserPrompt = Boolean(data.userPrompt?.trim());
      const hasResponse = Boolean(data.response?.trim());
      if (!hasUserPrompt && !hasResponse) return;

      appendTurnToHistory(data);
      question.value = '';
      clearImage();
      isLoading.value = false;
      resetVoiceTurn();
      playCompletionChime();
      return;
    }

    if (data.type === 'turn.error') {
      releaseVoiceCapture();
      liveTranscript.value = '';
      liveResponse.value = '';
      resetVoiceTurn();

      const benignErrors = [
        'No active audio turn to commit',
        'A turn is already in progress',
        'buffer too small',
      ];
      const errorText = data.error ?? '';
      if (benignErrors.some((message) => errorText.includes(message))) return;

      history.value.push({
        type: 'error',
        text: data.error ?? 'Failed to process request',
      });
    }
  };

  querySocket.onclose = () => {
    querySocket = null;
    resetVoiceTurn();
  };

  return querySocket;
};

const waitForSocketOpen = (socket) => new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) {
    resolve();
    return;
  }

  const onOpen = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error('WebSocket connection failed'));
  };
  const cleanup = () => {
    socket.removeEventListener('open', onOpen);
    socket.removeEventListener('error', onError);
  };

  socket.addEventListener('open', onOpen);
  socket.addEventListener('error', onError);
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read image'));
  reader.readAsDataURL(file);
});

const startVoiceTurn = async () => {
  if (!csrfToken.value) {
    errorMessage.value = 'Security token missing. Reload the app.';
    return;
  }

  const socket = ensureQuerySocket();
  await waitForSocketOpen(socket);

  if (voiceStopRequested) {
    cancelVoiceTurn();
    return;
  }

  let imageDataUrl;
  if (selectedImage.value) imageDataUrl = await fileToDataUrl(selectedImage.value);

  const outgoingQuestion = question.value.trim();

  pendingVoiceTurn = {
    onStarted: async () => {
      try {
        if (speechPreviewEnabled.value && window.SpeechPreview) {
          speechPreview = new window.SpeechPreview({
            lang: 'es-ES',
            onTranscript: (text) => {
              if (isRecording.value && text) liveTranscript.value = text;
            },
          });
          await speechPreview.start();
        }

        await micRef.value.startCapture((arrayBuffer) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(arrayBuffer);
        });
      } catch (error) {
        console.error(error);
        stopSpeechPreview();
        micRef.value?.stopCapture();
        socket.send(JSON.stringify({ type: 'turn.cancel' }));
        errorMessage.value = 'Microphone access failed';
        isRecording.value = false;
        isLoading.value = false;
        resetVoiceTurn();
      }
    },
  };

  voiceTurnState.value = 'starting';
  socket.send(JSON.stringify({
    type: 'turn.start',
    csrfToken: csrfToken.value,
    question: outgoingQuestion || undefined,
    image: imageDataUrl,
    hasAudio: true,
  }));
};

const appendTurnToHistory = (turn) => {
  if (turn.userPrompt) history.value.push({ type: 'user', text: turn.userPrompt });

  for (const action of turn.actions ?? []) {
    history.value.push({ type: 'action', text: action });
  }

  if (turn.response) history.value.push({ type: 'assistant', text: turn.response });
};

const setSelectedImage = (file) => {
  if (selectedImagePreview.value) URL.revokeObjectURL(selectedImagePreview.value);

  selectedImage.value = file;
  selectedImagePreview.value = URL.createObjectURL(file);
};

const loadCsrfToken = async () => {
  const response = await fetch('/csrf-token', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Failed to load CSRF token');

  const data = await response.json();
  csrfToken.value = data.csrfToken ?? '';
};

const loadAppConfig = async () => {
  const response = await fetch('/config', { credentials: 'same-origin' });
  if (!response.ok) return;

  const data = await response.json();
  speechPreviewEnabled.value = data.speechPreview !== false;
};

const sendQuery = ({ imageFile, questionText }) => {
  if (!csrfToken.value) {
    errorMessage.value = 'Security token missing. Reload the app.';
    return;
  }

  const outgoingQuestion = questionText?.trim() ?? '';
  const formData = new FormData();

  if (imageFile) formData.append('image', imageFile);
  if (outgoingQuestion) formData.append('question', outgoingQuestion);

  isLoading.value = true;
  errorMessage.value = '';

  fetch('/turn', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': csrfToken.value,
    },
    body: formData,
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to process request');

      appendTurnToHistory(data);
      question.value = '';
      clearImage();
      playCompletionChime();
    })
    .catch((error) => {
      history.value.push({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to process request',
      });
    })
    .finally(() => {
      isLoading.value = false;
    });
};

const isInputDisabled = computed(() => (
  isLoading.value
  || isPreparingImage.value
  || isCameraOpen.value
  || voiceTurnState.value !== 'idle'
));

const micDisabled = computed(() => (
  isLoading.value
  || isPreparingImage.value
  || isCameraOpen.value
  || (voiceTurnState.value !== 'idle' && !isRecording.value)
));

const openCamera = () => {
  cameraRef.value?.open();
};

const sendTextQuery = () => {
  if (isInputDisabled.value || !question.value.trim()) return;

  sendQuery({
    imageFile: selectedImage.value,
    questionText: question.value,
  });
};

const clearImage = () => {
  selectedImage.value = null;
  if (selectedImagePreview.value) URL.revokeObjectURL(selectedImagePreview.value);
  selectedImagePreview.value = '';
};

const onImageSelected = (file) => {
  errorMessage.value = '';
  setSelectedImage(file);
};

const onImageError = (message) => {
  errorMessage.value = message;
};

const onPreparingImage = (preparing) => {
  isPreparingImage.value = preparing;
  if (preparing) errorMessage.value = '';
};

const startRecording = () => {
  if (micDisabled.value || isRecording.value) return;

  voiceStopRequested = false;
  voiceTurnState.value = 'starting';
  isRecording.value = true;
  errorMessage.value = '';
  liveTranscript.value = '';
  liveResponse.value = '';

  startVoiceTurn().catch((error) => {
    console.error(error);
    stopSpeechPreview();
    errorMessage.value = error instanceof Error ? error.message : 'Voice connection failed';
    isRecording.value = false;
    liveTranscript.value = '';
    liveResponse.value = '';
    resetVoiceTurn();
  });
};

const stopRecording = () => {
  if (!isRecording.value) return;

  isRecording.value = false;
  voiceStopRequested = true;
  stopSpeechPreview();

  const enoughAudio = micRef.value?.hasEnoughAudio?.() ?? false;
  micRef.value?.stopCapture();

  if (voiceTurnState.value === 'starting' || voiceTurnState.value === 'cancelling') {
    cancelVoiceTurn();
    return;
  }

  if (voiceTurnState.value !== 'recording') return;

  if (!enoughAudio) {
    cancelVoiceTurn();
    return;
  }

  voiceTurnState.value = 'committing';
  isLoading.value = true;

  if (querySocket?.readyState === WebSocket.OPEN) {
    querySocket.send(JSON.stringify({ type: 'turn.commit' }));
  }
};

onMounted(() => {
  loadCsrfToken().catch((error) => {
    console.error(error);
    errorMessage.value = 'Failed to initialize security token';
  });
  loadAppConfig().catch((error) => {
    console.error(error);
  });
  document.addEventListener('touchend', stopRecording, false);
  document.addEventListener('mouseup', stopRecording, false);
});

onUnmounted(() => {
  document.removeEventListener('touchend', stopRecording, false);
  document.removeEventListener('mouseup', stopRecording, false);
  clearCancelResetTimer();
  micRef.value?.stopCapture();
  if (querySocket?.readyState === WebSocket.OPEN) {
    querySocket.send(JSON.stringify({ type: 'turn.cancel' }));
    querySocket.close();
  }
  stopSpeechPreview();
  clearImage();
});
</script>

<template>
  <div class="appShell">
    <History
      :history="history"
      :is-recording="isRecording"
      :live-transcript="liveTranscript"
      :live-response="liveResponse"
      :is-preparing-image="isPreparingImage"
      :is-loading="isLoading"
      :error-message="errorMessage"
    />

    <InputBar
      v-model:question="question"
      :selected-image="selectedImage"
      :selected-image-preview="selectedImagePreview"
      :disabled="isInputDisabled"
      @send-text="sendTextQuery"
      @open-camera="openCamera"
      @clear-image="clearImage"
    />

    <Mic
      ref="micRef"
      :disabled="micDisabled"
      :is-recording="isRecording"
      @start-recording="startRecording"
      @stop-recording="stopRecording"
    />

    <Camera
      ref="cameraRef"
      v-model:active="isCameraOpen"
      :disabled="isLoading || isPreparingImage"
      @image-selected="onImageSelected"
      @image-error="onImageError"
      @preparing-image="onPreparingImage"
    />
  </div>
</template>

<style>
.appShell {
  background: #f4f4f5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
}
</style>

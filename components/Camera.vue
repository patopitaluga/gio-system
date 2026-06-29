<script setup>
import { nextTick, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  active: Boolean,
  disabled: Boolean,
});

const emit = defineEmits([
  'update:active',
  'image-selected',
  'image-error',
  'preparing-image',
]);

const cameraVideo = ref(null);

const MAX_IMAGE_LONG_EDGE = 2048;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.5;

let cameraStream = null;

const loadImageElement = (source) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(source);
  const img = new Image();

  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not read image'));
  };

  img.src = url;
});

const scaleDimensions = (width, height, maxLongEdge) => {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

const canvasToJpegBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
      return;
    }
    reject(new Error('Could not compress image'));
  }, 'image/jpeg', quality);
});

const prepareImageForUpload = async (source, filename = 'photo.jpg') => {
  const file = source instanceof File
    ? source
    : new File([source], filename, { type: source.type || 'image/jpeg' });

  const img = await loadImageElement(file);
  const { width, height } = scaleDimensions(
    img.naturalWidth,
    img.naturalHeight,
    MAX_IMAGE_LONG_EDGE,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare image');

  context.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);

  while (blob.size > MAX_IMAGE_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= 0.1;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
};

const stopCameraStream = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (cameraVideo.value) cameraVideo.value.srcObject = null;
};

const close = () => {
  stopCameraStream();
  emit('update:active', false);
};

const open = async () => {
  if (props.disabled || props.active) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    emit('update:active', true);
    await nextTick();

    if (cameraVideo.value) cameraVideo.value.srcObject = cameraStream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    emit('image-error', 'Camera access failed');
    close();
  }
};

const prepareAndSelectImage = async (source, filename) => {
  emit('preparing-image', true);

  try {
    const prepared = await prepareImageForUpload(source, filename);
    emit('image-selected', prepared);
  } catch (error) {
    console.error(error);
    emit('image-error', error instanceof Error ? error.message : 'Could not process image');
  } finally {
    emit('preparing-image', false);
  }
};

const capturePhoto = async () => {
  const video = cameraVideo.value;
  if (!video?.videoWidth || !video?.videoHeight) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    emit('image-error', 'Could not capture photo');
    close();
    return;
  }

  context.drawImage(video, 0, 0);
  close();

  const captureBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not capture photo'));
    }, 'image/jpeg', 0.92);
  });

  await prepareAndSelectImage(captureBlob, `camera-${Date.now()}.jpg`);
};

watch(() => props.active, (active) => {
  if (!active) stopCameraStream();
});

onUnmounted(() => {
  close();
});

defineExpose({ open });
</script>

<template>
  <div v-if="active" class="cameraOverlay">
    <video ref="cameraVideo" class="cameraPreview" autoplay playsinline muted />
    <div class="cameraActions">
      <button type="button" class="cameraButton" @click="close">Cancel</button>
      <button type="button" class="cameraButton cameraButton--primary" @click="capturePhoto">Capture</button>
    </div>
  </div>
</template>

<style>
.cameraOverlay {
  background: #18181b;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  inset: 0;
  padding: 12px;
  position: absolute;
  z-index: 10;
}

.cameraPreview {
  background: #000;
  border-radius: 8px;
  flex: 1;
  min-height: 0;
  object-fit: cover;
  width: 100%;
}

.cameraActions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 10px;
}

.cameraButton {
  background: #3f3f46;
  border: 0;
  border-radius: 6px;
  color: #fafafa;
  cursor: pointer;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
}

.cameraButton--primary {
  background: #1a3c34;
}
</style>

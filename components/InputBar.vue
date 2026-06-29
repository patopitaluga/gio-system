<script setup>
defineProps({
  question: String,
  selectedImage: Object,
  selectedImagePreview: String,
  disabled: Boolean,
});

const emit = defineEmits([
  'update:question',
  'send-text',
  'open-camera',
  'clear-image',
]);

const onQuestionInput = (event) => {
  emit('update:question', event.target.value);
};
</script>

<template>
  <section class="inputBar">
    <div v-if="selectedImagePreview" class="imagePreview">
      <img :src="selectedImagePreview" alt="Selected image preview" class="imagePreview__thumb" />
      <span class="imagePreview__name">{{ selectedImage?.name }}</span>
      <button type="button" class="imagePreview__clear" aria-label="Remove image" @click="emit('clear-image')">×</button>
    </div>

    <div class="inputRow">
      <button
        type="button"
        class="attachButton"
        :disabled="disabled"
        aria-label="Take photo with camera"
        @click="emit('open-camera')"
      >
        Camera
      </button>
      <input
        :value="question"
        type="text"
        class="questionInput"
        placeholder="Ask..."
        :disabled="disabled"
        @input="onQuestionInput"
        @keydown.enter.prevent="emit('send-text')"
      />
      <button
        type="button"
        class="sendButton"
        :disabled="disabled || !question?.trim()"
        @click="emit('send-text')"
      >
        Send
      </button>
    </div>
  </section>
</template>

<style>
.inputBar {
  border-top: 1px solid #d4d4d8;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 8px;
  padding: 10px 12px;
}

.imagePreview {
  align-items: center;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
}

.imagePreview__thumb {
  border-radius: 4px;
  flex-shrink: 0;
  height: 36px;
  object-fit: cover;
  width: 36px;
}

.imagePreview__name {
  color: #52525b;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imagePreview__clear {
  background: transparent;
  border: 0;
  color: #71717a;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.inputRow {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.attachButton,
.sendButton {
  background: #e4e4e7;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  color: #3f3f46;
  cursor: pointer;
  flex-shrink: 0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 8px;
}

.attachButton:disabled,
.sendButton:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.questionInput {
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-sizing: border-box;
  color: #18181b;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  min-width: 0;
  padding: 7px 10px;
}

.questionInput:disabled {
  opacity: 0.6;
}
</style>

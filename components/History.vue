<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
  isRecording: Boolean,
  liveTranscript: String,
  liveResponse: String,
  isPreparingImage: Boolean,
  isLoading: Boolean,
  errorMessage: String,
});

const panel = ref(null);

const renderMarkdown = (text) => {
  if (!text?.trim()) return '';

  const { marked, DOMPurify } = window;
  if (!marked?.parse || !DOMPurify?.sanitize) return text;

  return DOMPurify.sanitize(marked.parse(text));
};

const scrollToBottom = async () => {
  await nextTick();
  if (panel.value) {
    panel.value.scrollTop = panel.value.scrollHeight;
  }
};

watch(
  () => [
    props.history,
    props.liveTranscript,
    props.liveResponse,
    props.errorMessage,
    props.isRecording,
    props.isLoading,
    props.isPreparingImage,
  ],
  scrollToBottom,
  { deep: true },
);
</script>

<template>
  <section ref="panel" class="historyPanel" aria-live="polite">
    <template v-for="(entry, index) in history" :key="index">
      <div
        v-if="entry.type === 'assistant'"
        class="historyEntry historyEntry--assistant historyMarkdown"
        v-html="renderMarkdown(entry.text)"
      />
      <p
        v-else
        class="historyEntry"
        :class="`historyEntry--${entry.type}`"
      >
        {{ entry.text }}
      </p>
    </template>
    <p v-if="isRecording && !liveTranscript" class="historyEntry historyEntry--status">Listening...</p>
    <p
      v-if="liveTranscript"
      class="historyEntry historyEntry--user historyEntry--live"
      :class="{ 'historyEntry--preview': isRecording }"
    >{{ liveTranscript }}</p>
    <p v-if="liveResponse" class="historyEntry historyEntry--assistant historyEntry--live">{{ liveResponse }}</p>
    <p v-if="isPreparingImage" class="historyEntry historyEntry--status">Preparing image...</p>
    <p v-if="isLoading && !liveResponse" class="historyEntry historyEntry--status">Thinking...</p>
    <p v-if="errorMessage" class="historyEntry historyEntry--error">{{ errorMessage }}</p>
  </section>
</template>

<style>
.historyPanel {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.historyEntry {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.historyEntry--user {
  color: #1a3c34;
  font-weight: 600;
}

.historyEntry--assistant {
  color: #3f3f46;
}

.historyEntry--action {
  color: #7c6f2a;
  font-size: 12px;
  font-style: italic;
}

.historyEntry--live {
  opacity: 0.85;
}

.historyEntry--preview {
  font-style: italic;
  opacity: 0.7;
}

.historyEntry--status {
  color: #71717a;
}

.historyEntry--error {
  color: #b91c1c;
}

.historyMarkdown {
  white-space: normal;
}

.historyMarkdown :first-child {
  margin-top: 0;
}

.historyMarkdown :last-child {
  margin-bottom: 0;
}

.historyMarkdown h1,
.historyMarkdown h2,
.historyMarkdown h3 {
  color: #27272a;
  line-height: 1.3;
  margin: 0.75em 0 0.35em;
}

.historyMarkdown h1 {
  font-size: 1.15em;
}

.historyMarkdown h2 {
  font-size: 1.05em;
}

.historyMarkdown h3 {
  font-size: 1em;
}

.historyMarkdown p,
.historyMarkdown ul,
.historyMarkdown ol {
  margin: 0.35em 0;
}

.historyMarkdown ul,
.historyMarkdown ol {
  padding-left: 1.25em;
}

.historyMarkdown li {
  margin: 0.15em 0;
}

.historyMarkdown strong {
  color: #27272a;
}

.historyMarkdown code {
  background: #f4f4f5;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
  padding: 0.1em 0.3em;
}

.historyMarkdown pre {
  background: #f4f4f5;
  border-radius: 6px;
  margin: 0.5em 0;
  overflow-x: auto;
  padding: 0.6em 0.75em;
}

.historyMarkdown pre code {
  background: none;
  padding: 0;
}
</style>

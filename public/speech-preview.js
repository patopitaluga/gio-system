class SpeechPreview {
  constructor({ lang = 'es-ES', onTranscript } = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SpeechRecognition);
    this.onTranscript = onTranscript;

    if (!this.supported) {
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = lang;
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
  }

  start() {
    if (!this.supported) {
      return Promise.resolve(false);
    }

    return new Promise((resolve, reject) => {
      this.recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }

        const lastResult = event.results[event.results.length - 1];
        this.onTranscript?.(text.trim(), Boolean(lastResult?.isFinal));
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        reject(new Error(event.error || 'Speech preview failed'));
      };

      this.recognition.onstart = () => resolve(true);
      this.recognition.start();
    });
  }

  stop() {
    if (!this.recognition) {
      return;
    }

    this.recognition.onresult = null;
    this.recognition.onerror = null;
    this.recognition.onstart = null;

    try {
      this.recognition.stop();
    } catch {
      // Recognition may already be stopped.
    }
  }
}

window.SpeechPreview = SpeechPreview;

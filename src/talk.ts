import { playAudioFile, generateAudio } from './depedenciesLibrary/voice'
<<<<<<< HEAD
import { llamaInvoke, LlamaStreamCommand } from './depedenciesLibrary/llm';
=======
import { llamaInvoke } from './depedenciesLibrary/llm';
import { Mutex } from 'async-mutex';

const mutex = new Mutex();
>>>>>>> 732cf80 (multiple bug fixes: handle concurrent audio generation, empty transcripts, also add a more generic rp format)

// Talk: Greedily generate audio while completing an LLM inference
export const talk = async (prompt: string, input: string, llamaServerUrl: string, personaConfig:string, interruptCallback: (token: string, streamId: string) => boolean, sentenceCallback: (sentence: string) => void): Promise<string> => {
  let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
  let promisesChain = Promise.resolve();

  const sentences: string[] = [];
  let currentSentence: string[] = [];
  const streamId = Math.random().toString(36).substring(7);

  const response = await llamaInvoke(prompt, input, llamaServerUrl, personaConfig, (token: string): LlamaStreamCommand => {
    const streamCommand: LlamaStreamCommand = {
      stop: false
    }
    const stopStream = interruptCallback(token, streamId);
    if (stopStream) {
      streamCommand.stop = true;
      return streamCommand;
    }
    token = token.replace(/[^a-zA-Z0-9 .,!?'\n-]/g, '');
    currentSentence.push(token);
    // Check if the token ends a sentence.
    if (sentenceEndRegex.test(token)) {
      const sentence = currentSentence.join('');
      sentences.push(sentence);
<<<<<<< HEAD
      const promise = generateAudio(sentence);
      promisesChain = promisesChain.then(async () => {
        await promise.then(playAudioFile);
        sentenceCallback(sentence);
=======
      promisesChain = promisesChain.then(async () => { 
        const release = await mutex.acquire();
        try {
          const audioFilePath = await generateAudio(sentence);
          await playAudioFile(audioFilePath);
          sentenceCallback(sentence);
        } finally {
          release();
        }
>>>>>>> 732cf80 (multiple bug fixes: handle concurrent audio generation, empty transcripts, also add a more generic rp format)
      });
      sentenceEndRegex = /[.!?]/;
      currentSentence = [];
    }
    return streamCommand;
  });
  await promisesChain;
  return response;
<<<<<<< HEAD

=======
>>>>>>> 732cf80 (multiple bug fixes: handle concurrent audio generation, empty transcripts, also add a more generic rp format)
}

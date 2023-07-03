import { playAudioFile, generateAudio } from './depedenciesLibrary/voice'
import { llamaInvoke, LlamaStreamCommand } from './depedenciesLibrary/llm';

// Talk: Greedily generate audio while completing an LLM inference
export const talk = async (prompt: string, input: string, interruptCallback: (token: string, streamId: string) => boolean, sentenceCallback: (sentence: string) => void): Promise<string|void> => {
  let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
  let promisesChain = Promise.resolve();

  const sentences: string[] = [];
  let currentSentence: string[] = [];
  const streamId = Math.random().toString(36).substring(7);

  const response = await llamaInvoke(prompt, input, (token: string): LlamaStreamCommand => {
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
      const promise = generateAudio(sentence);
      promisesChain = promisesChain.then(async () => {
        await promise.then(playAudioFile);
        sentenceCallback(sentence);
      });
      sentenceEndRegex = /[.!?]/;
      currentSentence = [];
    }
    return streamCommand;
  });
  await promisesChain;
  return response;

}

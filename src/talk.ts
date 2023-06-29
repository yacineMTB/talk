import { playAudioFile, generateAudio } from './depedenciesLibrary/voice'
import { llamaInvoke } from './depedenciesLibrary/llm';

// Talk: Greedily generate audio while completing an LLM inference
export const talk = async (prompt: string, input: string, llamaServerUrl: string, personaConfig:string, sentenceCallback: (sentence: string) => void): Promise<string> => {
  let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
  let promisesChain = Promise.resolve();

  const sentences: string[] = [];
  let currentSentence: string[] = [];

  const response = await llamaInvoke(prompt, input, llamaServerUrl, personaConfig, (token: string) => {
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
  });
  await promisesChain;
  return response;

}

import { stdout } from 'process';
import readline from 'readline';
import config from '../config.json';
import { playAudioFile, stopAudioPlayback, generateAudio } from '../src/voice'
const llama = require("../bindings/llama/llama-addon");

const { llamaModelPath } = config;
llama.init({ model: llamaModelPath });
console.clear();

const llamaInvokeWithAudio = (prompt: string, input: string): Promise<string> => {
  const formattedPrompt = `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nagent: `;
  return new Promise((resolve, reject) => {
    const promptTokens: string[] = [];
    let promptTokensDoneEchoing: boolean = false;
    let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
    let promisesChain = Promise.resolve();

    const sentences: string[] = [];
    let currentSentence: string[] = [];
    llama.startAsync({
      prompt: formattedPrompt,
      listener: (token: string) => {
        if (token === '[end of text]') {
          // Add any remaining tokens to the sentences array.
          if (currentSentence.length > 0) {
            sentences.push(currentSentence.join(''));
          }
          return resolve(promisesChain.then(() => sentences.join(' ')));
        }
        if (promptTokensDoneEchoing) {
          token = token.replace(/[^a-zA-Z0-9 .,!?'\n-]/g, '');
          stdout.write(token)
          currentSentence.push(token);
          // Check if the token ends a sentence.
          if (sentenceEndRegex.test(token)) {
            const sentence = currentSentence.join('');
            // console.log(sentence);
            sentences.push(sentence);
            const promise = generateAudio(sentence);
            promisesChain = promisesChain.then(() => promise.then(playAudioFile));
            sentenceEndRegex = /[.!?]/;  // less greedy
            currentSentence = [];
          }
        } else {
          promptTokens.push(token)
        }
        // TODO: The trim is leak from llama tokenizer inside the cpp
        // Ideally the cpp binding can take an option on whether to echo prompt tokens or not 
        // so I don't have to leak the lurk in here
        if (!promptTokensDoneEchoing && promptTokens.join('').trim() === formattedPrompt.trim()) {
          promptTokensDoneEchoing = true;
        }
      }
    });
  });
}

// TODO: Renable resposne reflex, and abstract away
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', async (str, key) => {
  if (key.sequence === '\u0003') {
    process.exit();
  }
  // R for respond
  if (key.sequence === 'r') {
    console.log('I hit r on my keeb. BANG!! Response begins!!')
    await llamaInvokeWithAudio('Tell me something interesting about the thing in the input. Start with a sentence. This is conversational. First sentence should be a simple precanned response, like "this is an interesting question". The first sentence you say should always be less than three words. the first sentence MUST be less than three words. Then, say some more sentences.', 'Are you as big of a fan of draco malfoy as me?');
  }
});
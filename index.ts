// TODO
// Figure out which TTS to use
import { spawn } from 'child_process';
import readline from 'readline';
import config from './config.json';
import fs from 'fs';
const { llamaModelPath, whisperModelPath, audioListenerScript } = config;
import { playAudioFile, stopAudioPlayback, generateAudio } from './src/voice'
import { stdout } from 'process';

const whisper = require('./bindings/whisper/whisper-addon');
const llama = require("./bindings/llama/llama-addon");
const audioProcess = spawn('bash', [audioListenerScript]);

// Init ggml cpp bindings
if ('lora' in config) {
  const lora = config.lora;
  llama.init({ model: llamaModelPath, lora: lora});
} else {
  llama.init({ model: llamaModelPath});
}

whisper.init(whisperModelPath);

let globalLlamaPromise: Promise<string>;
let globalWhisperPromise: Promise<string>;

// Utility functions
// hacky global
let currentAudioGeneration = '';
const updateScreen = () => {
  console.clear();
  const dialogue = getLlamaInputData(conversation);
  console.log(`\x1b[32m dialogue: \x1b[0m ${dialogue}\n\n\x1b`);
  console.log(`\x1b[36m transcription since watermark: \x1b[0m ${getTranscriptionSinceWatermark(conversation)}\n\n\x1b[33m`);
  console.log(`\x1b[36m current audio generation: \x1b[0m ${currentAudioGeneration}\n\n\x1b[33m`);
}


// Interfaces
interface Transcription {
  text: string;
  startByte: number;
  endByte: number;
  precannedLLMResponse?: string;
}
type Speaker = 'user' | 'agent';
interface Speech {
  speaker: Speaker;
  response: string;
}
interface Conversation {
  audioBuffer: Buffer;
  transcriptions: Transcription[];
  canonicalDialogue: Speech[];
  watermark: number;
}

// Constants
const SAMPLING_RATE = 16000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const ONE_SECOND = SAMPLING_RATE * (BIT_DEPTH / 8) * CHANNELS;
const BUFFER_LENGTH_SECONDS = 28;
const BUFFER_LENGTH = ONE_SECOND * BUFFER_LENGTH_SECONDS;

// Mutating functions
const addAudioDataToConversation = (conversation: Conversation, data: Buffer) => {
  conversation.audioBuffer = Buffer.concat([conversation.audioBuffer, data]);
}
const addTranscriptionToConversation = (conversation: Conversation, text: string, startByte: number, endByte: number) => {
  const lastTranscription = conversation.transcriptions[conversation.transcriptions.length - 1];
  if (!lastTranscription || lastTranscription.text !== text) {
    conversation.transcriptions.push({ startByte, endByte, text });
  }
  serializeConversation(conversation);
}

// TODO: Check logic. Edge cases?
const getTranscriptionSinceWatermark = (conversation: Conversation): string => {
  const { watermark } = conversation;
  let result = '';
  let { transcriptions } = conversation;

  // we want everything after the watermark
  // for every start byte, we want the longest continguous transcription
  const transcriptionPastWatermark = transcriptions.filter((transcription) => transcription.startByte >= watermark);
  const transcriptionsByStartByte: { [startByte: number]: Transcription | undefined } = {};
  for (let i = 0; i < transcriptionPastWatermark.length; i++) {
    const transcription = transcriptionPastWatermark[i];
    const mapHasStartByte = transcriptionsByStartByte[transcription.startByte] === undefined;
    const shouldAddTranscriptionToStartByte = (transcriptionsByStartByte[transcription.startByte]?.endByte || 0) <= transcription.endByte;
    if (!mapHasStartByte || shouldAddTranscriptionToStartByte) {
      transcriptionsByStartByte[transcription.startByte] = transcription;
    }
  }

  // convert to array, sort, and concat the text
  result = Object.entries(transcriptionsByStartByte)
    .sort(([startByteA], [startByteB]) => Number(startByteA) - Number(startByteB))
    .map(([_startByte, transcription]) => transcription?.text)
    .filter(Boolean)
    .join(' ');

  result = result.trim();

  return result;
}

const getMostRecentTranscriptionWithPrecannedLLMResponse = (conversation: Conversation): Transcription | undefined => {
  const { transcriptions } = conversation;
  for (let i = transcriptions.length - 1; i >= 0; i--) {
    const transcription = transcriptions[i];
    if (transcription.precannedLLMResponse) {
      return transcription;
    }
  }
  return undefined;
}

const serializeConversation = (conversation: Conversation) => {
  const transcriptions = conversation.transcriptions.map(({ text, startByte, endByte, precannedLLMResponse }) => ({ text, startByte, endByte, precannedLLMResponse }));
}

// big bag of state
// TODO: Roll data off
// Implement canonical dialogue
const conversation: Conversation = {
  audioBuffer: Buffer.alloc(0),
  transcriptions: [],
  canonicalDialogue: [],
  watermark: 0,
}

const seedCanonicalDialogue = () => {
  conversation.canonicalDialogue.push({ speaker: 'agent', response: "Hey yacine! long time no see. How have you been?" });
  conversation.canonicalDialogue.push({ speaker: 'user', response: "Alice! It's been ages. I've been good, quite busy with work though. And you?" });
  conversation.canonicalDialogue.push({ speaker: 'agent', response: "Pretty much the same here. Busy, busy. I've started reading manga and watahcing anime, it's really therapeutic." });
}
seedCanonicalDialogue();

audioProcess.stdout.on('readable', () => {
  let data;
  while (data = audioProcess.stdout.read()) {
    addAudioDataToConversation(conversation, data);
  }
});


const whisperLoop = async () => {
  // TODO: Figure out why segfault occurs when no waiting
  // Likely a hint in the original whisper cpp napi addon code
  // I presume the cause is init func early return?
  await new Promise(r => setTimeout(r, 1000));
  let start = 0;
  while (true) {
    const total_buffer_length = conversation.audioBuffer.length;
    const audioSlice = conversation.audioBuffer.slice(Math.max(start, conversation.watermark), total_buffer_length);
    globalWhisperPromise = whisper.whisperInferenceOnBytes(audioSlice);
    // const [result] = await Promise.all([globalWhisperPromise, globalLlamaPromise]);
    const result = await globalWhisperPromise;
    addTranscriptionToConversation(conversation, result, Math.max(start, conversation.watermark), total_buffer_length);
    if (total_buffer_length - start >= BUFFER_LENGTH) {
      start = total_buffer_length;
      // bug
      await new Promise(r => setTimeout(r, 1000));
    }
    updateScreen();
  }
}

// A bit lurky. So TODO: unlurk
// Returns a promise based on an eventual callback trigger
const llamaInvoke = (prompt: string, input: string): Promise<string> => {
  const formattedPrompt = `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nagent: `;
  return new Promise((resolve, reject) => {
    const promptTokens: string[] = [];
    let promptTokensDoneEchoing: boolean = false;
    const tokens: string[] = [];
    llama.startAsync({
      prompt: formattedPrompt,
      listener: (token: string) => {
        if (token === '[end of text]') {
          return resolve(tokens.join(''));
        }
        if (promptTokensDoneEchoing) {
          updateScreen();
          tokens.push(token);
          stdout.write(tokens.join(''))
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

const llamaInvokeWithAudio = async (prompt: string, input: string): Promise<string> => {
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
          currentAudioGeneration= sentences.flatMap((t) => t).join('');
          updateScreen();
          stdout.write(currentSentence.join(''))
          currentSentence.push(token);
          // Check if the token ends a sentence.
          if (sentenceEndRegex.test(token)) {
            const sentence = currentSentence.join('');
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

const getLlamaInputData = (conversation: Conversation): string => {
  // unclear behavior change
  const transcriptionSinceWatermark = getTranscriptionSinceWatermark(conversation);
  const userSpeech: Speech = { speaker: "user", response: transcriptionSinceWatermark };
  return [...conversation.canonicalDialogue.slice(-4), userSpeech]
    .map((speech) => `${speech.speaker}: ${speech.response}`)
    .join('\n');
}

const llamaLoop = async () => {
  await new Promise(r => setTimeout(r, 2000));
  while (true) {
    await new Promise(r => setTimeout(r, 1000));
    if (conversation.transcriptions.length > 0) {
      const currentTranscription = conversation.transcriptions[conversation.transcriptions.length - 1];
      const inputData = getLlamaInputData(conversation);
      globalLlamaPromise = llamaInvoke("Be extremely terse. Come up with a preamble for the next diagloe. Not the entire response! Just a reasonable 3 word sentence to start with", inputData);
      const result: string = await globalLlamaPromise;
      currentTranscription.precannedLLMResponse = result;
    }
  }
}

whisperLoop();
// llamaLoop();


const responseReflexTrigger = async (conversation: Conversation): Promise<void> => {
  if (conversation.transcriptions.length > 0) {
    const currentTranscription = conversation.transcriptions[conversation.transcriptions.length - 1];
    const inputData = getLlamaInputData(conversation);
    console.log(inputData)
    globalLlamaPromise = llamaInvokeWithAudio("Be extremely terse. Simulate the next step in a role playing conversation. Only respond with a single sentence. 'agent' represents you. Don't use lists, only use english sentences. Only use UTF-8 characters. Keep the conversation going! Your name is alice. Only speak for alice, preceded with 'agent:'. You are a huge anime nerd.", inputData);
    const result: string = await globalLlamaPromise;
    currentTranscription.precannedLLMResponse = result;
  }


  const userTranscriptionSinceWatermark = getTranscriptionSinceWatermark(conversation);
  const userSpeech: Speech = { speaker: "user", response: userTranscriptionSinceWatermark };
  conversation.canonicalDialogue.push(userSpeech);
  const mostRecentTranscriptionWithPrecannedLLMResponse = getMostRecentTranscriptionWithPrecannedLLMResponse(conversation);
  if (mostRecentTranscriptionWithPrecannedLLMResponse) {
    const agentSpeech: Speech = { speaker: "agent", response: mostRecentTranscriptionWithPrecannedLLMResponse.precannedLLMResponse || '' };
    conversation.watermark = mostRecentTranscriptionWithPrecannedLLMResponse.endByte;
    conversation.canonicalDialogue.push(agentSpeech);
  }
}
// TODO: Renable resposne reflex, and abstract away
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', async (str, key) => {
  // Detect Ctrl+C and manually emit SIGINT to preserve default behavior
  if (key.sequence === '\u0003') {
    // The reason I wait for these promises is because ggml core dumps when you do it in the middle of an infer
    // Yes, lurk
    await Promise.all([globalLlamaPromise, globalWhisperPromise]);
    process.exit();
  }

  // R for respond
  if (key.sequence === 'r') {
    responseReflexTrigger(conversation);
  }
});
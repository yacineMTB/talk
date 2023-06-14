// TODO
// Figure out which TTS to use
import { spawn } from 'child_process';
import readline from 'readline';
import config from './config.json';
import fs from 'fs';
const { llamaModelPath, whisperModelPath, audioListenerScript } = config;
import { playAudioFile } from './src/depedenciesLibrary/voice'
import { llamaInvoke } from './src/depedenciesLibrary/llm'
import { talk } from './src/talk';
import { stdout } from 'process';

const whisper = require('./bindings/whisper/whisper-addon');
const llama = require("./bindings/llama/llama-addon");

// Init ggml cpp bindings
if ('lora' in config) {
  const lora = config.lora;
  // TODO: should return initialized object
  llama.init({ model: llamaModelPath, lora: lora });
} else {
  llama.init({ model: llamaModelPath });
}

// TODO: should return initialized object
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

// big bag of state
// TODO: Roll data off
const conversation: Conversation = {
  audioBuffer: Buffer.alloc(0),
  transcriptions: [],
  canonicalDialogue: [],
  watermark: 0,
}

conversation.canonicalDialogue.push({ speaker: 'agent', response: "Hey yacine! long time no see. How have you been?" });
conversation.canonicalDialogue.push({ speaker: 'user', response: "Alice! It's been ages. I've been good, quite busy with work though. And you?" });
conversation.canonicalDialogue.push({ speaker: 'agent', response: "Pretty much the same here. Busy, busy. I've started reading manga and watahcing anime, it's really therapeutic." });

const getLlamaInputData = (conversation: Conversation): string => {
  // unclear behavior change
  const transcriptionSinceWatermark = getTranscriptionSinceWatermark(conversation);
  const userSpeech: Speech = { speaker: "user", response: transcriptionSinceWatermark };
  return [...conversation.canonicalDialogue.slice(-4), userSpeech]
    .map((speech) => `${speech.speaker}: ${speech.response}`)
    .join('\n');
}

// EVENTS
const responseReflexTrigger = async (conversation: Conversation): Promise<void> => {
  const mostRecentTranscription = conversation.transcriptions[conversation.transcriptions.length - 1];
  const userTranscriptionSinceWatermark = getTranscriptionSinceWatermark(conversation);

  const inputData = getLlamaInputData(conversation);
  console.log(inputData)
  globalLlamaPromise = talk(
    "Be extremely terse. Simulate the next step in a role playing conversation. Only respond with a single sentence." +
    "'agent' represents you. Don't use lists, only use english sentences. Only use UTF-8 characters." +
    "Keep the conversation going! Your name is alice. Only speak for alice, preceded with 'agent: '. What does alice say next?",
    inputData,
    llama
  );
  const result: string = await globalLlamaPromise;
  mostRecentTranscription.precannedLLMResponse = result;

  const userSpeech: Speech = { speaker: "user", response: userTranscriptionSinceWatermark };
  conversation.canonicalDialogue.push(userSpeech);

  const agentSpeech: Speech = { speaker: "agent", response: mostRecentTranscription.precannedLLMResponse || '' };
  conversation.watermark = mostRecentTranscription.endByte;
  conversation.canonicalDialogue.push(agentSpeech);
}

const audioProcess = spawn('bash', [audioListenerScript]);
audioProcess.stdout.on('readable', () => {
  let data;
  while (data = audioProcess.stdout.read()) {
    addAudioDataToConversation(conversation, data);
  }
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', async (str, key) => {
  // Detect Ctrl+C and manually emit SIGINT to preserve default behavior
  if (key.sequence === '\u0003') {
    // Lurk
    // The reason I wait for these promises is because ggml core dumps when you do it in the middle of an infer
    await Promise.all([globalLlamaPromise, globalWhisperPromise]);
    process.exit();
  }

  // R for respond
  if (key.sequence === 'r') {
    responseReflexTrigger(conversation);
  }
});


// Main loop
const loop = async () => {
  // TODO: Figure out why segfault occurs when no waiting
  // Likely a hint in the original whisper cpp napi addon code
  // I presume the cause is init func early return?
  await new Promise(r => setTimeout(r, 2000));
  let start = 0;

  while (true) {
    const total_buffer_length = conversation.audioBuffer.length;
    const audioSlice = conversation.audioBuffer.slice(Math.max(start, conversation.watermark), total_buffer_length);
    const minWait = new Promise(r => setTimeout(r, 100));
    globalWhisperPromise = whisper.whisperInferenceOnBytes(audioSlice);
    // const [result] = await Promise.all([globalWhisperPromise, globalLlamaPromise]);
    const [result] = await Promise.all([globalWhisperPromise, minWait]);
    addTranscriptionToConversation(conversation, result, Math.max(start, conversation.watermark), total_buffer_length);
    if (total_buffer_length - start >= BUFFER_LENGTH) {
      start = total_buffer_length;
      // bug
      await new Promise(r => setTimeout(r, 1000));
    }
    updateScreen();
  }
}
loop();
import { spawn } from 'child_process';
import readline from 'readline';
import config from './config.json';
const { whisperModelPath, audioListenerScript } = config;
import { talk } from './src/talk';
import { Mutex } from './src/depedenciesLibrary/mutex';

const fs = require('fs');
const path = require('path');

const whisper = require('./bindings/whisper/whisper-addon');

// INIT GGML CPP BINDINGS
whisper.init(whisperModelPath);

let globalWhisperPromise: Promise<string>;

// CONSTANTS
const SAMPLING_RATE = 16000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const ONE_SECOND = SAMPLING_RATE * (BIT_DEPTH / 8) * CHANNELS;
const BUFFER_LENGTH_SECONDS = 28;
const BUFFER_LENGTH_MS = BUFFER_LENGTH_SECONDS * 1000;
const VAD_ENABLED = config.voiceActivityDetectionEnabled;
const INTERRUPTION_ENABLED = config.interruptionEnabled;
const INTERRUPTION_LENGTH_CHARS = 20;
// FIXME We should rewrite whisper.cpp's VAD to take a buffer size instead of ms
// Each buffer we send is about 0.5s
const VAD_BUFFER_SIZE = 8;
const VAD_SAMPLE_MS = ((VAD_BUFFER_SIZE / 2) / 2) * 1000;
const VAD_THOLD = 0.6;
const VAD_ENERGY_THOLD = 0.00005;

const DEFAULT_LLAMA_SERVER_URL = 'http://127.0.0.1:8080'
const WHISPER_TIMEOUT = 5000;
const MAX_DIALOGUES_IN_CONTEXT = 10;

let llamaServerUrl: string = DEFAULT_LLAMA_SERVER_URL;

if ('llamaServerUrl' in config) {
  llamaServerUrl = config.llamaServerUrl as string;
}

const DEFAULT_PROMPT = "Continue the dialogue, speak for bob only. \nMake it a fun lighthearted conversation."

let conversationPrompt: string = DEFAULT_PROMPT;
let personaConfig: string = "";
if ('personaFile' in config) {
  const personaFilePath = path.resolve(config.personaFile);
  if (fs.existsSync(personaFilePath)) {
    personaConfig = fs.readFileSync(personaFilePath, 'utf8');
    conversationPrompt = "";
  }
}

// INTERFACES
type EventType = 'audioBytes' | 'responseReflex' | 'transcription' | 'cutTranscription' | 'talk' | 'interrupt' | 'responseInput';
interface Event {
  eventType: EventType;
  timestamp: number;
  data: { [key: string]: any };
}
interface AudioBytesEvent extends Event {
  eventType: 'audioBytes';
  data: {
    buffer: Buffer;
  }
}
interface ResponseReflexEvent extends Event {
  eventType: 'responseReflex';
  data: {
    transcription: string
  }
}
interface TranscriptionEvent extends Event {
  eventType: 'transcription';
  data: {
    buffer: Buffer;
    transcription: string;
    lastAudioByteEventTimestamp: number;
  }
}
interface CutTranscriptionEvent extends Event {
  eventType: 'cutTranscription';
  data: {
    buffer: Buffer;
    transcription: string;
    lastAudioByteEventTimestamp: number;
  }
}
interface TalkEvent extends Event {
  eventType: 'talk';
  data: {
    response: string;
  }
}
interface ResponseInputEvent extends Event {
  eventType: 'responseInput',
  data: {}
}
interface InterruptEvent extends Event {
  eventType: 'interrupt';
  data: {
    streamId: string;
  }
}
interface EventLog {
  events: Event[];
}
const eventlog: EventLog = {
  events: []
};

// EVENTLOG UTILITY FUNCTIONS
// From the event log, get the transcription so far
const getLastTranscriptionEvent = (): TranscriptionEvent => {
  const transcriptionEvents = eventlog.events.filter(e => e.eventType === 'transcription');
  return transcriptionEvents[transcriptionEvents.length - 1] as TranscriptionEvent;
}

const getLastResponseReflexTimestamp = (): number => {
  const responseReflexEvents = eventlog.events.filter(e => e.eventType === 'responseReflex');
  return responseReflexEvents.length > 0 ? responseReflexEvents[responseReflexEvents.length - 1].timestamp : eventlog.events[0].timestamp;
};

const getCutTimestamp = (): number => {
  const cutTranscriptionEvents = eventlog.events.filter(e => e.eventType === 'cutTranscription');
  const lastCut = cutTranscriptionEvents.length > 0 ? cutTranscriptionEvents[cutTranscriptionEvents.length - 1].data.lastAudioByteEventTimestamp : eventlog.events[0].timestamp;
  const lastResponseReflex = getLastResponseReflexTimestamp();
  return Math.max(lastResponseReflex, lastCut);
}

const getTransciptionSoFar = (): string => {
  const lastResponseReflex = getLastResponseReflexTimestamp();
  const cutTranscriptionEvents = eventlog.events.filter(e => e.eventType === 'cutTranscription' && e.timestamp > lastResponseReflex);
  const lastTranscriptionEvent = getLastTranscriptionEvent();
  const lastCutTranscriptionEvent = cutTranscriptionEvents[cutTranscriptionEvents.length - 1];
  let transcription = cutTranscriptionEvents.map(e => e.data.transcription).join(' ');
  if (!lastCutTranscriptionEvent || lastCutTranscriptionEvent.timestamp !== lastTranscriptionEvent.timestamp) {
    transcription = transcription + (lastTranscriptionEvent?.data?.transcription || '')
  }
  return transcription
}

const getDialogue = (): string => {
  const dialogueEvents = eventlog.events
    .filter(e => e.eventType === 'responseReflex' || e.eventType === 'talk');

  let result = [];
  let lastType = null;
  let mergedText = '';

  for (let e of dialogueEvents) {
    const currentSpeaker = e.eventType === 'responseReflex' ? 'alice' : 'bob';
    const currentText = e.eventType === 'responseReflex' ? e.data.transcription : e.data.response;

    if (lastType && lastType === currentSpeaker) {
      mergedText += ' ' + currentText;
    } else {
      if (mergedText) result.push(mergedText);
      mergedText = `${currentSpeaker}: ${currentText}`;
    }

    lastType = currentSpeaker;
  }

  // push last merged text
  if (mergedText) result.push(mergedText);

  if (result.length > MAX_DIALOGUES_IN_CONTEXT) {
    result = result.slice(-MAX_DIALOGUES_IN_CONTEXT);
  }

  return result.join('\n');
}

// const updateScreenEvents: Set<EventType> = new Set([])
const updateScreenEvents: Set<EventType> = new Set(['responseReflex', 'cutTranscription', 'talk', 'interrupt'])
const updateScreen = (event: Event) => {
  if (updateScreenEvents.has(event.eventType)) {
    console.log(getDialogue())
    console.log(event);
  }
}

// EVENTS
const newEventHandler = (event: Event): void => {
  eventlog.events.push(event);
  updateScreen(event)
  const downstreamEvents = eventDag[event.eventType];
  for (const downstreamEvent in downstreamEvents) {
    const downstreamEventFn = downstreamEvents[downstreamEvent as EventType];
    // Note: Unecessary existence check, this is typesafe
    if (downstreamEventFn) {
      downstreamEventFn(event);
    }
  }
}

const newAudioBytesEvent = (buffer: Buffer): void => {
  const audioBytesEvent: AudioBytesEvent = {
    timestamp: Number(Date.now()),
    eventType: 'audioBytes',
    data: { buffer }
  }
  newEventHandler(audioBytesEvent);
}

function promiseTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  let timeout = new Promise<T>((resolve, reject) => {
    let id = setTimeout(() => {
      clearTimeout(id);
      reject(`Timed out in ${ms}ms.`);
    }, ms);
  });

  return Promise.race([
    promise,
    timeout
  ]);
}

let transcriptionMutex = false;
const transcriptionEventHandler = async (event: AudioBytesEvent) => {
  // TODO: Unbounded linear growth. Instead, walk backwards or something.
  const lastCut = getCutTimestamp();
  const audioBytesEvents = eventlog.events.filter(e => e.eventType === 'audioBytes' && e.timestamp >= lastCut);
  // Check if the user has stopped speaking
  if (VAD_ENABLED && (audioBytesEvents.length > (VAD_BUFFER_SIZE - 1))) {
    const activityEvents = [];
    for (let i=VAD_BUFFER_SIZE; i>0; i--) {
      activityEvents.push(audioBytesEvents[audioBytesEvents.length - i].data.buffer);
    }
    const activityBuffer = Buffer.concat(activityEvents);
    const lastTranscription = getLastTranscriptionEvent()
    const doneSpeaking = whisper.finishedVoiceActivity(activityBuffer, VAD_SAMPLE_MS, VAD_THOLD, VAD_ENERGY_THOLD);
    if (doneSpeaking && lastTranscription && lastTranscription.data.transcription.length) {
        return responseInputEventHandler();
    }
  }
  const joinedBuffer = Buffer.concat(
    audioBytesEvents.map((event) => event.data.buffer)
  );

  // TODO: Wait for 1s, because whisper bindings currently throw out if not enough audio passed in
  // Therefore fix whisper
  if (!transcriptionMutex && joinedBuffer.length > ONE_SECOND) {  
    try {
      transcriptionMutex = true;
      const whisperPromise = whisper.whisperInferenceOnBytes(joinedBuffer);
      globalWhisperPromise = promiseTimeout<string>(WHISPER_TIMEOUT, whisperPromise);
      // globalWhisperPromise = whisper.whisperInferenceOnBytes(joinedBuffer);
      const rawTranscription = await globalWhisperPromise;
      let transcription = rawTranscription.replace(/\s*\[[^\]]*\]\s*|\s*\([^)]*\)\s*/g, ''); // clear up text in brackets
      transcription = transcription.replace(/[^a-zA-Z0-9\.,\?!\s\:\'\-]/g, ""); // retain only alphabets chars and punctuation
      transcription = transcription.trim();
      
      const transcriptionEvent: TranscriptionEvent = {
        timestamp: Number(Date.now()),
        eventType: 'transcription',
        data: {
          buffer: joinedBuffer,
          transcription,
          lastAudioByteEventTimestamp: audioBytesEvents[audioBytesEvents.length - 1].timestamp
        }
      }
      newEventHandler(transcriptionEvent);
      
    } catch (error) {
      console.error(`Whisper promise error: ${error}`);
    } finally {
      transcriptionMutex = false;
    }
  }
}

const cutTranscriptionEventHandler = async (event: TranscriptionEvent) => {
  const lastCut = getCutTimestamp();
  const timeDiff = event.timestamp - lastCut;
  if (timeDiff > BUFFER_LENGTH_MS) {
    const cutTranscriptionEvent: CutTranscriptionEvent = {
      timestamp: event.timestamp,
      eventType: 'cutTranscription',
      data: {
        buffer: event.data.buffer,
        transcription: event.data.transcription,
        lastAudioByteEventTimestamp: event.data.lastAudioByteEventTimestamp
      }
    }
    newEventHandler(cutTranscriptionEvent);
  }
}

const responseReflexEventHandler = async (): Promise<void> => {
  await globalWhisperPromise;
 // Check if there was a response input between the last two transcription events
 const transcriptionEvents = eventlog.events.filter(e => e.eventType === 'transcription');
 const lastTranscriptionEventTimestamp = transcriptionEvents.length > 1 ? transcriptionEvents[transcriptionEvents.length - 2].timestamp : eventlog.events[0].timestamp;
 const responseInputEvents = eventlog.events.filter(e => (e.eventType === 'responseInput'));
 const lastResponseInputTimestamp = responseInputEvents.length > 0 ? responseInputEvents[responseInputEvents.length - 1].timestamp : eventlog.events[0].timestamp;
 if (lastResponseInputTimestamp > lastTranscriptionEventTimestamp) {
    const transcription = getTransciptionSoFar();
    if (transcription) {
      const responseReflexEvent: ResponseReflexEvent = {
        timestamp: Number(Date.now()),
        eventType: 'responseReflex',
        data: {
          transcription: transcription
        }
      }
      newEventHandler(responseReflexEvent);
    } else {
      console.log('No transcription yet. Please speak into the microphone.')
    }
  }
}

const mutex = new Mutex();

const talkEventHandler = async (event: ResponseReflexEvent): Promise<void> => {
  await mutex.lock();
  try {

    // Check if stream has been interrupted by the user
    const interruptCallback = (token: string, streamId: string): boolean => {
      if (!INTERRUPTION_ENABLED) {
        return false;
      }
      const streamInterrupts = eventlog.events.filter(e => e.eventType === 'interrupt' && (e.data?.streamId == streamId));
      if (streamInterrupts?.length) {
        return true;
      }
      const lastTranscription = getLastTranscriptionEvent();
      const lastTranscriptionLength = lastTranscription?.data?.transcription?.length;
      const lastTranscriptionTimestamp = lastTranscription?.timestamp;
      const lastResponseReflexTimestamp = getLastResponseReflexTimestamp();
      if ((lastTranscriptionLength > 0) && (lastTranscriptionTimestamp > lastResponseReflexTimestamp) && (lastTranscriptionLength >= INTERRUPTION_LENGTH_CHARS)) {
        const interruptEvent: InterruptEvent = {
          timestamp: Number(Date.now()),
          eventType: 'interrupt',
          data: {
            streamId
          }
        }
        newEventHandler(interruptEvent);
        return true;
      }
      return false;
    }
    const talkCallback = (sentence: string) => {
      const talkEvent: TalkEvent = {
        timestamp: Number(Date.now()),
        eventType: 'talk',
        data: {
          response: sentence.trim()
        }
      }
      newEventHandler(talkEvent);
    };
    const input = getDialogue();
    const talkPromise = talk(
      conversationPrompt,
      input,
      llamaServerUrl,
      personaConfig,
      interruptCallback,
      talkCallback
    );

    await talkPromise;
  } finally {
    mutex.unlock();
  }
}

const responseInputEventHandler = (): void => {
  const responseInputEvent: ResponseInputEvent = {
    eventType: 'responseInput',
    timestamp: Number(Date.now()),
    data: {}
  }
  newEventHandler(responseInputEvent);
}

// Defines the DAG through which events trigger each other
// Implicitly used by newEventHandler to spawn the correct downstream event handler
// All event spawners call newEventHandler
// newEventHandler adds the new event to event log
// This is actually not great. Might just have it be implicit.
const eventDag: { [key in EventType]: { [key in EventType]?: (event: any) => void } } = {
  audioBytes: {
    transcription: transcriptionEventHandler,
  },
  responseReflex: {
    talk: talkEventHandler,
  },
  transcription: {
    cutTranscription: cutTranscriptionEventHandler,
    responseReflex: responseReflexEventHandler
  },
  cutTranscription: {},
  talk: {},
  responseInput: {},
  interrupt: {}
}

const audioProcess = spawn('bash', [audioListenerScript]);
audioProcess.stdout.on('readable', () => {
  let data;
  while (data = audioProcess.stdout.read()) {
    newAudioBytesEvent(data);
  }
});
audioProcess.stderr.on('data', () => {
  // consume data events to prevent process from hanging
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', async (str, key) => {
  // Detect Ctrl+C and manually emit SIGINT to preserve default behavior
  if (key.sequence === '\u0003') {
    await Promise.all([globalWhisperPromise]);
    process.exit();
  }

  // R for respond
  if (key.sequence === 'r') {
    responseInputEventHandler();
  }
});

import {playAudioFile, stopAudioPlayback, generateAudio} from '../src/depedenciesLibrary/voice'

async function main() {
  const fileName = await generateAudio('Hello world, this is a longer demo. I am going to keep on talking and talking and talking');

  // Start audio playback
  playAudioFile(fileName);

  // In the middle of playback, generate another audio file and play it
  setTimeout(async () => {
    const newFileName = await generateAudio('This is a new file. The previous one has been stopped. And this one will be stopped really, really, really, really soon.');
    playAudioFile(newFileName);
  }, 3000);

  // Stop it
  setTimeout(async () => {
    stopAudioPlayback();
  }, 9000);
}

main();
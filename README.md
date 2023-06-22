# Talk
![Talk asset art](https://github.com/yacineMTB/talk/blob/master/assets/talklogo.png?raw=true)

Let's talk to our computers! [Demo with audio](https://twitter.com/yacineMTB/status/1671511343919185924)

Is this project useful to you? Give me a [**⬆money upvote!⬆**](https://donate.stripe.com/fZedSC6tOdvF7ew9AD)

## Supported platforms
**The intended audience for this project at the current state is people who are comfortable with hacking things together.** Meaning, it's hard to run on purpose.

Right now, this project is being developed on linux + cuda. Talk is still at an early stageWe'll keep on making it better as time goes on!

## Goals
- Runs completely locally
- Simple to extend
- I can learn something while I wash my dishes
- Research: opening up a platform for the community to try out HCI hacks

## Installation

### Using bundled bash script (experimental)
`chmod 775 build.sh`
`./build.sh`

** WARNING:The bash script will move the existing `config.json` file to `config.json.bkp` and create a new one instead. **
** Warning: This script doesn't install piper **

### Using manual steps 
- Get [piper](https://github.com/rhasspy/piper/), and add it to your path. This means calling piper, from anywhere in you system, should work. This is a TTS engine.
- Check config.json - you need to specifiy the path.
- `npm install` 
- Clone the submodules - `git submodule init && git submodule update --recursive`
- Run `npm install` in `whisper.cpp/examples/addon.node`
- Build & run them (make sure that whisper.cpp & llama.cpp can run)
  -  `cd whisper.cpp && make`
  -  `cd llama.cpp && make`
- In whisper.cpp git submodule `npx cmake-js compile --CDWHISPER_CUBLAS="ON" -T whisper-addon -B Release && cp -r ./build/Release  /home/kache/attractor/talk/conversation/build/whisper`
- Note that the above command has --CDWHISPER_CUBLAS=ON. Change that depending on the build parameters you want for your whisper engine. cmake-js can take cmake flags using --CD{The flag you want}. I'm using CUBLAS=ON because I'm on a 3090. Drop it if you're on a macbook. 
- Move the created `./whisper.cpp/build/Relase contents` to `./bindings/whisper/whisper-addon`
- In llama.cpp git submodule, build and run the server. [Check out their README here](https://github.com/ggerganov/llama.cpp/tree/master/examples/server). LLama should be running on local host port 8080 (We'll clean this up and make it easier to run)
- Make sure you can run their example curl!
- Get weights! I'm using hermes-13b for LLaMa, and whisper tiny.
- Change `config.json` to point to the models 

## Running the whole package
- Change the `config.json` to point to `record_audio.sh` to listen from mic or `sample_audio.sh` for bundled audio examples
- If `record_audio.sh` is selected, make sure `sox` package is install in your system. You can install it `apt install sox libsox-fmt-all`
- Read the code! Figure out which button you'll have to press to initiate the response reflex and have the bot respond
- `npm run start` 

## Contributing
Please do

## The bindings suck! How do I make them do what i want? 
`vim ./${llama/whisper}/examples/addon.node/addon.cpp`

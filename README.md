# Talk
![Talk asset art](https://github.com/yacineMTB/talk/blob/master/assets/talklogo.png?raw=true)

Let's build a conversational engine so we can talk to our computers! [Demo with audio](https://twitter.com/yacineMTB/status/1668432864289882113)

Is this project useful to you? Give me a [**⬆money upvote!⬆**](https://donate.stripe.com/fZedSC6tOdvF7ew9AD)


## Supported platforms
Right now, we have been testing this on linux + cuda. The project is still at an early stage, and requires a lot of elbow grease to get running. We'll keep on making it better as time goes on!

### Changelog
Wed Jun 21 2023
- Talk now uses an event based architecture
- Set up still isn't straightforward. We'll give this a pass
Wed Jun 14 2023
- Talk now responds to you.
- **Breaking change**: You're going to have to add piper to your path. See the manual steps

## Goals
- Runs completely locally
- Usuable by my grandmother, if she spoke english
- Simple to extend
- Discover little HCI hacks
- Being able to learn something while driving
- Clean up the [LLaMa node cpp binding](https://github.com/yacineMTB/llama.cpp/blob/cf70f603d5a50f553c022a3017ee901afc237236/examples/addon.node/addon.cpp) I added in my forked submodule enough to merge into mainline

## Installation

*The intended audience for this project at the current state is people who are comfortable with hacking things together.*

### Using bundled bash script (experimental)
```
chmod 775 build.sh
./build.sh
source install_piper.sh
```

**WARNING: The bash script will move the existing `config.json` file to `config.json.bkp` and create a new one instead.**

### Dependencies
- [Node.js](https://nodejs.org/en) v14.15+
- [piper](https://github.com/rhasspy/piper/), a TTS engine. Make sure to add it to your path. This means calling `piper` from anywhere in your system should work.

### Using manual steps 
- `npm install` 
- Clone the submodules: `git submodule init && git submodule update --recursive`
- Run `npm install` in `whisper.cpp/examples/addon.node`
- Build & run them (make sure that whisper.cpp & llama.cpp can run)
  -  `cd whisper.cpp && make`
  -  `cd llama.cpp && make`
- In the whisper.cpp git submodule, run:
  - `npx cmake-js compile --CDWHISPER_CUBLAS="ON" -T whisper-addon -B Release`
- Note that the above command has --CDWHISPER_CUBLAS=ON. Change that depending on the build parameters you want for your whisper engine. cmake-js can take cmake flags using --CD{The flag you want}. I'm using CUBLAS=ON because I'm on a 3090. **Drop it if you're on a macbook**. 
- `mv build/Release/whisper-addon.node ../bindings/whisper/`
- Get weights for the next step! I'm using hermes-13b for LLaMa, and whisper tiny.
- In llama.cpp git submodule, build and run the server. [Check out their README here](https://github.com/ggerganov/llama.cpp/tree/master/examples/server) for steps on how to do that. LLama should be running on local host port 8080 (We'll clean this up and make it easier to run)
- Make sure you can run their example curl!
- Change `config.json` to point to the models you downloaded

## Running the whole package
- Change the `config.json` to point to `record_audio.sh` to listen from mic or `sample_audio.sh` for bundled audio examples
- If `record_audio.sh` is selected, make sure `sox` package is install in your system. You can install it `apt install sox libsox-fmt-all`
- Read the code! Figure out which button you'll have to press to initiate the response reflex and have the bot respond
- `npm run start` 

## Contributing
Please do

## The bindings suck! How do I make them do what i want? 
`vim ./${llama/whisper}/examples/addon.node/addon.cpp`

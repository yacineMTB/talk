# Talk
![Talk asset art](https://github.com/yacineMTB/talk/blob/master/assets/talklogo.png?raw=true)

Let's build a conversational engine so we can talk to our computers!

[Demo with audio](https://twitter.com/yacineMTB/status/1667739001158025216)

Is this project useful to you? Give me a [**⬆money upvote!⬆**](https://donate.stripe.com/fZedSC6tOdvF7ew9AD)


## Next
- TTS engine added

## Goals
- Runs completely locally
- Usuable by my grandmother, if she spoke english
- Simple to extend
- Discover little HCI hacks
- Being able to learn something while driving
- Clean up the [LLaMa node cpp binding](https://github.com/yacineMTB/llama.cpp/blob/cf70f603d5a50f553c022a3017ee901afc237236/examples/addon.node/addon.cpp) I added in my forked submodule enough to merge into mainline

## Installation

### Using bundled bash script (experimental)

`chmod 775 build.sh`
`./build.sh`

** WARNING:The bash script will move the existing `config.json` file to `config.json.bkp` and create a new one instead. **

### Using manual steps 
- `npm install` 
- Clone the submodules - `git submodule update --recursive`
- Run `npm install` in `whisper.cpp/examples/addon.node`
- Run `npm install` in `llama.cpp/examples/addon.node`
- Build & run them (make sure that whisper.cpp & llama.cpp can run)
- In whisper.cpp git submodule `npx cmake-js compile --CDWHISPER_CUBLAS="ON" -T whisper-addon -B Release && cp -r ./build/Release  /home/kache/attractor/talk/conversation/build/whisper`
- Note that the above command has --CDWHISPER_CUBLAS=ON. Change that depending on the build parameters you want for your whisper engine. cmake-js can take cmake flags using --CD{The flag you want}. I'm using CUBLAS=ON because I'm on a 3090. Drop it if you're on a macbook. 
- Move the created `./whisper.cpp/build/Relase contents` to `./bindings/whisper/whisper-addon`
- In llama.cpp git submodule `npx cmake-js compile --CDLLAMA_CUBLAS="ON" -T llama-addon -B Release && cp -r ./build/Release /home/kache/attractor/talk/conversation/build/llama`
- Note, again, this includes LLAMA_CUBLAS flag. You only want this if you know what that flag does! E.g. if you're on a macbook, you don't want it.
- Move the created `./llama.cpp/build/Relase contents` to `./bindings/llama/llama-addon`
- Get weights! I'm using hermes-13b for LLaMa, and whisper tiny.
- Change `config.json` to point to the models 

## Running the whole package
- Change the `config.json` to point to `record_audio.sh` to listen from mic or `sample_audio.sh` for bundled audio examples
- If `record_audio.sh` is selected, make sure `sox` package is install in your system. You can install it `apt install sox libsox-fmt-all`
- `npm run start` 

## Contributing
Please do

## The bindings suck! How do I make them do what i want? 
`vim ./${llama/whisper}/examples/addon.node/addon.cpp`

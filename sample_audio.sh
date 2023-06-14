#!/bin/bash
ffmpeg -re -ss 0 -t 2:00 -i ./audio/answer2.wav -f wav -ac 1 -ar 16000 -sample_fmt s16 pipe:1

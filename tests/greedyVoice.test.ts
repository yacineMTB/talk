import config from '../config.json';
import { talk } from '../src/talk'
const llama = require("../bindings/llama/llama-addon");

const { llamaModelPath } = config;
llama.init({ model: llamaModelPath });
console.clear();

const inputData = "Bob: God, you can really be a silly billy";
talk(
    "Be extremely terse. Simulate the next step in a role playing conversation. Only respond with a single sentence." +
    "'agent' represents you. Don't use lists, only use english sentences. Only use UTF-8 characters." +
    "Keep the conversation going! Your name is alice. Only speak for alice, preceded with 'agent: '. What does alice say next?",
    inputData,
    llama
  )
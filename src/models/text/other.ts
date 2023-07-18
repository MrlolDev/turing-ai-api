import delay from "delay";
import { translateModels, request } from "../../utils/runpod.js";
import EventEmitter from "events";

export default {
  data: {
    name: "other",
    fullName: "Other models",
    parameters: {
      messages: {
        type: "array",
        required: true,
      },
      model: {
        type: "string",
        required: true,
        options: ["llama2"],
      },
      max_tokens: {
        type: "number",
        required: false,
        default: 300,
      },
      temperature: {
        type: "number",
        required: false,
        default: 0.7,
      },
      stream: {
        type: "boolean",
        required: false,
        default: false,
      },
    },
  },
  execute: async (data) => {
    const event = new EventEmitter();
    let { messages, model, max_tokens, temperature, stream } = data;
    let modelId = await translateModels(model);
    let result = {
      cost: 0,
      result: "",
      id: "",
      status: null,
      done: false,
    };
    let prompt = "";
    messages.forEach((message) => {
      if (message.role == "user") prompt += `User: ${message.content}\n`;
      else prompt += `Assistant: ${message.content}`;
    });
    prompt += "Assistant:";
    let res = await request(modelId, "run", {
      input: {
        prompt: prompt,
        temperature: temperature,
        max_new_tokens: max_tokens,
        stop: ["User:"],
      },
    });
    result.id = res.id;
    result.status = "queued";
    event.emit("data", result);
    await delay(1200);
    result = await checkStatus(modelId, res.id);
    event.emit("data", result);
    while (!result.done) {
      await delay(3000);
      result = await checkStatus(modelId, res.id);
      event.emit("data", result);
    }
  },
};

async function checkStatus(modelId, id) {
  let res = await request(modelId, `status/${id}`, {});
  let result = {
    cost: 0,
    result: "",
    status: "queued",
    done: false,
    id: id,
  };
  if (res.status.toLowerCase().includes("progress")) {
    result.status = "generating";
  } else if (res.status.includes("COMPLETED")) {
    result.status = "done";
    result.result = res.output;
    if (result.result.includes("\nUser:")) {
      result.result = result.result.split("\nUser:")[0];
    }
    res.done = true;
    let pricePerS = 0.00038;
    result.cost = res.executionTime * pricePerS;
  }
  return result;
}

import axios from "axios";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
export default {
  data: {
    name: "kandinsky",
    fullName: "Kandinsky 2.1",
    parameters: {
      prompt: {
        type: "string",
        required: true,
        description: "Prompt to generate the image",
      },
      steps: {
        type: "number",
        required: false,
        default: 100,
      },
      number: {
        type: "number",
        required: false,
        default: 1,
      },
      negative_prompt: {
        type: "string",
        required: false,
        default:
          "disfigured mouth, disfigured teeth, half head, half face, blury, side looking, old, wrinkle, child, no face, pencil, full body, sharp, far away, overlapping, duplication, nude, disfigured, kitsch, oversaturated, grain, low-res, Deformed, blurry, bad anatomy, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, blurry, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long body, disgusting, poorly drawn, childish, mutilated, mangled, surreal, out of frame, duplicate, 2 faces",
      },
      guidance_scale: {
        type: "number",
        required: false,
        default: 4,
      },
      width: {
        type: "number",
        required: false,
        default: 512,
      },
      height: {
        type: "number",
        required: false,
        default: 512,
      },
      cfg_scale: {
        type: "number",
        required: false,
        default: 4,
      },
      model_version: {
        type: "string",
        required: false,
        default: "2.2",
        options: ["2.1", "2.2"],
      },
      stream: {
        type: "boolean",
        required: false,
        default: true,
      },
    },
  },
  execute: async (data) => {
    let {
      prompt,
      steps,
      negative_prompt,
      guidance_scale,
      stream,
      model_version,
    } = data;
    if (!negative_prompt)
      negative_prompt =
        "disfigured mouth, disfigured teeth, half head, half face, blury, side looking, old, wrinkle, child, no face, pencil, full body, sharp, far away, overlapping, duplication, nude, disfigured, kitsch, oversaturated, grain, low-res, Deformed, blurry, bad anatomy, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, blurry, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long body, disgusting, poorly drawn, childish, mutilated, mangled, surreal, out of frame, duplicate, 2 faces";
    let event = null;
    if (!model_version) {
      model_version = "2.2";
    }
    if (stream == null) {
      stream = true;
    }
    let result = {
      cost: null,
      results: [],
      status: "generating",
      progress: 0,
      id: randomUUID(),
    };
    event = new EventEmitter();
    event.emit("data", result);
    //  after 5s change progress to 0.46
    setTimeout(() => {
      if (result.status == "generating") {
        result.progress = 0.46;
        event.emit("data", result);
      }
    }, 5000);

    let start = Date.now();

    axios({
      url: "https://api.runpod.ai/v2/kandinsky-v2/runsync",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RUNPOD_KEY}`,
      },
      data: {
        input: {
          prompt: prompt,
          prior_steps: `${steps}` || "50",
          guidance_scale: guidance_scale,
          negative_prompt: negative_prompt,
          num_images: data.number || 1,
          w: data.width || 512,
          h: data.height || 512,
          prior_cf_scale: data.cfg_scale || 4,
          //    model_version: model_version,
        },
      },
    }).then(async (response) => {
      let spentInSec = (Date.now() - start) / 1000;
      let cost = (response.data.executionTime / 1000) * 0.00025;
      result.cost = cost;
      if (data.number && data.number > 1) {
        try {
          result.results = await Promise.all(
            response.data.output.images.map(async (x) => {
              let res = await axios.get(x, {
                responseType: "arraybuffer",
                // change time out to 2 min
                timeout: 120000,
              });
              let base64 = Buffer.from(res.data, "binary").toString("base64");
              return {
                base64: base64,
                id: randomUUID(),
                seed: Math.floor(Math.random() * 100000000),
                status: "success",
              };
            })
          );
        } catch (e: any) {
          console.log(e);
          console.log(response.data);
          throw new Error(e);
        }
      } else {
        let res = await axios.get(response.data.output.image_url, {
          responseType: "arraybuffer",
          timeout: 120000,
        });
        let base64 = Buffer.from(res.data, "binary").toString("base64");
        result.results.push({
          base64: base64,
          id: randomUUID(),
          seed: Math.floor(Math.random() * 100000000),
          status: "success",
        });
      }
      result.status = "done";
      result.progress = null;
      console.log(
        `result for ${prompt} is ${result.status} with cost ${result.cost} and ${result.results.length} images on ${response.data.executionTime}ms and ${response.data.delayTime}ms delay`
      );
      event.emit("data", result);
    });
    return event;
  },
};

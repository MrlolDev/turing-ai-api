import express from "express";
import { Request, Response } from "express";
import turnstile from "../middlewares/captchas/turnstile.js";
import key from "../middlewares/key.js";
import client from "../index.js";
import log from "../utils/log.js";
import redisClient from "../db/redis.js";
import { update } from "../utils/db.js";
import delay from "delay";

const router = express.Router();

router.post(
  "/:type",
  key,
  turnstile,
  async (req: Request, res: Response) => await request(req, res)
);

router.post(
  "/:type/:ai",
  key,
  turnstile,
  async (req: Request, res: Response) => await request(req, res)
);

async function request(req, res) {
  let { type, ai } = req.params;
  const body = req.body;
  if (!ai) {
    ai = body.ai;
  }
  if (ai == "alan") {
    ai = "gpt";
    body.plugins = ["google"];
  }
  let typeObj = client[type];
  if (body.stream) {
    res.set("content-type", "text/event-stream");
  }
  if (!typeObj) {
    res.status(404).json({ success: false, error: "Type not found" });
    return;
  }
  try {
    let aiObject = typeObj.find((a) => a.data.name === ai);
    if (!aiObject) {
      log("info", `AI not found: ${ai}`, typeObj);
      res.status(404).json({ success: false, error: "AI not found" });
      return;
    }

    // check params and body
    let realParameters = aiObject.data.parameters; // is an object with keys as parameter names and values as parameter types
    let parameters = Object.keys(realParameters);
    let requiredParams = parameters.filter(
      (p) => realParameters[p].required === true
    );
    let bodyKeys = Object.keys(body);
    // check if all required params are in body
    let missingParams = requiredParams.filter((p) => !bodyKeys.includes(p));
    if (missingParams.length > 0) {
      res.status(400).json({
        success: false,
        error: `Missing parameters: ${missingParams.join(", ")}`,
      });
      return;
    }

    // not existing params
    /*
    let notExistingParams = bodyKeys.filter((p) => !parameters.includes(p));
    if (notExistingParams.length > 0) {
      res.status(400).json({
        success: false,
        error: `Not existing parameters: ${notExistingParams.join(", ")}`,
      });
      return;
    }*/
    let execution = await aiObject.execute(body);
    if (body.stream) {
      execution.on("data", async (data) => {
        res.write("data: " + JSON.stringify(data) + "\n\n");
        if (data.done || data.status == "done" || data.status == "failed") {
          res.end();
          if (data.cost) {
            await applyCost(data.cost, ai, type, req.user);
          }
        }
      });
    } else {
      res.status(200).json({ success: true, ...execution });
      if (execution.cost) {
        await applyCost(execution.cost, ai, type, req.user);
      }
    }
  } catch (error: any) {
    let resultError = error;
    if (error.response && error.response.data) {
      resultError = error.response.data;
    }
    console.log(error);
    res.status(500).json({ success: false, error: resultError });
  }
}

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the API, docs at https://docs.turing.sh",
  });
});

async function applyCost(cost, ai, type, user) {
  console.log(`Cost: ${cost}$`);
  //  add a 20% fee
  let totalCost = cost * 1.2;
  cost = 0.5;
  if (user && user.id != "530102778408861706") {
    let updatedUser: any = await redisClient.get(`users:${user.id}`);
    updatedUser = JSON.parse(updatedUser);
    let plan = updatedUser.plan;
    console.log(plan.used);
    plan.used += totalCost;
    plan.expenses.push({
      data: {
        model: ai,
        tokens: {},
      },
      time: Date.now(),
      type: type,
      used: totalCost,
    });
    await update("update", {
      collection: "users",
      id: user.id,
      plan,
    });
    await delay(3000);
    let up = JSON.parse(await redisClient.get(`users:${user.id}`)).plan;
    console.log(
      up.used,
      up.expenses
        .map((e) => {
          if (e.type != "chat") {
            return e;
          }
        })
        .filter((e) => e != undefined)
    );
  }
}

export default router;

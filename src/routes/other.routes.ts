import express from "express";
import { Request, Response } from "express";
import turnstile from "../middlewares/captchas/turnstile.js";
import key from "../middlewares/key.js";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";

const router = express.Router();

router.post(
  "/mp3-to-mp4",
  key,
  turnstile,
  async (req: Request, res: Response) => {
    let { audio, image } = req.body;
    try {
      // generate  a video from an audio and an image
      convertToVideo(audio, image, (videoBase64) => {
        res.json({ success: true, videoBase64 });
      });
    } catch (error) {
      console.log(error);
      res.json({ error: error, success: false }).status(400);
    }
  }
);

async function convertToVideo(audio, image, callback) {
  //  convert audio to video with ffmpeg using image as background
  // audio is a base64 string
  // image is a base64 string
  // callback is a function that will be called with the video base64 string
  let audioBuffer = Buffer.from(audio, "base64");
  let imageBuffer = Buffer.from(image, "base64");
  let audioPath = "./audio.mp3";
  let imagePath = "./image.jpg";
  let videoPath = "./video.mp4";
  fs.writeFileSync(audioPath, audioBuffer);
  fs.writeFileSync(imagePath, imageBuffer);
  ffmpeg()
    .input(audioPath)
    .input(imagePath)
    .outputOptions([
      "-c:v libx264",
      "-c:a aac",
      "-shortest",
      "-vf scale=1280:720",
    ])
    // be sure the image is visible
    .inputOptions(["-loop 1", "-framerate 2"])
    .output(videoPath)
    .on("end", function () {
      let videoBuffer = fs.readFileSync(videoPath);
      let videoBase64 = videoBuffer.toString("base64");
      callback(videoBase64);
    })
    .run();
}

export default router;

import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";
import { generateKey } from "./utils/key.js";

// routes
import OtherRoutes from "./routes/other.routes.js";
import ChartRoutes from "./routes/chart.routes.js";
import PaymentRoutes from "./routes/payment.routes.js";
import DataRoutes from "./routes/data.routes.js";
import RunpodRoutes from "./routes/runpod.routes.js";
import ModelRoutes from "./routes/models.routes.js";

const app: Application = express();

import { verifyToken } from "./middlewares/key.js";
import Ciclic from "./utils/ciclic.js";
import textHandler from "./handlers/text.js";
import imageHandler from "./handlers/image.js";
import audioHandler from "./handlers/audio.js";
import { autogenerateDocs } from "./utils/docs.js";
import log from "./utils/log.js";
const client = {
  text: [],
  image: [],
  audio: [],
};

app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://app.turing-ai.xyz",
      "https://app.turing.sh",
      "https://sellix.io",
      "https://sellix.pw",
      "https://sellix.xyz",
      "https://sellix.gg",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-captcha-token"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.set("port", process.env.PORT || 3000);

app.use("/other", OtherRoutes);
app.use("/chart", ChartRoutes);
app.use("/payments", PaymentRoutes);
app.use("/data", DataRoutes);
app.use("/runpod", RunpodRoutes);
app.use("/", ModelRoutes);

app.listen(app.get("port"), async () => {
  log("info", `Server is running on port ${app.get("port")}`);
  await Ciclic();
  await textHandler(client);
  await imageHandler(client);
  await audioHandler(client);
  if (process.env.NODE_ENV != "production") {
    await autogenerateDocs(client);
  }
});

export default client;

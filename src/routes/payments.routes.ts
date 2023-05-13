import express from "express";
import { Request, Response } from "express";
import turnstile from "../middlewares/captchas/turnstile.js";
import supabase from "../modules/supabase.js";
import key from "../middlewares/key.js";
import sellix from "@sellix/node-sdk";
import crypto, { createHmac } from "crypto";
import ms from "ms";

const router = express.Router();

router.post("/pay", key, async (req: Request, res: Response) => {
  let { productId, gateway, email, name, userId } = req.body;
  const Sellix = sellix(process.env.SELLIX_KEY);
  let customer;
  let customers = await Sellix.customers.list();
  customer = customers.filter((c: any) => c.email === email)[0];
  if (!customer) {
    customer = await Sellix.customers.create({
      name: name,
      email: email,
      surname: "Unknown",
    });
  } else {
    customer = customer.id;
  }
  const payment = await Sellix.payments.create({
    product_id: productId,
    return_url: `https://app.turing.sh/pay/success`,
    email: email,
    white_label: false,
    gateway: gateway || "stripe",
    customer_id: customer,
    custom_fields: {
      userId: userId,
    },
  });

  res.status(200).json(payment);
});
router.post("/webhook", async (req: Request, res: Response) => {
  const payload = req.body;
  console.log(`payload`, payload);
  const signature = req.headers["x-sellix-signature"];
  if (!signature) {
    return res.status(400).send("No signature");
    return;
  }

  const hmac = createHmac("sha256", process.env.SELLIX_WEBHOOK_SECRET);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest("hex");

  console.log(`expectedSignature`, expectedSignature);
  console.log(`signature`, signature);
  if (signature !== expectedSignature) {
    return res.status(400).send("Invalid signature");
  }
  if (payload.event !== "order.paid") {
    return res.status(400).send("Invalid event type");
    return;
  }

  const orderId = payload.data.id;

  const order = await sellix.orders.getOrder(orderId);
  let userId = order.custom_fields.userId;
  let { data } = await supabase.from("users_new").select("*").eq("id", userId);
  let user = data[0];
  await supabase
    .from("users_new")
    .update({
      subscription: {
        since: user.subscription.since || Date.now(),
        expires: user.subscription.expires + ms("1m") || Date.now() + ms("1m"),
      },
    })
    .eq("id", userId);

  res.status(200).json({ success: true });
});

export default router;

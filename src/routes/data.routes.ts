import express from "express";
import { Request, Response } from "express";
import { verify } from "hcaptcha";
import { hasVoted } from "../modules/top-gg.js";
import { generateKey } from "../modules/keys.js";
import turnstile from "../middlewares/captchas/turnstile.js";
import key from "../middlewares/key.js";
import supabase from "../modules/supabase.js";

const router = express.Router();

router.get("/user/:id", key, async (req, res) => {
  let { id } = req.params;

  let { data: user, error } = await supabase
    .from("users_new")
    .select("*")
    .eq("id", id);
  if (error) return res.json({ error: error.message }).status(400);
  if (!user[0]) return res.json({ error: "user not found" }).status(400);
  res.json(user[0]).status(200);
});
router.put("/user/:id", key, async (req, res) => {
  let { id } = req.params;
  let { data: user, error } = await supabase

    .from("users_new")
    .update(req.body)
    .eq("id", id)
    .select("*");
  if (error) return res.json({ error: error.message }).status(400);
  res.json(user[0]).status(200);
});

router.post("/user/:id", key, async (req, res) => {
  let { id } = req.params;
  let { data: user, error } = await supabase

    .from("users_new")
    .insert({
      id,
      ...req.body,
    })
    .select("*");
  if (error) return res.json({ error: error.message }).status(400);
  res.json(user[0]).status(200);
});
export default router;

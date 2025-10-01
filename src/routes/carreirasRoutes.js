import express from "express";
import { listarVeiculos12E } from "../controllers/carreirasController.js";

const router = express.Router();

router.get("/12E/veiculos", listarVeiculos12E);

export default router;
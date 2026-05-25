import "dotenv/config";
import cors from "cors";
import express from "express";
import aiRoutes from "./routes/ai.js";
import studyRoutes from "./routes/study.js";
import "./db/client.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN;

const corsOptions = frontendOrigin
  ? {
      origin: frontendOrigin.split(",").map((value) => value.trim()),
    }
  : undefined;

app.use(cors(corsOptions));
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/study", studyRoutes);
app.use("/api/ai", aiRoutes);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

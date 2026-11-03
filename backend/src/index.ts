import { config } from "./lib/config.js";
import { createApp } from "./app.js";

const app = createApp();

const allowAllOrigins = config.frontendUrl.trim() === "*";
const allowedOrigins = allowAllOrigins
  ? []
  : config.frontendUrl
      .split(",")
      .map((url) => url.trim().replace(/\/$/, ""))
      .filter(Boolean);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(
    allowAllOrigins
      ? "CORS: all origins allowed"
      : `CORS allowed origins: ${allowedOrigins.join(", ")}`,
  );
});

export default app;

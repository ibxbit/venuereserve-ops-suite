import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 4000),
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "studio_local",
  },
};

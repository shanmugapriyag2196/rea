const path = require("path");
const express = require("express");
const app = require("../local-deploy-platform/server");

// Serve the dashboard UI for Vercel deployments (API is handled by server routes).
const publicDir = path.join(__dirname, "..", "local-deploy-platform", "public");
app.use(express.static(publicDir));
app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

module.exports = app;

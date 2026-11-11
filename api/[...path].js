const express = require("express");
const app = require("../local-deploy-platform/server");
module.exports = (req, res) => app(req, res);
